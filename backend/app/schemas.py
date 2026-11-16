"""API request and response shapes."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class FactOut(BaseModel):
    key: str
    label: str
    value: str


class FactRef(BaseModel):
    key: str
    label: str


class TaskSuggestion(BaseModel):
    title: str
    assignee: str
    assignee_label: str
    due_minutes: int
    # A team member the AI picked by name (see /api/team); empty = the app picks one.
    person: str = ""


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
    suggested_task: TaskSuggestion | None = None


class TeamPersonOut(BaseModel):
    id: str
    name: str
    role: str
    base: str
    skills: list[str]
    # Driving minutes to each property, by property id.
    travel: dict[int, int]


class TeamJobOut(BaseModel):
    person: str
    property_id: int
    title: str
    # Minutes from the start of the visitor's demo.
    start: int
    minutes: int


class TeamOut(BaseModel):
    people: list[TeamPersonOut]
    jobs: list[TeamJobOut]


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
    status: str = "new"
    replied_at: datetime | None = None
    channel: str = "airbnb"


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
    agent_limit_per_day: int = 30
    suggestions: list[str] = Field(default_factory=list)


# --- Inbox assistant ---------------------------------------------------------------------


class AgentTurn(BaseModel):
    role: Literal["host", "assistant"]
    text: str = Field(max_length=4000)


class AgentStatus(BaseModel):
    status: Literal["new", "replied", "done"]
    replied_at_ms: int | None = None


class AgentTask(BaseModel):
    message_id: int
    title: str = Field(max_length=200)
    done: bool = False


class ExtraMessage(BaseModel):
    """A message the visitor added with "New guest message" (kept in their browser)."""

    id: int = Field(lt=0)  # negative, so it never clashes with a saved message
    guest_name: str = Field(max_length=60)
    property_id: int
    wait_minutes: int = Field(default=0, ge=0)
    category: str = "general_question"
    urgent: bool = False
    needs_host: bool = False
    body: str = Field(max_length=1000)
    draft_reply: str = Field(default="", max_length=2000)
    language: str = Field(default="en", max_length=8)
    confidence: str = "medium"
    task_title: str = Field(default="", max_length=200)
    task_assignee: str = ""
    task_due_minutes: int = 0


class ComposeRequest(BaseModel):
    brief: str = Field(max_length=500)
    property_id: int | None = None


class ComposeOut(BaseModel):
    # id is 0: the browser gives the message its own (negative) id.
    message: MessageOut
    by: str
    pasted: bool = False
    ai_left_today: int | None = None
    note: str | None = None


class AgentState(BaseModel):
    """The visitor's own statuses and tasks (kept in their browser, sent with each turn)."""

    statuses: dict[int, AgentStatus] = Field(default_factory=dict)
    tasks: list[AgentTask] = Field(default_factory=list, max_length=200)


class AgentRequest(BaseModel):
    text: str = Field(default="", max_length=500)
    # The message the host has open: answers and proposals are about it.
    message_id: int | None = None
    history: list[AgentTurn] = Field(default_factory=list, max_length=20)
    state: AgentState = Field(default_factory=AgentState)
    # The team's day as the browser sees it ("Aiman: busy, Aircon service until 3:30 pm").
    team: list[str] = Field(default_factory=list, max_length=12)
    # Messages the visitor added themselves (not in the database).
    extra: list[ExtraMessage] = Field(default_factory=list, max_length=20)


class CardOut(BaseModel):
    kind: Literal["draft", "status", "task"]
    message_id: int
    guest_name: str
    property_name: str
    draft: str = ""
    language: str = "en"
    language_label: str = "English"
    confidence: str = "medium"
    needs_host: bool = False
    facts_used: list[FactRef] = Field(default_factory=list)
    status: str = ""
    task: TaskSuggestion | None = None


class AgentOut(BaseModel):
    text: str
    cards: list[CardOut]
    highlight: list[int]
    focus: int | None = None
    by: str
    ai_left_today: int | None = None
    note: str | None = None
    # The cards are the whole remaining plan for the open message (they replace its open steps).
    plan: bool = False
