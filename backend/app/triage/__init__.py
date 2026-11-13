"""Switchable triage layer: pick a provider with LLM_PROVIDER, fall back to offline rules."""

import logging

from ..config import Settings
from .base import CATEGORIES, CATEGORY_LABELS, TriageError, TriageInput, Triager, TriageResult
from .gemini import GeminiTriager
from .offline import OfflineTriager

log = logging.getLogger(__name__)

__all__ = [
    "CATEGORIES",
    "CATEGORY_LABELS",
    "FallbackTriager",
    "TriageError",
    "TriageInput",
    "TriageResult",
    "Triager",
    "build_triager",
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
            return TriageResult(
                category=result.category,
                urgent=result.urgent,
                reason=result.reason,
                draft_reply=result.draft_reply,
                triaged_by=f"{self.fallback.name} (fallback)",
            )


def build_triager(settings: Settings) -> Triager:
    provider = settings.llm_provider
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
