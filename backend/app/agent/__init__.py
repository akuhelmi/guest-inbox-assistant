"""Inbox assistant: pick the AI with LLM_PROVIDER, fall back to the rule-based commands."""

import logging
from dataclasses import replace

from ..claude_cli import available
from ..config import Settings
from .base import (
    CARD_KINDS,
    STATUSES,
    Agent,
    AgentError,
    AgentInput,
    AgentReply,
    Card,
    InboxItem,
    PropertyInfo,
    Turn,
)
from .claude import ClaudeAgent
from .gemini import GeminiAgent
from .rules import SUGGESTIONS, RulesAgent

log = logging.getLogger(__name__)

__all__ = [
    "CARD_KINDS",
    "STATUSES",
    "SUGGESTIONS",
    "Agent",
    "AgentError",
    "AgentInput",
    "AgentReply",
    "Card",
    "FallbackAgent",
    "InboxItem",
    "PropertyInfo",
    "RulesAgent",
    "Turn",
    "build_agent",
]


class FallbackAgent:
    """Try the AI; on any failure, answer with the rule-based commands instead."""

    def __init__(self, primary: Agent, fallback: Agent | None = None) -> None:
        self.primary = primary
        self.fallback = fallback or RulesAgent()
        self.name = primary.name

    def respond(self, item: AgentInput) -> AgentReply:
        try:
            return self.primary.respond(item)
        except AgentError as exc:
            log.warning("agent provider %s failed, using rules: %s", self.name, exc)
            return replace(self.fallback.respond(item), by=f"{self.fallback.name} (fallback)")


def build_agent(settings: Settings) -> Agent:
    if settings.llm_provider == "claude" and available(settings.claude_bin):
        return FallbackAgent(
            ClaudeAgent(
                settings.claude_model,
                timeout=settings.claude_timeout_seconds,
                binary=settings.claude_bin,
            )
        )
    if settings.llm_provider == "gemini" and settings.gemini_api_key:
        return FallbackAgent(
            GeminiAgent(
                settings.gemini_api_key,
                settings.gemini_model,
                timeout=settings.agent_timeout_seconds,
            )
        )
    return RulesAgent()
