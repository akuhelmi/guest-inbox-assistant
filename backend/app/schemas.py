"""API request and response shapes."""

from datetime import datetime

from pydantic import BaseModel, Field


class TriageOut(BaseModel):
    category: str
    category_label: str
    urgent: bool
    reason: str
    draft_reply: str
    triaged_by: str


class MessageOut(BaseModel):
    id: int
    guest_name: str
    property_name: str
    property_city: str
    received_at: datetime
    body: str
    triage: TriageOut


class TriageRequest(BaseModel):
    body: str = Field(min_length=1)
    guest_name: str = Field(default="Guest", max_length=80)


class LiveTriageOut(BaseModel):
    triage: TriageOut
    calls_left_this_hour: int


class MetaOut(BaseModel):
    provider: str
    categories: dict[str, str]
    max_message_chars: int
    rate_limit_per_hour: int
