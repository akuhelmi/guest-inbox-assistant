"""Local-only Claude provider: run the Claude Code CLI (`claude -p`) with a JSON schema.

Meant for a developer's own machine, signed in to Claude Code: no API key in this app and no
extra package. It is off unless LLM_PROVIDER=claude, and a deployment without the `claude`
program falls back to the offline rules.
"""

import json
import shutil
import subprocess
import tempfile
from collections.abc import Callable

SYSTEM_PROMPT = (
    "You are the AI inside a demo inbox app for short-term rental hosts. "
    "Follow the instructions in the user message and answer only with the requested JSON."
)


class ClaudeCliError(RuntimeError):
    """The CLI was missing, timed out or returned no usable structured output."""


def json_schema(schema: dict) -> dict:
    """Turn the Gemini-style schema (upper-case types) into standard JSON Schema."""
    out: dict = {}
    for key, value in schema.items():
        if key == "type" and isinstance(value, str):
            out[key] = value.lower()
        elif key == "properties" and isinstance(value, dict):
            out[key] = {name: json_schema(sub) for name, sub in value.items()}
        elif key == "items" and isinstance(value, dict):
            out[key] = json_schema(value)
        else:
            out[key] = value
    return out


def available(binary: str) -> bool:
    return shutil.which(binary) is not None


def run_structured(
    prompt: str,
    schema: dict,
    *,
    model: str,
    timeout: float,
    binary: str = "claude",
    runner: Callable[..., subprocess.CompletedProcess] = subprocess.run,
) -> dict:
    """Send one prompt; return the structured JSON object the model produced."""
    cmd = [
        binary,
        "-p",
        "--model",
        model,
        "--output-format",
        "json",
        "--json-schema",
        json.dumps(json_schema(schema)),
        "--system-prompt",
        SYSTEM_PROMPT,
        "--tools",
        "",
        "--setting-sources",
        "",
        "--strict-mcp-config",
        "--no-session-persistence",
    ]
    # Run outside the repo so no project instructions are picked up.
    with tempfile.TemporaryDirectory(prefix="gia-claude-") as cwd:
        try:
            proc = runner(
                cmd,
                input=prompt,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=cwd,
            )
        except FileNotFoundError as exc:
            raise ClaudeCliError(f"{binary} not found") from exc
        except subprocess.TimeoutExpired as exc:
            raise ClaudeCliError(f"Claude timed out after {timeout:g}s") from exc
    if proc.returncode != 0:
        raise ClaudeCliError(f"Claude exited with code {proc.returncode}")
    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise ClaudeCliError("Claude returned no JSON") from exc
    if not isinstance(result, dict):
        raise ClaudeCliError("Claude returned no JSON object")
    if result.get("is_error"):
        raise ClaudeCliError(f"Claude reported an error: {str(result.get('subtype'))[:80]}")
    data = result.get("structured_output")
    if not isinstance(data, dict):
        raise ClaudeCliError("Claude returned no structured output")
    return data
