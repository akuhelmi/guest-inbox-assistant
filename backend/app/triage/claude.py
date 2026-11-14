"""Claude triage for local use: the same prompt and checks as Gemini, run through `claude -p`."""

from collections.abc import Callable

from ..claude_cli import ClaudeCliError, run_structured
from .base import TriageError, TriageInput, TriageResult
from .gemini import RESPONSE_SCHEMA, build_prompt, to_result, validate_data


class ClaudeTriager:
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

    def triage(self, item: TriageInput) -> TriageResult:
        try:
            data = self._run(
                build_prompt(item),
                RESPONSE_SCHEMA,
                model=self._model,
                timeout=self._timeout,
                binary=self._binary,
            )
        except ClaudeCliError as exc:
            raise TriageError(str(exc)) from exc
        return to_result(validate_data(data), item, self.name)
