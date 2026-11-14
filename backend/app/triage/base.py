"""Shared types for every triage provider."""

from dataclasses import dataclass, field
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


CONFIDENCE_LEVELS: tuple[str, ...] = ("high", "medium", "low")

# Property fact sheet keys, in display order. Drafts may only use facts from this sheet.
FACT_LABELS: dict[str, str] = {
    "check_in": "Check-in",
    "check_out": "Check-out",
    "wifi": "Wi-Fi",
    "parking": "Parking",
    "house_rules": "House rules",
    "pets": "Pets",
    "max_guests": "Guests",
    "cancellation": "Cancellation",
    "utilities": "Utilities",
    "caretaker": "Caretaker",
    "nearby": "Nearby",
}

LANGUAGE_LABELS: dict[str, str] = {
    "en": "English",
    "ms": "Malay",
    "zh": "Chinese",
    "fr": "French",
    "es": "Spanish",
    "de": "German",
    "ja": "Japanese",
    "ko": "Korean",
    "id": "Indonesian",
    "ar": "Arabic",
    "th": "Thai",
}


def language_label(code: str) -> str:
    return LANGUAGE_LABELS.get(code, code.upper() or "Unknown")


@dataclass(frozen=True)
class TriageInput:
    body: str
    guest_name: str = "there"
    property_name: str = "our property"
    facts: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class TriageResult:
    category: str
    urgent: bool
    reason: str
    draft_reply: str
    triaged_by: str
    language: str = "en"
    confidence: str = "medium"
    facts_used: tuple[str, ...] = ()


class TriageError(Exception):
    """A provider could not produce a valid result (network, quota, bad output)."""


class Triager(Protocol):
    name: str

    def triage(self, item: TriageInput) -> TriageResult: ...


def first_name(full_name: str) -> str:
    name = full_name.strip().split(" ")[0] if full_name.strip() else ""
    return name or "there"
