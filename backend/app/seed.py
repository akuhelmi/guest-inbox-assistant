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
DATA_VERSION = "2"

# Tables kept across data versions: everything else is demo data and gets rebuilt.
KEPT_TABLES = {AppMeta.__tablename__, RateHit.__tablename__}


def demo_tables() -> list:
    return [t for t in Base.metadata.sorted_tables if t.name not in KEPT_TABLES]


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
        session.add(
            Message(
                property_id=props[m["property"]].id,
                guest_name=m["guest"],
                received_at=now - timedelta(minutes=m["minutes_ago"]),
                body=m["body"],
                category=m["category"],
                urgent=m["urgent"],
                reason=m["reason"],
                draft_reply=m["draft"],
                triaged_by=SAVED,
                language=m.get("language", "en"),
                confidence=m.get("confidence", "medium"),
                facts_used=list(m.get("facts_used", [])),
            )
        )
    session.commit()
    return len(MESSAGES)


def stored_version(session: Session) -> str | None:
    row = session.get(AppMeta, "data_version")
    return row.value if row else None


def rebuild(engine: Engine, factory: sessionmaker[Session]) -> int:
    """Drop and recreate the demo tables, seed them and record DATA_VERSION."""
    Base.metadata.drop_all(engine, tables=demo_tables())
    Base.metadata.create_all(engine)
    with factory() as session:
        added = seed(session)
        row = session.get(AppMeta, "data_version")
        if row is None:
            session.add(AppMeta(key="data_version", value=DATA_VERSION))
        else:
            row.value = DATA_VERSION
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
