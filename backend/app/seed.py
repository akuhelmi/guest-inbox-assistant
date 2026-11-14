"""Create the tables and load the fake demo data.

The demo tables (properties, messages, ...) hold only seeded, invented data. When a deploy
brings a newer DATA_VERSION, they are dropped, rebuilt and seeded again, so the live database
follows the code without manual SQL. The rate-limit counters are kept.

Usage:  python -m app.seed          (set up or upgrade if needed)
        python -m app.seed --reset  (rebuild the demo data now)
"""

import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import Engine, select
from sqlalchemy.orm import Session, sessionmaker

from .config import load_settings
from .db import Base, make_engine, make_session_factory
from .models import AppMeta, Message, Property, RateHit
from .seed_data import MESSAGES, PROPERTIES

SAVED = "saved example"

# Bump whenever the demo tables or the seed data change shape.
DATA_VERSION = "3"  # 3: tasks, starting status, seeded_at

# Tables kept across data versions: everything else is demo data and gets rebuilt.
KEPT_TABLES = {AppMeta.__tablename__, RateHit.__tablename__}


def demo_tables() -> list:
    return [t for t in Base.metadata.sorted_tables if t.name not in KEPT_TABLES]


def starting_status(m: dict) -> tuple[str, int]:
    """(status, minutes until the host replied) for a seeded message.

    Recent messages are still new; older ones were already answered (and the oldest closed),
    like a real inbox mid-shift. Reply times vary a little so averages look natural.
    """
    age = m["minutes_ago"]
    if age < 180:
        return "new", 0
    replied_after = 6 + (sum(map(ord, m["guest"])) % 9) * 5  # 6 to 46 minutes
    return ("done" if age >= 840 else "replied"), min(replied_after, age)


def seed(session: Session, now: datetime | None = None) -> int:
    """Insert the demo data. Returns the number of messages added."""
    now = (now or datetime.now(timezone.utc)).replace(tzinfo=None, microsecond=0)
    props = {}
    for p in PROPERTIES:
        prop = Property(name=p["name"], city=p["city"], facts=dict(p["facts"]))
        session.add(prop)
        props[p["key"]] = prop
    session.flush()
    for m in MESSAGES:
        status, replied_after = starting_status(m)
        received = now - timedelta(minutes=m["minutes_ago"])
        session.add(
            Message(
                status=status,
                replied_at=received + timedelta(minutes=replied_after) if replied_after else None,
                property_id=props[m["property"]].id,
                guest_name=m["guest"],
                received_at=received,
                body=m["body"],
                category=m["category"],
                urgent=m["urgent"],
                reason=m["reason"],
                draft_reply=m["draft"],
                triaged_by=SAVED,
                language=m.get("language", "en"),
                confidence=m.get("confidence", "medium"),
                facts_used=list(m.get("facts_used", [])),
                task_title=m.get("task", {}).get("title", ""),
                task_assignee=m.get("task", {}).get("assignee", ""),
                task_due_minutes=m.get("task", {}).get("due_minutes", 0),
            )
        )
    session.commit()
    return len(MESSAGES)


def stored_version(session: Session) -> str | None:
    row = session.get(AppMeta, "data_version")
    return row.value if row else None


def _set_meta(session: Session, key: str, value: str) -> None:
    row = session.get(AppMeta, key)
    if row is None:
        session.add(AppMeta(key=key, value=value))
    else:
        row.value = value


def demo_clock_offset(session: Session, now: datetime | None = None) -> timedelta:
    """How long ago the demo data was seeded.

    Saved examples are shown shifted by this, so "6 min ago" stays 6 minutes however long ago
    the data was loaded, and reply-time tracking keeps making sense on the live demo.
    """
    row = session.get(AppMeta, "seeded_at")
    if row is None:
        return timedelta(0)
    now = (now or datetime.now(timezone.utc)).replace(tzinfo=None)
    try:
        return max(now - datetime.fromisoformat(row.value), timedelta(0))
    except ValueError:
        return timedelta(0)


def rebuild(engine: Engine, factory: sessionmaker[Session]) -> int:
    """Drop and recreate the demo tables, seed them and record DATA_VERSION."""
    Base.metadata.drop_all(engine, tables=demo_tables())
    Base.metadata.create_all(engine)
    now = datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)
    with factory() as session:
        added = seed(session, now)
        _set_meta(session, "data_version", DATA_VERSION)
        _set_meta(session, "seeded_at", now.isoformat())
        session.commit()
    return added


def ensure_data(engine: Engine, factory: sessionmaker[Session]) -> int:
    """Set up or upgrade the demo data if needed. Returns the number of messages seeded."""
    Base.metadata.create_all(engine, tables=[AppMeta.__table__, RateHit.__table__])
    with factory() as session:
        current = stored_version(session)
        has_messages = (
            current is not None and session.scalar(select(Message.id).limit(1)) is not None
        )
    if current == DATA_VERSION and has_messages:
        return 0
    return rebuild(engine, factory)


def main(argv: list[str]) -> None:
    engine = make_engine(load_settings().database_url)
    factory = make_session_factory(engine)
    added = rebuild(engine, factory) if "--reset" in argv else ensure_data(engine, factory)
    print(f"Seeded {added} messages." if added else "Demo data is current; nothing added.")


if __name__ == "__main__":
    main(sys.argv[1:])
