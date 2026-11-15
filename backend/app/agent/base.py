"""Shared types for the inbox assistant: the host talks to it, it answers and proposes actions.

The assistant never changes anything itself. Every change it wants (send a draft, change a
status, create a task) comes back as a card that the host approves or edits in the browser.
"""

from dataclasses import dataclass, field
from typing import Protocol

CARD_KINDS: tuple[str, ...] = ("draft", "status", "task")
STATUSES: tuple[str, ...] = ("new", "replied", "done")
REPLY_TARGET_MINUTES = {"urgent": 15, "normal": 60}
MAX_CARDS = 8


@dataclass(frozen=True)
class InboxItem:
    """One message as the assistant sees it, with this visitor's own status and tasks."""

    id: int
    guest_name: str
    property_id: int
    property_name: str
    category: str
    urgent: bool
    needs_host: bool
    status: str
    # Minutes the guest waited: so far if still new, else until the reply.
    wait_minutes: int
    body: str
    draft_reply: str = ""
    language: str = "en"
    confidence: str = "medium"
    facts_used: tuple[str, ...] = ()
    task_title: str = ""
    task_assignee: str = ""
    task_due_minutes: int = 0
    open_tasks: tuple[str, ...] = ()

    @property
    def overdue(self) -> bool:
        target = REPLY_TARGET_MINUTES["urgent" if self.urgent else "normal"]
        return self.status == "new" and self.wait_minutes > target


@dataclass(frozen=True)
class PropertyInfo:
    id: int
    name: str
    city: str
    facts: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class Turn:
    role: str  # "host" or "assistant"
    text: str


@dataclass(frozen=True)
class AgentInput:
    text: str
    items: tuple[InboxItem, ...]
    properties: tuple[PropertyInfo, ...]
    history: tuple[Turn, ...] = ()
    focus_id: int | None = None  # the message the host has open

    def item(self, message_id: int) -> InboxItem | None:
        return next((i for i in self.items if i.id == message_id), None)

    def prop(self, property_id: int) -> PropertyInfo | None:
        return next((p for p in self.properties if p.id == property_id), None)


@dataclass(frozen=True)
class Card:
    """A proposed action. Nothing happens until the host presses Approve."""

    kind: str  # one of CARD_KINDS
    message_id: int
    draft: str = ""
    language: str = "en"
    confidence: str = "medium"
    facts_used: tuple[str, ...] = ()
    status: str = ""
    task_title: str = ""
    task_assignee: str = ""
    task_due_minutes: int = 0


@dataclass(frozen=True)
class AgentReply:
    text: str
    cards: tuple[Card, ...] = ()
    # Messages to highlight in the inbox panel, and one to open there (if any).
    highlight: tuple[int, ...] = ()
    focus: int | None = None
    by: str = "rules"


class AgentError(Exception):
    """The assistant could not produce a valid answer (network, quota, bad output)."""


class Agent(Protocol):
    name: str

    def respond(self, item: AgentInput) -> AgentReply: ...


def summary_stats(items: tuple[InboxItem, ...], open_tasks: int) -> dict[str, int | None]:
    """Exact counts for the shift summary, so neither the rules nor the AI have to count."""
    replied = [i.wait_minutes for i in items if i.status != "new"]
    return {
        "total": len(items),
        "new": sum(1 for i in items if i.status == "new"),
        "replied": sum(1 for i in items if i.status == "replied"),
        "done": sum(1 for i in items if i.status == "done"),
        "urgent_new": sum(1 for i in items if i.urgent and i.status == "new"),
        "overdue": sum(1 for i in items if i.overdue),
        "needs_host_new": sum(1 for i in items if i.needs_host and i.status == "new"),
        "open_tasks": open_tasks,
        "avg_reply_minutes": round(sum(replied) / len(replied)) if replied else None,
    }


def format_minutes(minutes: int) -> str:
    if minutes < 60:
        return f"{minutes} min"
    hours, rest = divmod(minutes, 60)
    if hours < 24:
        return f"{hours} h {rest} min" if rest else f"{hours} h"
    return f"{hours // 24} d"
