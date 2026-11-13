"""Google Gemini provider (REST API, structured JSON output). No SDK dependency."""

import json

import httpx

from .base import CATEGORIES, TriageError, TriageInput, TriageResult

API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

PROMPT = """You help a short-term rental operator handle guest messages.
Classify the guest message into exactly one category:
- check_in: arrival, keys, door codes, directions, parking, early check-in
- complaint: unhappy with cleanliness, noise, accuracy, service; asks for a refund
- maintenance: something broken or not working (water, power, aircon, wifi, appliances)
- booking_change: extend, shorten, cancel, change dates, add guests, late check-out
- general_question: anything else (recommendations, house rules, thanks)
Set urgent=true only if the guest needs action within the hour: locked out, no water or power,
safety risk (smoke, gas, flooding, injury), or stranded at arrival.
Write "reason" as one short sentence.
Write "draft_reply" as the operator: warm, short (2-4 sentences), concrete next step,
first name only, no promises of refunds or compensation. Never invent door codes or addresses.

Guest name: {guest}
Property: {prop}
Message:
\"\"\"{body}\"\"\""""

RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "category": {"type": "STRING", "enum": list(CATEGORIES)},
        "urgent": {"type": "BOOLEAN"},
        "reason": {"type": "STRING"},
        "draft_reply": {"type": "STRING"},
    },
    "required": ["category", "urgent", "reason", "draft_reply"],
}


def _error_detail(resp: httpx.Response) -> str:
    """Google's own error message (e.g. model not found), shortened; never contains the key."""
    try:
        message = resp.json()["error"]["message"]
    except (ValueError, KeyError, TypeError):
        return "no error message"
    return str(message)[:200]


def parse_response(payload: dict) -> dict:
    """Pull the JSON object out of a generateContent response and validate it."""
    try:
        text = payload["candidates"][0]["content"]["parts"][0]["text"]
        data = json.loads(text)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise TriageError(f"unexpected Gemini response: {exc}") from exc
    if data.get("category") not in CATEGORIES:
        raise TriageError(f"invalid category: {data.get('category')!r}")
    if not isinstance(data.get("urgent"), bool):
        raise TriageError("invalid urgent flag")
    for key in ("reason", "draft_reply"):
        if not isinstance(data.get(key), str) or not data[key].strip():
            raise TriageError(f"missing {key}")
    return data


class GeminiTriager:
    name = "gemini"

    def __init__(
        self,
        api_key: str,
        model: str,
        timeout: float = 8.0,
        client: httpx.Client | None = None,
    ) -> None:
        if not api_key:
            raise TriageError("GEMINI_API_KEY is not set")
        self._api_key = api_key
        self._model = model
        self._timeout = timeout
        self._client = client

    def triage(self, item: TriageInput) -> TriageResult:
        body = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": PROMPT.format(
                                guest=item.guest_name, prop=item.property_name, body=item.body
                            )
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.3,
                "responseMimeType": "application/json",
                "responseSchema": RESPONSE_SCHEMA,
            },
        }
        client = self._client or httpx.Client(timeout=self._timeout)
        try:
            resp = client.post(
                API_URL.format(model=self._model),
                json=body,
                headers={"x-goog-api-key": self._api_key},
            )
        except httpx.HTTPError as exc:
            raise TriageError(f"Gemini request failed: {exc.__class__.__name__}") from exc
        finally:
            if self._client is None:
                client.close()
        if resp.status_code != 200:
            raise TriageError(f"Gemini returned HTTP {resp.status_code}: {_error_detail(resp)}")
        data = parse_response(resp.json())
        return TriageResult(
            category=data["category"],
            urgent=data["urgent"],
            reason=data["reason"].strip(),
            draft_reply=data["draft_reply"].strip(),
            triaged_by=self.name,
        )
