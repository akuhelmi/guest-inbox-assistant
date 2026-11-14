from datetime import datetime

from fastapi.testclient import TestClient

from app.main import create_app
from app.ratelimit import check_and_count
from app.seed_data import MESSAGES, PROPERTIES
from app.triage.offline import OfflineTriager
from tests.conftest import TEST_DB, make_settings


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


def test_properties_list_their_fact_sheets(client):
    props = client.get("/api/properties").json()
    assert [p["name"] for p in props] == [p["name"] for p in PROPERTIES]
    seaview = props[0]
    wifi = next(f for f in seaview["facts"] if f["key"] == "wifi")
    assert wifi["label"] == "Wi-Fi" and "seaview2026" in wifi["value"]


def test_messages_carry_language_confidence_and_facts_used(client):
    msgs = {m["guest_name"]: m for m in client.get("/api/messages").json()}
    wang = msgs["Wang Li"]["triage"]
    assert wang["language"] == "zh" and wang["language_label"] == "Chinese"
    assert wang["facts_used"] == [{"key": "wifi", "label": "Wi-Fi"}]
    assert wang["needs_host"] is False
    grace = msgs["Grace Okafor"]["triage"]
    assert grace["confidence"] == "low" and grace["needs_host"] is True
    assert msgs["Wang Li"]["property_id"] == msgs["Farid Ismail"]["property_id"]


def test_paste_triage_uses_the_chosen_propertys_facts(client):
    garden = client.get("/api/properties").json()[1]
    res = client.post(
        "/api/triage",
        json={
            "body": "What's the wifi password?",
            "guest_name": "Ana",
            "property_id": garden["id"],
        },
    )
    triage = res.json()["triage"]
    assert "tehtarik88" in triage["draft_reply"]
    assert triage["facts_used"] == [{"key": "wifi", "label": "Wi-Fi"}]
    # Without a property there are no facts, so it says it will check.
    plain = client.post("/api/triage", json={"body": "What's the wifi password?"}).json()
    assert plain["triage"]["facts_used"] == [] and plain["triage"]["needs_host"] is True
    unknown = client.post("/api/triage", json={"body": "Hi", "property_id": 99999})
    assert unknown.status_code == 422


def test_old_database_is_upgraded_and_rate_counters_are_kept(tmp_path):
    """A v1 database (no data version, old columns) is rebuilt on the first request."""
    from sqlalchemy import Column, Integer, MetaData, String, Table, insert, inspect

    from app.config import normalize_db_url
    from app.db import Base, make_engine
    from app.models import RateHit
    from app.seed import DATA_VERSION

    # In-memory SQLite lives per engine, so use a file here; Postgres (CI) is shared anyway.
    url = f"sqlite:///{tmp_path}/old.db" if TEST_DB.startswith("sqlite") else TEST_DB
    settings = make_settings(database_url=normalize_db_url(url))
    engine = make_engine(settings.database_url)
    Base.metadata.drop_all(engine)
    old = MetaData()
    Table("properties", old, Column("id", Integer, primary_key=True), Column("name", String(120)))
    old.create_all(engine)
    RateHit.__table__.create(engine)
    with engine.begin() as conn:
        conn.execute(insert(old.tables["properties"]).values(name="Old"))
        conn.execute(
            insert(RateHit.__table__).values(
                visitor_hash="v1", window_start=datetime(2026, 1, 1, 10), count=3
            )
        )
    engine.dispose()

    app = create_app(settings, triager=OfflineTriager())
    try:
        with TestClient(app) as c:
            assert len(c.get("/api/messages").json()) == len(MESSAGES)
            names = [p["name"] for p in c.get("/api/properties").json()]
            assert "Old" not in names
        eng = app.state.engine
        assert "facts" in {col["name"] for col in inspect(eng).get_columns("properties")}
        with eng.connect() as conn:
            assert conn.execute(RateHit.__table__.select()).first().count == 3
            meta = conn.exec_driver_sql("SELECT value FROM app_meta").scalar()
            assert meta == DATA_VERSION
    finally:
        Base.metadata.drop_all(app.state.engine)
        app.state.engine.dispose()
