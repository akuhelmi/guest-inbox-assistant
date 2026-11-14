"""Rule-based triage. Needs no API key, so the demo always works (and CI stays offline)."""

import re

from .base import FACT_LABELS, TriageInput, TriageResult, first_name, language_label

# Keyword -> weight, per category. Phrases are matched on word boundaries.
KEYWORDS: dict[str, dict[str, int]] = {
    "complaint": {
        "dirty": 2,
        "not clean": 2,
        "smell": 2,
        "smells": 2,
        "stain": 1,
        "stains": 1,
        "noisy": 2,
        "noise": 2,
        "disappointed": 3,
        "unacceptable": 3,
        "refund": 3,
        "terrible": 3,
        "rude": 3,
        "cockroach": 2,
        "cockroaches": 2,
        "bugs": 2,
        "worst": 3,
        "complain": 3,
        "complaint": 3,
        "not as described": 3,
        "misleading": 3,
    },
    "maintenance": {
        "broken": 2,
        "not working": 2,
        "doesn't work": 2,
        "does not work": 2,
        "stopped working": 2,
        "leak": 2,
        "leaking": 2,
        "hot water": 2,
        "aircon": 2,
        "air con": 2,
        "air conditioner": 2,
        "heater": 2,
        "toilet": 2,
        "blocked": 2,
        "clogged": 2,
        "fridge": 2,
        "power": 1,
        "electricity": 2,
        "lights": 1,
        "tripped": 2,
        "wifi is down": 2,
        "no wifi": 2,
        "no water": 2,
        "flooding": 2,
        "flooded": 2,
        "gas": 3,
        "stove": 2,
    },
    "check_in": {
        "check in": 2,
        "check-in": 2,
        "checkin": 2,
        "arrive": 2,
        "arriving": 2,
        "arrival": 2,
        "key": 2,
        "keys": 2,
        "door code": 3,
        "lockbox": 3,
        "locked out": 3,
        "can't get in": 3,
        "cannot get in": 3,
        "directions": 2,
        "parking": 1,
        "early check": 3,
        "where do we": 1,
        "building entrance": 2,
    },
    "booking_change": {
        "extend": 3,
        "extra night": 3,
        "another night": 3,
        "change the dates": 3,
        "change our dates": 3,
        "change my booking": 3,
        "cancel": 3,
        "cancellation": 3,
        "reschedule": 3,
        "one more guest": 3,
        "extra guest": 3,
        "add a guest": 3,
        "late check-out": 3,
        "late checkout": 3,
        "late check out": 3,
        "shorten": 3,
    },
}

# Signals that need a response now, whatever the category.
URGENT_KEYWORDS: tuple[str, ...] = (
    "locked out",
    "can't get in",
    "cannot get in",
    "no water",
    "no electricity",
    "no power",
    "power cut",
    "smoke",
    "fire",
    "gas smell",
    "smell of gas",
    "flood",
    "flooding",
    "flooded",
    "injured",
    "hurt",
    "emergency",
    "police",
    "ambulance",
    "unsafe",
    "not safe",
    "broken lock",
    "door won't lock",
    "burst",
    "sparks",
    "stranded",
    "urgent",
    "asap",
    "right now",
)

TIE_ORDER: tuple[str, ...] = ("complaint", "maintenance", "check_in", "booking_change")

TEMPLATES: dict[str, str] = {
    "check_in": (
        "Hi {name}, thanks for your message about check-in at {prop}. "
        "Your self check-in details (door code and directions) are in your booking app. "
        "If anything is unclear, reply here and I'll walk you through it."
    ),
    "complaint": (
        "Hi {name}, I'm really sorry about this, and thank you for telling us. "
        "That isn't the standard we want at {prop}. "
        "I'm arranging for it to be put right and will update you shortly."
    ),
    "maintenance": (
        "Hi {name}, sorry for the trouble at {prop}. "
        "I've passed this to our maintenance team and will confirm a time for them to come by. "
        "Let me know if anything else needs attention."
    ),
    "booking_change": (
        "Hi {name}, thanks for letting us know. "
        "I'm checking availability and pricing for the change at {prop} now "
        "and will come back to you with the options shortly."
    ),
    "general_question": (
        "Hi {name}, thanks for your message! "
        "Happy to help with that. I'll check the details for your stay at {prop} "
        "and get back to you shortly."
    ),
}

