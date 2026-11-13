"""Shared types for every triage provider."""

from dataclasses import dataclass
from typing import Protocol

CATEGORIES: tuple[str, ...] = (
    "check_in",
    "complaint",
    "maintenance",
    "booking_change",
    "general_question",
)

CATEGORY_LABELS: dict[str, str] = {
    "check_in": "Check-in",
    "complaint": "Complaint",
    "maintenance": "Maintenance",
    "booking_change": "Booking change",
    "general_question": "General question",
}


@dataclass(frozen=True)
class TriageInput:
    body: str
    guest_name: str = "there"
    property_name: str = "your stay"


@dataclass(frozen=True)
class TriageResult:
    category: str
    urgent: bool
    reason: str
    draft_reply: str
    triaged_by: str


class TriageError(Exception):
    """A provider could not produce a valid result (network, quota, bad output)."""


class Triager(Protocol):
    name: str

    def triage(self, item: TriageInput) -> TriageResult: ...


def first_name(full_name: str) -> str:
    name = full_name.strip().split(" ")[0] if full_name.strip() else ""
    return name or "there"
