"""Tables: properties, guest messages with their saved triage, and rate-limit counters."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(80))

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

    property: Mapped[Property] = relationship(back_populates="messages")


class RateHit(Base):
    """Live triage calls per visitor per hour. The key is a salted hash, never the raw IP."""

    __tablename__ = "rate_hits"

    visitor_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime, primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)