URGENT_PREFIX = (
    "This is a priority for us: our team is on it now and will call you within 15 minutes. "
)


def _matches(text: str, phrase: str) -> bool:
    return re.search(r"(?<!\w)" + re.escape(phrase) + r"(?!\w)", text) is not None


def classify(text: str) -> tuple[str, list[str]]:
    """Return the best category and the phrases that decided it."""
    lowered = text.lower().replace("’", "'")
    best, best_score, best_hits = "general_question", 0, []
    for category in TIE_ORDER:
        hits = [p for p in KEYWORDS[category] if _matches(lowered, p)]
        score = sum(KEYWORDS[category][p] for p in hits)
        if score > best_score:
            best, best_score, best_hits = category, score, hits
    return best, best_hits


# Phrases that contain an urgent word but are not urgent for the operator.
NOT_URGENT_PHRASES: tuple[str, ...] = ("family emergency",)


def urgent_signals(text: str) -> list[str]:
    lowered = text.lower().replace("’", "'")
    for phrase in NOT_URGENT_PHRASES:
        lowered = lowered.replace(phrase, " ")
    return [p for p in URGENT_KEYWORDS if _matches(lowered, p)]


# Words that mark a message as Malay or French (several must match). Chinese is spotted by script.
LANGUAGE_WORDS: dict[str, tuple[str, ...]] = {
    "ms": (
        "boleh",
        "tak",
        "tidak",
        "saya",
        "kami",
        "terima kasih",
        "tolong",
        "sejak",
        "esok",
        "pukul",
        "bilik",
        "daftar masuk",
        "keluar",
        "salam",
        "ada",
        "dengan",
        "kenapa",
        "paip",
        "rumah",
        "pagi",
        "malam",
        "nak",
        "ke",
        "di",
    ),
    "fr": (
        "bonjour",
        "merci",
        "nous",
        "vous",
        "est-ce",
        "il y a",
        "y a-t-il",
        "sur place",
        "arrivons",
        "votre",
        "pour",
        "avec",
        "une",
        "le",
        "la",
        "les",
        "est",
        "pas",
        "chambre",
        "voiture",
        "s'il",
    ),
}


def detect_language(text: str) -> str:
    """Best-effort language code from simple word lists. English when unsure."""
    if re.search(r"[\u4e00-\u9fff]", text):
        return "zh"
    lowered = text.lower().replace("\u2019", "'")
    best, best_hits = "en", 1
    for code, words in LANGUAGE_WORDS.items():
        hits = sum(1 for w in words if _matches(lowered, w))
        if hits > best_hits:
            best, best_hits = code, hits
    return best


# Phrases that point at a fact on the property's sheet.
FACT_TRIGGERS: dict[str, tuple[str, ...]] = {
    "wifi": ("wifi", "wi-fi", "internet", "router", "password"),
    "parking": ("park", "parking", "car park", "carpark"),
    "check_in": (
        "check in",
        "check-in",
        "checkin",
        "arrive",
        "arriving",
        "arrival",
        "early check",
        "self check-in",
        "self check in",
    ),
    "check_out": ("check out", "check-out", "checkout", "late check"),
    "pets": ("pet", "pets", "dog", "cat"),
    "house_rules": ("smoking", "smoke inside", "party", "parties", "quiet hours", "noisy", "noise"),
    "cancellation": ("cancel", "cancellation", "refund policy"),
    "max_guests": ("one more guest", "extra guest", "add a guest", "how many guests", "sleeps"),
    "utilities": (
        "leak",
        "leaking",
        "no water",
        "flooding",
        "power cut",
        "no electricity",
        "no power",
        "tripped",
        "fuse",
        "gas",
    ),
    "nearby": ("breakfast", "restaurant", "where to eat", "food nearby", "recommend"),
}


