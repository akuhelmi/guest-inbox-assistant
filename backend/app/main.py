"""FastAPI app: the guest inbox API, plus the built frontend when it is present (Docker)."""

import os
import threading
from collections.abc import Iterator
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from . import ratelimit
from .config import Settings, load_settings
from .db import Base, make_engine, make_session_factory
from .models import Message
from .schemas import LiveTriageOut, MessageOut, MetaOut, TriageOut, TriageRequest
from .seed import seed_if_empty
from .triage import CATEGORIES, CATEGORY_LABELS, TriageInput, TriageResult, build_triager


def _triage_out(category: str, urgent: bool, reason: str, draft: str, by: str) -> TriageOut:
    return TriageOut(
        category=category,
        category_label=CATEGORY_LABELS.get(category, category),
        urgent=urgent,
        reason=reason,
        draft_reply=draft,
        triaged_by=by,
    )


def _from_result(r: TriageResult) -> TriageOut:
    return _triage_out(r.category, r.urgent, r.reason, r.draft_reply, r.triaged_by)


def _message_out(m: Message) -> MessageOut:
    return MessageOut(
        id=m.id,
        guest_name=m.guest_name,
        property_name=m.property.name,
        property_city=m.property.city,
        received_at=m.received_at,
        body=m.body,
        triage=_triage_out(m.category, m.urgent, m.reason, m.draft_reply, m.triaged_by),
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


def create_app(settings: Settings | None = None, triager=None) -> FastAPI:
    settings = settings or load_settings()
    engine = make_engine(settings.database_url)
    session_factory = make_session_factory(engine)
    triager = triager or build_triager(settings)

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
            Base.metadata.create_all(engine)
            with session_factory() as session:
                seed_if_empty(session)
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
        )

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
        return [_message_out(m) for m in session.scalars(query)]

    @app.get("/api/messages/{message_id}", response_model=MessageOut)
    def get_message(message_id: int, session: Session = Depends(get_session)) -> MessageOut:
        m = session.get(Message, message_id, options=[joinedload(Message.property)])
        if m is None:
            raise HTTPException(status_code=404, detail="Message not found.")
        return _message_out(m)

    @app.post("/api/messages/{message_id}/triage", response_model=LiveTriageOut)
    def retriage_message(
        message_id: int, request: Request, session: Session = Depends(get_session)
    ) -> LiveTriageOut:
        """Run the live provider on a saved message. The result is shown, not stored."""
        m = session.get(Message, message_id, options=[joinedload(Message.property)])
        if m is None:
            raise HTTPException(status_code=404, detail="Message not found.")
        left = spend_call(request, session)
        result = triager.triage(TriageInput(m.body, m.guest_name, m.property.name))
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
        left = spend_call(request, session)
        result = triager.triage(
            TriageInput(body, payload.guest_name.strip() or "Guest", "our property")
        )
        return LiveTriageOut(triage=_from_result(result), calls_left_this_hour=left)

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
