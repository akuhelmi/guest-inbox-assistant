"""FastAPI app: the guest inbox API, plus the built frontend when it is present (Docker)."""

import os
import threading
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from . import ratelimit
from .agent import (
    SUGGESTIONS,
    AgentInput,
    AgentReply,
    Card,
    InboxItem,
    PropertyInfo,
    RulesAgent,
    Turn,
    build_agent,
)
from .config import Settings, load_settings
from .db import make_engine, make_session_factory
from .models import Message, Property
from .schemas import (
    AgentOut,
    AgentRequest,
    CardOut,
    FactOut,
    FactRef,
    LiveTriageOut,
    MessageOut,
    MetaOut,
    PropertyOut,
    TaskSuggestion,
    TriageOut,
    TriageRequest,
)
from .seed import SAVED, demo_clock_offset, ensure_data
from .triage import (
    CATEGORIES,
    CATEGORY_LABELS,
    FACT_LABELS,
    TASK_ASSIGNEES,
    TriageInput,
    TriageResult,
    build_triager,
    language_label,
)


def _from_result(r: TriageResult) -> TriageOut:
    return TriageOut(
        category=r.category,
        category_label=CATEGORY_LABELS.get(r.category, r.category),
        urgent=r.urgent,
        reason=r.reason,
        draft_reply=r.draft_reply,
        triaged_by=r.triaged_by,
        language=r.language,
        language_label=language_label(r.language),
        confidence=r.confidence,
        needs_host=r.confidence == "low",
        facts_used=[FactRef(key=k, label=FACT_LABELS.get(k, k)) for k in r.facts_used],
        suggested_task=(
            TaskSuggestion(
                title=r.task_title,
                assignee=r.task_assignee,
                assignee_label=TASK_ASSIGNEES.get(r.task_assignee, r.task_assignee),
                due_minutes=r.task_due_minutes,
            )
            if r.task_title
            else None
        ),
    )


def _saved_result(m: Message) -> TriageResult:
    return TriageResult(
        category=m.category,
        urgent=m.urgent,
        reason=m.reason,
        draft_reply=m.draft_reply,
        triaged_by=m.triaged_by,
        language=m.language or "en",
        confidence=m.confidence or "medium",
        facts_used=tuple(m.facts_used or ()),
        task_title=m.task_title or "",
        task_assignee=m.task_assignee or "",
        task_due_minutes=m.task_due_minutes or 0,
    )


def _message_out(m: Message, clock: timedelta = timedelta(0)) -> MessageOut:
    """`clock` shifts saved examples forward so their ages stay as seeded (see seed.py)."""
    shift = clock if m.triaged_by == SAVED else timedelta(0)
    return MessageOut(
        id=m.id,
        guest_name=m.guest_name,
        property_id=m.property_id,
        property_name=m.property.name,
        property_city=m.property.city,
        received_at=m.received_at + shift,
        status=m.status or "new",
        replied_at=m.replied_at + shift if m.replied_at else None,
        body=m.body,
        channel=m.channel or "airbnb",
        triage=_from_result(_saved_result(m)),
    )


def _property_out(p: Property) -> PropertyOut:
    facts = p.facts or {}
    return PropertyOut(
        id=p.id,
        name=p.name,
        city=p.city,
        facts=[
            FactOut(key=k, label=label, value=facts[k])
            for k, label in FACT_LABELS.items()
            if k in facts
        ],
    )


def _triage_input(body: str, guest: str, prop: Property | None) -> TriageInput:
    if prop is None:
        return TriageInput(body, guest, "our property")
    return TriageInput(body, guest, prop.name, dict(prop.facts or {}))


def _utc_naive(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, timezone.utc).replace(tzinfo=None)


