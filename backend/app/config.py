"""Settings, read from environment variables (see .env.example)."""

import os
from dataclasses import dataclass


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def normalize_db_url(url: str) -> str:
    """Map postgres:// and postgresql:// URLs (Supabase style) to the psycopg 3 driver."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


def default_db_url() -> str:
    """Local SQLite file; on Vercel (read-only disk) /tmp, until DATABASE_URL is set."""
    if os.environ.get("VERCEL"):
        return "sqlite:////tmp/guest_inbox.db"
    return "sqlite:///./guest_inbox.db"


@dataclass(frozen=True)
class Settings:
    database_url: str = "sqlite:///./guest_inbox.db"
    llm_provider: str = "offline"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    llm_timeout_seconds: int = 8
    max_message_chars: int = 1000
    rate_limit_per_hour: int = 10
    rate_limit_salt: str = "local-dev-salt"


def load_settings() -> Settings:
    return Settings(
        database_url=normalize_db_url(os.environ.get("DATABASE_URL") or default_db_url()),
        llm_provider=os.environ.get("LLM_PROVIDER", "offline").strip().lower(),
        gemini_api_key=os.environ.get("GEMINI_API_KEY", ""),
        gemini_model=os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite"),
        llm_timeout_seconds=_int("LLM_TIMEOUT_SECONDS", 8),
        max_message_chars=_int("MAX_MESSAGE_CHARS", 1000),
        rate_limit_per_hour=_int("RATE_LIMIT_PER_HOUR", 10),
        rate_limit_salt=os.environ.get("RATE_LIMIT_SALT", "local-dev-salt"),
    )
