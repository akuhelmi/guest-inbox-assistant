"""API request and response shapes."""

from datetime import datetime

from pydantic import BaseModel, Field


class FactOut(BaseModel):
    key: str
    label: str
    value: str


class FactRef(BaseModel):
    key: str
    label: str


class TriageOut(BaseModel):
    category: str
    category_label: str
    urgent: bool
    reason: str
    draft_reply: str
    triaged_by: str
    language: str
    language_label: str
    confidence: str
    needs_host: bool
    facts_used: list[FactRef]


class PropertyOut(BaseModel):
    id: int
    name: str
    city: str
    facts: list[FactOut]


class MessageOut(BaseModel):
    id: int
    guest_name: str
    property_id: int
    property_name: str
    property_city: str
    received_at: datetime
    body: str
    triage: TriageOut


class TriageRequest(BaseModel):
    body: str = Field(min_length=1)
    guest_name: str = Field(default="Guest", max_length=80)
    property_id: int | None = None


class LiveTriageOut(BaseModel):
    triage: TriageOut
    calls_left_this_hour: int


class MetaOut(BaseModel):
    provider: str
    categories: dict[str, str]
    max_message_chars: int
    rate_limit_per_hour: int
