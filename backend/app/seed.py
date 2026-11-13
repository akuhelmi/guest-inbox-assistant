"""Create the tables and load the fake demo data.

Usage:  python -m app.seed          (seed only if the database is empty)
        python -m app.seed --reset  (wipe the demo data and seed again)
"""

import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import load_settings
from .db import Base, make_engine, make_session_factory
from .models import Message, Property, RateHit
from .seed_data import MESSAGES, PROPERTIES

SAVED = "saved example"


def seed(session: Session, now: datetime | None = None) -> int:
    """Insert the demo data. Returns the number of messages added."""
    now = (now or datetime.now(timezone.utc)).replace(tzinfo=None, microsecond=0)
    props = {}
    for p in PROPERTIES:
        prop = Property(name=p["name"], city=p["city"])
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
            )
        )
    session.commit()
    return len(MESSAGES)


def seed_if_empty(session: Session) -> int:
    if session.scalar(select(func.count()).select_from(Message)):
        return 0
    return seed(session)


def reset(session: Session) -> int:
    session.query(Message).delete()
    session.query(Property).delete()
    session.query(RateHit).delete()
    session.commit()
    return seed(session)


def main(argv: list[str]) -> None:
    engine = make_engine(load_settings().database_url)
    Base.metadata.create_all(engine)
    with make_session_factory(engine)() as session:
        added = reset(session) if "--reset" in argv else seed_if_empty(session)
    print(f"Seeded {added} messages." if added else "Database already has data; nothing added.")


if __name__ == "__main__":
    main(sys.argv[1:])
