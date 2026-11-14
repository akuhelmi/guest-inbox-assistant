"""Claude assistant for local use: the same prompt and checks as Gemini, run through `claude -p`."""

from collections.abc import Callable

from ..claude_cli import ClaudeCliError, run_structured
from .base import AgentError, AgentInput, AgentReply
from .gemini import RESPONSE_SCHEMA, build_prompt, parse_data


class ClaudeAgent:
    name = "claude"

    def __init__(
        self,
        model: str,
        timeout: float = 45.0,
        binary: str = "claude",
        run: Callable[..., dict] = run_structured,
    ) -> None:
        self._model = model
        self._timeout = timeout
        self._binary = binary
        self._run = run

    def respond(self, item: AgentInput) -> AgentReply:
        try:
            data = self._run(
                build_prompt(item),
                RESPONSE_SCHEMA,
                model=self._model,
                timeout=self._timeout,
                binary=self._binary,
            )
        except ClaudeCliError as exc:
            raise AgentError(str(exc)) from exc
        return parse_data(data, item, by=self.name)
