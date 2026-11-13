import json

import httpx
import pytest

from app.config import Settings, load_settings, normalize_db_url
from app.triage import FallbackTriager, TriageError, TriageInput, build_triager
from app.triage.gemini import GeminiTriager, parse_response
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
        TriageInput("No hot water", "Ana Costa", "Seaview Loft")
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