def agent_input(
    session: Session, payload: AgentRequest, text: str, now: datetime | None = None
) -> AgentInput:
    """The inbox as this visitor sees it: saved messages plus their own statuses and tasks."""
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    clock = demo_clock_offset(session)
    open_tasks: dict[int, list[str]] = {}
    for t in payload.state.tasks:
        if not t.done:
            open_tasks.setdefault(t.message_id, []).append(t.title.strip()[:120])
    items = []
    query = select(Message).options(joinedload(Message.property)).order_by(Message.id)
    for m in session.scalars(query):
        out = _message_out(m, clock)
        own = payload.state.statuses.get(m.id)
        status = own.status if own else out.status
        if status == "new":
            end = now
        elif own and own.replied_at_ms:
            end = _utc_naive(own.replied_at_ms)
        else:
            end = out.replied_at or now
        t = out.triage
        items.append(
            InboxItem(
                id=m.id,
                guest_name=m.guest_name,
                property_id=m.property_id,
                property_name=m.property.name,
                category=m.category,
                urgent=m.urgent,
                needs_host=t.needs_host,
                status=status,
                wait_minutes=max(0, int((end - out.received_at).total_seconds() // 60)),
                body=m.body,
                draft_reply=m.draft_reply,
                language=t.language,
                confidence=t.confidence,
                facts_used=tuple(f.key for f in t.facts_used),
                task_title=m.task_title or "",
                task_assignee=m.task_assignee or "",
                task_due_minutes=m.task_due_minutes or 0,
                open_tasks=tuple(open_tasks.get(m.id, ())),
            )
        )
    props = tuple(
        PropertyInfo(p.id, p.name, p.city, dict(p.facts or {}))
        for p in session.scalars(select(Property).order_by(Property.id))
    )
    history = tuple(Turn(t.role, t.text) for t in payload.history[-8:])
    known = {i.id for i in items}
    focus = payload.message_id if payload.message_id in known else None
    return AgentInput(
        text=text, items=tuple(items), properties=props, history=history, focus_id=focus
    )


def _card_out(c: Card, item: AgentInput) -> CardOut:
    target = item.item(c.message_id)
    assert target is not None  # cards are checked against the inbox when they are made
    return CardOut(
        kind=c.kind,
        message_id=c.message_id,
        guest_name=target.guest_name,
        property_name=target.property_name,
        draft=c.draft,
        language=c.language,
        language_label=language_label(c.language),
        confidence=c.confidence,
        needs_host=c.kind == "draft" and c.confidence == "low",
        facts_used=[FactRef(key=k, label=FACT_LABELS.get(k, k)) for k in c.facts_used],
        status=c.status,
        task=(
            TaskSuggestion(
                title=c.task_title,
                assignee=c.task_assignee,
                assignee_label=TASK_ASSIGNEES.get(c.task_assignee, c.task_assignee),
                due_minutes=c.task_due_minutes,
            )
            if c.kind == "task"
            else None
        ),
    )


def client_ip(request: Request) -> str:
    # Vercel sets x-real-ip / x-forwarded-for itself, so clients cannot spoof them there.
    real = request.headers.get("x-real-ip", "").strip()
    if real:
        return real
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def create_app(settings: Settings | None = None, triager=None, agent=None) -> FastAPI:
    settings = settings or load_settings()
    engine = make_engine(settings.database_url)
    session_factory = make_session_factory(engine)
    triager = triager or build_triager(settings)
    agent = agent or build_agent(settings)
    rules = RulesAgent()

    app = FastAPI(title="Guest Inbox Assistant", version="0.1.0")
    app.state.engine = engine

    # Tables and demo data are set up on the first request rather than at startup:
    # serverless platforms do not always run startup hooks.
    ready = threading.Event()
    ready_lock = threading.Lock()

    def ensure_ready() -> None:
        if ready.is_set():
            return
        with ready_lock:
            if ready.is_set():
                return
            ensure_data(engine, session_factory)
            ready.set()

    def get_session() -> Iterator[Session]:
        ensure_ready()
        with session_factory() as session:
            yield session

    def spend_call(request: Request, session: Session) -> int:
        visitor = ratelimit.visitor_hash(client_ip(request), settings.rate_limit_salt)
        allowed, left = ratelimit.check_and_count(session, visitor, settings.rate_limit_per_hour)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Demo limit reached ({settings.rate_limit_per_hour} live triages per "
                "hour). The saved examples still work.",
            )
        return left

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.get("/api/meta", response_model=MetaOut)
    def meta() -> MetaOut:
        return MetaOut(
            provider=triager.name,
            categories={c: CATEGORY_LABELS[c] for c in CATEGORIES},
            max_message_chars=settings.max_message_chars,
            rate_limit_per_hour=settings.rate_limit_per_hour,
            agent_limit_per_day=settings.agent_limit_per_day,
            suggestions=list(SUGGESTIONS),
        )

    @app.get("/api/properties", response_model=list[PropertyOut])
    def list_properties(session: Session = Depends(get_session)) -> list[PropertyOut]:
        return [_property_out(p) for p in session.scalars(select(Property).order_by(Property.id))]

    @app.get("/api/messages", response_model=list[MessageOut])
    def list_messages(
        category: str | None = None,
        urgent: bool | None = None,
        session: Session = Depends(get_session),
    ) -> list[MessageOut]:
        query = select(Message).options(joinedload(Message.property))
        if category:
            if category not in CATEGORIES:
                raise HTTPException(status_code=400, detail="Unknown category.")
            query = query.where(Message.category == category)
        if urgent is not None:
            query = query.where(Message.urgent == urgent)
        # Urgent first, then newest first.
        query = query.order_by(Message.urgent.desc(), Message.received_at.desc())
        clock = demo_clock_offset(session)
        return [_message_out(m, clock) for m in session.scalars(query)]

    @app.get("/api/messages/{message_id}", response_model=MessageOut)
    def get_message(message_id: int, session: Session = Depends(get_session)) -> MessageOut:
        m = session.get(Message, message_id, options=[joinedload(Message.property)])
        if m is None:
            raise HTTPException(status_code=404, detail="Message not found.")
        return _message_out(m, demo_clock_offset(session))

    @app.post("/api/messages/{message_id}/triage", response_model=LiveTriageOut)
    def retriage_message(
        message_id: int, request: Request, session: Session = Depends(get_session)
    ) -> LiveTriageOut:
        """Run the live provider on a saved message. The result is shown, not stored."""
        m = session.get(Message, message_id, options=[joinedload(Message.property)])
        if m is None:
            raise HTTPException(status_code=404, detail="Message not found.")
        left = spend_call(request, session)
        result = triager.triage(_triage_input(m.body, m.guest_name, m.property))
        return LiveTriageOut(triage=_from_result(result), calls_left_this_hour=left)

    @app.post("/api/triage", response_model=LiveTriageOut)
    def triage_text(
        payload: TriageRequest, request: Request, session: Session = Depends(get_session)
    ) -> LiveTriageOut:
        """Triage a pasted message. The text is never stored."""
        body = payload.body.strip()
        if not body:
            raise HTTPException(status_code=422, detail="Message is empty.")
        if len(body) > settings.max_message_chars:
            raise HTTPException(
                status_code=422,
                detail=f"Message is too long (max {settings.max_message_chars} characters).",
            )
        prop = None
        if payload.property_id is not None:
            prop = session.get(Property, payload.property_id)
            if prop is None:
                raise HTTPException(status_code=422, detail="Unknown property.")
        left = spend_call(request, session)
        result = triager.triage(_triage_input(body, payload.guest_name.strip() or "Guest", prop))
        return LiveTriageOut(triage=_from_result(result), calls_left_this_hour=left)

    @app.post("/api/agent", response_model=AgentOut)
    def agent_turn(
        payload: AgentRequest, request: Request, session: Session = Depends(get_session)
    ) -> AgentOut:
        """One turn with the inbox assistant. It only proposes; the browser applies approvals.

        An empty text asks for the opening briefing, which the rules answer for free.
        """
        text = payload.text.strip()
        item = agent_input(session, payload, text)
        note, left = None, None
        if not text or agent.name == rules.name:
            reply: AgentReply = rules.respond(item)
        else:
            visitor = ratelimit.visitor_hash(client_ip(request), settings.rate_limit_salt)
            allowed, left = ratelimit.check_and_count(
                session, visitor, settings.agent_limit_per_day, daily=True
            )
            if allowed:
                reply = agent.respond(item)
                if reply.by.endswith("(fallback)"):
                    note = "The AI is unavailable right now, so the quick commands answered."
            else:
                reply = rules.respond(item)
                note = (
                    f"You've used today's {settings.agent_limit_per_day} AI replies, so the "
                    "quick commands answer until tomorrow."
                )
        return AgentOut(
            text=reply.text,
            cards=[_card_out(c, item) for c in reply.cards],
            highlight=list(reply.highlight),
            focus=reply.focus,
            by=reply.by,
            ai_left_today=left,
            note=note,
        )

    _mount_frontend(app)
    return app


def _mount_frontend(app: FastAPI) -> None:
    """Serve the built React app (Docker / local). On Vercel, Vercel serves it instead."""
    dist = Path(os.environ.get("FRONTEND_DIST", Path(__file__).parents[2] / "frontend" / "dist"))
    if not (dist / "index.html").is_file():
        return
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found.")
        file = (dist / path).resolve()
        if path and file.is_file() and dist.resolve() in file.parents:
            return FileResponse(file)
        return FileResponse(dist / "index.html")


app = create_app()
