"""Database engine and session factory (SQLite locally, Postgres in CI and live)."""

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool


class Base(DeclarativeBase):
    pass


def make_engine(url: str) -> Engine:
    if url == "sqlite://" or url == "sqlite:///:memory:":
        # In-memory database (tests): one shared connection.
        return create_engine(url, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    if url.startswith("sqlite"):
        return create_engine(url, connect_args={"check_same_thread": False})
    # Serverless friendly: check connections before use, keep the pool small.
    # prepare_threshold=None: no server-side prepared statements, which connection
    # poolers in transaction mode (e.g. Supabase's pooler) do not support.
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=2,
        max_overflow=2,
        connect_args={"prepare_threshold": None},
    )


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)
