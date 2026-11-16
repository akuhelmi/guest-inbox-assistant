"""New guest message (D22): templates, AI parsing, fallback and the API."""

import pytest
from fastapi.testclient import TestClient

from app.claude_cli import ClaudeCliError
from app.compose import (
    ClaudeComposer,
    Composed,
    ComposeError,
    ComposeInput,
    FallbackComposer,
    PropertyRef,
    TemplateComposer,
    looks_pasted,
    parse_data,
)
from app.main import create_app
from app.triage.offline import OfflineTriager
from tests.conftest import make_settings

PROPS = (
    PropertyRef(1, "Bangsar Loft", "Bangsar, Kuala Lumpur"),
    PropertyRef(2, "Garden Terrace House", "Petaling Jaya"),
    PropertyRef(3, "Skyline Studio 12B", "KLCC, Kuala Lumpur"),
)


def brief(text: str, property_id: int | None = None) -> ComposeInput:
    return ComposeInput(brief=text, properties=PROPS, property_id=property_id)


def test_templates_follow_the_brief():
    made = TemplateComposer().compose(
        brief("angry guest at Skyline Studio, aircon broken, booked on Booking.com")
    )
    assert made.property_id == 3 and made.channel == "booking"
    assert "aircon" in made.body and "disappointing" in made.body
    assert made.guest_name and made.by == "rules" and not made.pasted


def test_templates_default_to_the_first_property_and_a_general_question():
    made = TemplateComposer().compose(brief("a guest with a question"))
    assert made.property_id == 1 and made.channel == "airbnb"
    assert made.body.startswith("Hi, quick question")


def test_a_pasted_guest_message_is_used_as_it_is():
    text = "Hi, we're outside and the door code doesn't work. Help!"
    assert looks_pasted(text)
    assert not looks_pasted("a guest asks for the wifi password")
    made = TemplateComposer().compose(brief(text, property_id=2))
    assert made.pasted and made.body == text and made.property_id == 2


def test_ai_answer_is_checked():
    data = {
        "guest_name": "  Nur   Iman ",
        "property_id": 99,
        "channel": "fax",
        "body": " Aircon rosak. ",
        "pasted": False,
    }
    made = parse_data(data, brief("aircon at Garden Terrace in Malay"), by="claude")
    assert made.guest_name == "Nur Iman" and made.body == "Aircon rosak."
    assert made.property_id == 2  # unknown id: falls back to the property the brief names
    assert made.channel == "airbnb"
    pinned = parse_data({**data, "property_id": 3}, brief("x", property_id=1), by="claude")
    assert pinned.property_id == 1  # the host's pick wins
    with pytest.raises(ComposeError):
        parse_data({**data, "body": " "}, brief("x"), by="claude")
    with pytest.raises(ComposeError):
        parse_data(["not", "an", "object"], brief("x"), by="claude")


def test_claude_composer_and_fallback():
    def ok(prompt, schema, **kwargs):
        assert "Host's brief: noisy neighbours" in prompt
        return {
            "guest_name": "Ana Ruiz",
            "property_id": 1,
            "channel": "direct",
            "body": "The neighbours are very loud.",
            "pasted": False,
        }

    def broken(*args, **kwargs):
        raise ClaudeCliError("timed out")

    made = ClaudeComposer("m", run=ok).compose(brief("noisy neighbours"))
    assert made.by == "claude" and made.channel == "direct"
    fell = FallbackComposer(ClaudeComposer("m", run=broken)).compose(brief("noisy neighbours"))
    assert fell.by == "rules (fallback)" and "loud" in fell.body


class StubComposer:
    name = "stub"

    def compose(self, item):
        return Composed(
            guest_name="Stub Guest",
            property_id=item.properties[-1].id,
            channel="booking",
            body="Hi, the wifi is not working.",
            by="stub",
        )


def make_client(composer=None, **settings):
    app = create_app(make_settings(**settings), triager=OfflineTriager(), composer=composer)
    return app, TestClient(app)


def drop(app):
    from app.db import Base

    Base.metadata.drop_all(app.state.engine)
    app.state.engine.dispose()


def test_compose_api_returns_a_sorted_message_and_stores_nothing(client):
    before = len(client.get("/api/messages").json())
    data = client.post(
        "/api/compose", json={"brief": "locked out at Skyline Studio, on WhatsApp"}
    ).json()
    m = data["message"]
    assert m["id"] == 0 and m["property_name"] == "Skyline Studio 12B"
    assert m["channel"] == "direct" and m["status"] == "new"
    assert m["triage"]["category"] == "check_in" and m["triage"]["draft_reply"]
    assert data["by"] == "rules" and data["ai_left_today"] is None
    assert len(client.get("/api/messages").json()) == before
    assert client.post("/api/compose", json={"brief": "  "}).status_code == 422
    bad = client.post("/api/compose", json={"brief": "x", "property_id": 999})
    assert bad.status_code == 422


def test_compose_counts_as_an_ai_reply_and_falls_back_over_the_limit():
    app, c = make_client(StubComposer(), agent_limit_per_day=1)
    with c:
        first = c.post("/api/compose", json={"brief": "wifi problem"}).json()
        assert first["by"] == "stub" and first["ai_left_today"] == 0
        assert first["message"]["guest_name"] == "Stub Guest"
        second = c.post("/api/compose", json={"brief": "wifi problem"}).json()
        assert second["by"] == "rules" and "used today's 1 AI replies" in second["note"]
    drop(app)


def test_agent_sees_messages_the_visitor_added(client):
    extra = {
        "id": -1,
        "guest_name": "Ana Ruiz",
        "property_id": client.get("/api/properties").json()[0]["id"],
        "category": "maintenance",
        "urgent": True,
        "body": "Water leaking under the sink.",
        "draft_reply": "Hi Ana, sorry! Someone is on the way.",
        "task_title": "Fix leak",
        "task_assignee": "maintenance",
        "task_due_minutes": 30,
    }
    data = client.post("/api/agent", json={"message_id": -1, "extra": [extra]}).json()
    assert data["focus"] == -1
    assert [c["kind"] for c in data["cards"]] == ["draft", "task", "status"]
    assert data["cards"][0]["guest_name"] == "Ana Ruiz"
    # Positive ids are refused: they could clash with saved messages.
    bad = client.post("/api/agent", json={"message_id": 1, "extra": [{**extra, "id": 5}]})
    assert bad.status_code == 422
