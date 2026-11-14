"""Switchable triage layer: pick a provider with LLM_PROVIDER, fall back to offline rules."""

import logging
from dataclasses import replace

from ..claude_cli import available
from ..config import Settings
from .base import (
    CATEGORIES,
    CATEGORY_LABELS,
    CONFIDENCE_LEVELS,
    FACT_LABELS,
    TASK_ASSIGNEES,
    TriageError,
    TriageInput,
    Triager,
    TriageResult,
    language_label,
)
from .claude import ClaudeTriager
from .gemini import GeminiTriager
from .offline import OfflineTriager

log = logging.getLogger(__name__)

__all__ = [
    "CATEGORIES",
    "CATEGORY_LABELS",
    "CONFIDENCE_LEVELS",
    "FACT_LABELS",
    "TASK_ASSIGNEES",
    "FallbackTriager",
    "TriageError",
    "TriageInput",
    "TriageResult",
    "Triager",
    "build_triager",
    "language_label",
]


class FallbackTriager:
    """Try the primary provider; on any failure, answer with the offline rules instead."""

    def __init__(self, primary: Triager, fallback: Triager | None = None) -> None:
        self.primary = primary
        self.fallback = fallback or OfflineTriager()
        self.name = primary.name

    def triage(self, item: TriageInput) -> TriageResult:
        try:
            return self.primary.triage(item)
        except TriageError as exc:
            log.warning("triage provider %s failed, using offline rules: %s", self.name, exc)
            result = self.fallback.triage(item)
            return replace(result, triaged_by=f"{self.fallback.name} (fallback)")


def build_triager(settings: Settings) -> Triager:
    provider = settings.llm_provider
    if provider == "claude":
        if not available(settings.claude_bin):
            log.warning(
                "LLM_PROVIDER=claude but %r is not installed; using offline rules",
                settings.claude_bin,
            )
            return OfflineTriager()
        return FallbackTriager(
            ClaudeTriager(
                settings.claude_model,
                timeout=settings.claude_timeout_seconds,
                binary=settings.claude_bin,
            )
        )
    if provider == "gemini":
        if not settings.gemini_api_key:
            log.warning("LLM_PROVIDER=gemini but GEMINI_API_KEY is empty; using offline rules")
            return OfflineTriager()
        return FallbackTriager(
            GeminiTriager(
                settings.gemini_api_key,
                settings.gemini_model,
                timeout=settings.llm_timeout_seconds,
            )
        )
    if provider not in ("offline", ""):
        log.warning("unknown LLM_PROVIDER=%r; using offline rules", provider)
    return OfflineTriager()
