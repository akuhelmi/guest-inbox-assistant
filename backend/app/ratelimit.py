"""Per-visitor hourly limit for live triage calls, stored in the database.

A database counter (not process memory) holds across serverless instances. Visitors are
identified by a salted SHA-256 of their IP, so no raw IP address is ever stored.
"""

import hashlib
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .models import RateHit


def visitor_hash(ip: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}:{ip}".encode()).hexdigest()


def current_window(now: datetime | None = None) -> datetime:
    now = now or datetime.now(timezone.utc)
    return now.replace(minute=0, second=0, microsecond=0, tzinfo=None)


def check_and_count(
    session: Session, visitor: str, limit: int, now: datetime | None = None
) -> tuple[bool, int]:
    """Count one call. Returns (allowed, calls left this hour)."""
    window = current_window(now)
    hit = session.get(RateHit, (visitor, window))
    used = hit.count if hit else 0
    if used >= limit:
        return False, 0
    if hit is None:
        session.add(RateHit(visitor_hash=visitor, window_start=window, count=1))
    else:
        hit.count = used + 1
    # Old windows are useless: drop anything older than a day.
    session.execute(delete(RateHit).where(RateHit.window_start < window - timedelta(days=1)))
    session.commit()
    return True, limit - used - 1


def used_this_hour(session: Session, visitor: str, now: datetime | None = None) -> int:
    hit = session.scalar(
        select(RateHit).where(
            RateHit.visitor_hash == visitor, RateHit.window_start == current_window(now)
        )
    )
    return hit.count if hit else 0
