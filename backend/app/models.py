"""Tables: properties (with fact sheets), guest messages with their saved triage, rate-limit
counters and a small key/value table that records the demo data version."""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(80))
    # Fact sheet: key (see triage.FACT_LABELS) -> value. Drafts may only use these facts.
    facts: Mapped[dict] = mapped_column(JSON, default=dict)

    messages: Mapped[list["Message"]] = relationship(back_populates="property")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"))
    guest_name: Mapped[str] = mapped_column(String(80))
    received_at: Mapped[datetime] = mapped_column(DateTime)
    body: Mapped[str] = mapped_column(Text)

    # Saved triage, so the inbox loads without calling the LLM.
    category: Mapped[str] = mapped_column(String(32))
    urgent: Mapped[bool] = mapped_column(Boolean, default=False)
    reason: Mapped[str] = mapped_column(String(300))
    draft_reply: Mapped[str] = mapped_column(Text)
    triaged_by: Mapped[str] = mapped_column(String(40))
    language: Mapped[str] = mapped_column(String(8), default="en")
    # Where the guest wrote from: airbnb, booking or direct (fake, for the demo).
    channel: Mapped[str] = mapped_column(String(16), default="airbnb")
    confidence: Mapped[str] = mapped_column(String(8), default="medium")
    facts_used: Mapped[list] = mapped_column(JSON, default=list)
    task_title: Mapped[str] = mapped_column(String(120), default="")
    task_assignee: Mapped[str] = mapped_column(String(16), default="")
    task_due_minutes: Mapped[int] = mapped_column(Integer, default=0)
    # Starting status for the demo (each visitor's own changes stay in their browser).
    status: Mapped[str] = mapped_column(String(16), default="new")
    replied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)

    property: Mapped[Property] = relationship(back_populates="messages")


class RateHit(Base):
    """Live triage calls per visitor per hour. The key is a salted hash, never the raw IP."""

    __tablename__ = "rate_hits"

    visitor_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime, primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)


class AppMeta(Base):
    """Key/value settings kept in the database, e.g. the demo data version."""

    __tablename__ = "app_meta"

    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[str] = mapped_column(String(200))
