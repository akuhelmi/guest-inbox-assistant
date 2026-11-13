from datetime import datetime

from app.ratelimit import check_and_count
from app.seed_data import MESSAGES


def test_health_and_meta(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    meta = client.get("/api/meta").json()
    assert meta["provider"] == "offline"
    assert list(meta["categories"]) == [
        "check_in",
        "complaint",
        "maintenance",
        "booking_change",
        "general_question",
    ]


def test_inbox_lists_all_seed_messages_urgent_first(client):
    items = client.get("/api/messages").json()
    assert len(items) == len(MESSAGES)
    flags = [m["triage"]["urgent"] for m in items]
    assert flags == sorted(flags, reverse=True)  # all urgent ones come first
    urgent = [m for m in items if m["triage"]["urgent"]]
    times = [m["received_at"] for m in urgent]
    assert times == sorted(times, reverse=True)  # newest first within a group
    first = items[0]
    assert first["property_name"] and first["triage"]["category_label"]
    assert first["triage"]["triaged_by"] == "saved example"


def test_filter_by_category_and_urgent(client):
    items = client.get("/api/messages", params={"category": "maintenance"}).json()
    assert items and all(m["triage"]["category"] == "maintenance" for m in items)
    urgent = client.get("/api/messages", params={"urgent": "true"}).json()
    assert len(urgent) == sum(m["urgent"] for m in MESSAGES)
    assert client.get("/api/messages", params={"category": "spam"}).status_code == 400


def test_get_one_message_and_404(client):
    first = client.get("/api/messages").json()[0]
    assert client.get(f"/api/messages/{first['id']}").json()["body"] == first["body"]
    assert client.get("/api/messages/99999").status_code == 404


def test_paste_triage_returns_result_and_is_not_stored(client):
    res = client.post("/api/triage", json={"body": "The aircon is broken", "guest_name": "Li Wei"})
    assert res.status_code == 200
    data = res.json()
    assert data["triage"]["category"] == "maintenance"
    assert data["triage"]["draft_reply"].startswith("Hi Li,")
    assert data["calls_left_this_hour"] == 4
    assert len(client.get("/api/messages").json()) == len(MESSAGES)


def test_paste_triage_validates_length(client):
    assert client.post("/api/triage", json={"body": "   "}).status_code == 422
    assert client.post("/api/triage", json={"body": "x" * 1001}).status_code == 422
    assert client.post("/api/triage", json={"body": "x" * 1000}).status_code == 200


def test_rate_limit_blocks_after_hourly_quota(client):
    for _ in range(5):
        assert client.post("/api/triage", json={"body": "Hello"}).status_code == 200
    blocked = client.post("/api/triage", json={"body": "Hello"})
    assert blocked.status_code == 429
    assert "limit" in blocked.json()["detail"]
    # Another visitor still has their own quota.
    other = client.post(
        "/api/triage", json={"body": "Hello"}, headers={"x-forwarded-for": "203.0.113.9"}
    )
    assert other.status_code == 200


def test_retriage_saved_message_does_not_change_it(client):
    first = client.get("/api/messages").json()[0]
    res = client.post(f"/api/messages/{first['id']}/triage")
    assert res.status_code == 200
    assert res.json()["triage"]["triaged_by"] == "offline"
    again = client.get(f"/api/messages/{first['id']}").json()
    assert again["triage"] == first["triage"]
    assert client.post("/api/messages/99999/triage").status_code == 404


def test_rate_window_resets_next_hour(client):
    from sqlalchemy.orm import Session

    client.get("/api/messages")  # first request creates the tables
    with Session(client.app.state.engine) as session:
        t1 = datetime(2026, 1, 1, 10, 5)
        assert check_and_count(session, "v", 1, now=t1) == (True, 0)
        assert check_and_count(session, "v", 1, now=t1) == (False, 0)
        assert check_and_count(session, "v", 1, now=datetime(2026, 1, 1, 11, 0))[0] is True