def matching_facts(text: str, facts: dict[str, str]) -> list[str]:
    """Keys of the property facts that this message asks about, in sheet order."""
    lowered = text.lower().replace("\u2019", "'")
    return [
        key
        for key in FACT_LABELS
        if key in facts and any(_matches(lowered, p) for p in FACT_TRIGGERS.get(key, ()))
    ]


def _facts_sentence(keys: list[str], facts: dict[str, str]) -> str:
    return " ".join(f"{FACT_LABELS[k]}: {facts[k].rstrip('.')}." for k in keys)


ANSWER_TEMPLATE = (
    "Hi {name}, thanks for your message! {facts} Just reply here if you need anything else."
)
CHECK_TEMPLATE = (
    "Hi {name}, thanks for your message! I don't want to guess on this one, so I'll check "
    "with the team and get back to you shortly."
)


CLEANING_WORDS = (
    "dirty",
    "not clean",
    "smell",
    "smells",
    "stain",
    "stains",
    "cockroach",
    "cockroaches",
    "bugs",
)


def suggest_task(category: str, hits: list[str], urgent: bool) -> tuple[str, str, int]:
    """(title, assignee, due in minutes) for the team, or ("", "", 0) when nothing to do."""
    topic = ", ".join(hits[:2])
    if category == "maintenance":
        return (f"Maintenance: {topic or 'check the issue'}", "maintenance", 30 if urgent else 240)
    if category == "complaint":
        if any(h in CLEANING_WORDS for h in hits):
            return (f"Cleaning: {topic}", "cleaner", 60 if urgent else 180)
        return (
            f"Follow up on complaint: {topic or 'call the guest'}",
            "host",
            60 if urgent else 240,
        )
    if urgent:
        return ("Call the guest now", "host", 10)
    if category == "booking_change":
        return ("Check availability and update the booking", "host", 240)
    return ("", "", 0)


class OfflineTriager:
    name = "offline"

    def triage(self, item: TriageInput) -> TriageResult:
        language = detect_language(item.body)
        category, hits = classify(item.body)
        signals = urgent_signals(item.body)
        used = matching_facts(item.body, item.facts)
        if hits:
            reason = "Matched: " + ", ".join(f'"{h}"' for h in hits[:3])
        else:
            reason = "No specific topic found."
        if signals:
            reason += " Urgent: " + ", ".join(f'"{s}"' for s in signals[:3]) + "."
        name = first_name(item.guest_name)

        if used and not signals and category in ("check_in", "booking_change", "general_question"):
            # The fact sheet answers the question directly.
            draft = ANSWER_TEMPLATE.format(name=name, facts=_facts_sentence(used, item.facts))
        elif not hits and not signals:
            draft = CHECK_TEMPLATE.format(name=name)
        else:
            draft = TEMPLATES[category].format(name=name, prop=item.property_name)
            if signals:
                draft = draft.replace(f"Hi {name}, ", f"Hi {name}, " + URGENT_PREFIX, 1)
            if used:
                draft += " Useful details: " + _facts_sentence(used, item.facts)

        if language != "en":
            # The rules cannot translate: say so instead of pretending (D5).
            reason += (
                f" Detected: {language_label(language)}. Live AI replies in the guest's language."
            )
            confidence = "low"
        elif used:
            confidence = "high"
        elif hits or signals:
            confidence = "medium"
        else:
            confidence = "low"

        title, assignee, due = suggest_task(category, hits, bool(signals))
        return TriageResult(
            category=category,
            urgent=bool(signals),
            reason=reason,
            draft_reply=draft,
            triaged_by=self.name,
            language=language,
            confidence=confidence,
            facts_used=tuple(used),
            task_title=title,
            task_assignee=assignee,
            task_due_minutes=due,
        )
