import json

import httpx
import pytest

from app.config import Settings, load_settings, normalize_db_url
from app.triage import FallbackTriager, TriageError, TriageInput, build_triager
from app.triage.gemini import PROMPT, GeminiTriager, parse_response
from app.triage.offline import OfflineTriager


def gemini_payload(data: dict) -> dict:
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(data)}]}}]}


GOOD = {
    "category": "maintenance",
    "urgent": True,
    "reason": "No hot water.",
    "draft_reply": "Hi Ana, our plumber is on the way.",
}


def mock_client(status: int, payload: dict | None = None) -> tuple[httpx.Client, list]:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(status, json=payload or {})

    return httpx.Client(transport=httpx.MockTransport(handler)), seen


def test_parse_response_accepts_valid_json():
    assert parse_response(gemini_payload(GOOD))["category"] == "maintenance"


@pytest.mark.parametrize(
    "bad",
    [
        {},
        gemini_payload({**GOOD, "category": "spam"}),
        gemini_payload({**GOOD, "urgent": "yes"}),
        gemini_payload({**GOOD, "draft_reply": " "}),
        {"candidates": [{"content": {"parts": [{"text": "not json"}]}}]},
    ],
)
def test_parse_response_rejects_bad_output(bad):
    with pytest.raises(TriageError):
        parse_response(bad)


def test_gemini_triager_sends_key_in_header_and_returns_result():
    client, seen = mock_client(200, gemini_payload(GOOD))
    result = GeminiTriager("test-key", "gemini-x", client=client).triage(
        TriageInput("No hot water", "Ana Costa", "Bangsar Loft")
    )
    assert result.category == "maintenance" and result.urgent
    assert result.triaged_by == "gemini"
    assert seen[0].headers["x-goog-api-key"] == "test-key"
    assert "key=" not in str(seen[0].url)  # the key never goes in the URL
    assert "gemini-x" in str(seen[0].url)


def test_gemini_http_error_raises():
    client, _ = mock_client(429)
    with pytest.raises(TriageError):
        GeminiTriager("k", "m", client=client).triage(TriageInput("hi"))


def test_gemini_http_error_includes_googles_message():
    client, _ = mock_client(404, {"error": {"message": "models/m is not found"}})
    with pytest.raises(TriageError, match=r"HTTP 404: models/m is not found"):
        GeminiTriager("k", "m", client=client).triage(TriageInput("hi"))


def test_prompt_forbids_a_made_up_signature():
    assert "Do not sign off with a name" in PROMPT


def test_default_model_is_current():
    assert Settings().gemini_model == "gemini-3.5-flash-lite"


def test_fallback_uses_offline_rules_when_provider_fails():
    client, _ = mock_client(503)
    triager = FallbackTriager(GeminiTriager("k", "m", client=client))
    result = triager.triage(TriageInput("We are locked out!", "Sam"))
    assert result.triaged_by == "offline (fallback)"
    assert result.urgent


def test_build_triager_switch():
    assert isinstance(build_triager(Settings()), OfflineTriager)
    assert isinstance(build_triager(Settings(llm_provider="gemini")), OfflineTriager)  # no key
    assert isinstance(build_triager(Settings(llm_provider="unknown")), OfflineTriager)
    t = build_triager(Settings(llm_provider="gemini", gemini_api_key="k"))
    assert isinstance(t, FallbackTriager) and t.name == "gemini"


def test_gemini_requires_a_key():
    with pytest.raises(TriageError):
        GeminiTriager("", "m")


@pytest.mark.parametrize(
    "url, expected",
    [
        ("postgres://u:p@h:5432/db", "postgresql+psycopg://u:p@h:5432/db"),
        ("postgresql://u:p@h/db", "postgresql+psycopg://u:p@h/db"),
        ("sqlite:///./x.db", "sqlite:///./x.db"),
    ],
)
def test_normalize_db_url(url, expected):
    assert normalize_db_url(url) == expected


def test_default_database_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    assert load_settings().database_url == "sqlite:///./guest_inbox.db"
    monkeypatch.setenv("VERCEL", "1")
    assert load_settings().database_url == "sqlite:////tmp/guest_inbox.db"
    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@h/db")
    assert load_settings().database_url == "postgresql+psycopg://u:p@h/db"


def test_prompt_sends_the_property_facts_and_language_rule():
    client, seen = mock_client(200, gemini_payload(GOOD))
    facts = {"wifi": "Network X, password abc123"}
    GeminiTriager("k", "m", client=client).triage(TriageInput("wifi?", "Ana", "Bangsar", facts))
    text = json.loads(seen[0].content)["contents"][0]["parts"][0]["text"]
    assert "- wifi: Network X, password abc123" in text
    assert "SAME language" in text
    assert "Never invent" in text


def test_gemini_result_keeps_language_confidence_and_only_known_facts():
    data = {**GOOD, "language": "FR", "confidence": "high", "facts_used": ["wifi", "pool", "wifi"]}
    client, _ = mock_client(200, gemini_payload(data))
    result = GeminiTriager("k", "m", client=client).triage(
        TriageInput("Le wifi?", "Ana", "Bangsar", {"wifi": "abc"})
    )
    assert result.language == "fr"
    assert result.confidence == "high"
    assert result.facts_used == ("wifi",)


def test_parse_response_softens_missing_new_fields():
    data = parse_response(gemini_payload(GOOD))
    assert data["language"] == "en"
    assert data["confidence"] == "low"
    assert data["facts_used"] == []


def test_fallback_keeps_offline_language_and_confidence():
    class Broken:
        name = "gemini"

        def triage(self, item):
            raise TriageError("quota")

    result = FallbackTriager(Broken()).triage(TriageInput("Bonjour, merci pour la chambre", "Ana"))
    assert result.triaged_by == "offline (fallback)"
    assert result.language == "fr" and result.confidence == "low"


def test_gemini_task_is_checked():
    good = {**GOOD, "task_title": "Plumber", "task_assignee": "maintenance", "task_due_minutes": 2}
    data = parse_response(gemini_payload(good))
    assert (data["task_title"], data["task_assignee"], data["task_due_minutes"]) == (
        "Plumber",
        "maintenance",
        5,
    )
    none = parse_response(gemini_payload({**GOOD, "task_title": "x", "task_assignee": "none"}))
    assert (none["task_title"], none["task_assignee"], none["task_due_minutes"]) == ("", "", 0)
    assert "suggest ONE task" in PROMPT
