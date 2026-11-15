"""Rule-based assistant: a fixed set of commands that work without any AI.

Used for the opening briefing, when no AI key is set, when the AI fails and when a visitor
has used up the day's AI replies. It reads the inbox and proposes the saved drafts and tasks.
"""

import re

from ..triage.base import CATEGORY_LABELS, FACT_LABELS
from ..triage.offline import matching_facts
from .base import (
    MAX_CARDS,
    AgentInput,
    AgentReply,
    Card,
    InboxItem,
    PropertyInfo,
    format_minutes,
    summary_stats,
)

# Clickable suggestions in the chat. Each one is a command these rules understand.
SUGGESTIONS: tuple[str, ...] = (
    "What's urgent?",
    "Handle the urgent ones",
    "Who is waiting too long?",
    "Draft replies for check-in questions",
    "Which ones need me?",
    "Summarise today",
)

HELP = (
    "I can help with the inbox. Try:\n"
    '- "What\'s urgent?" or "Handle the urgent ones"\n'
    '- "Who is waiting too long?" or "Which ones need me?"\n'
    '- "Draft replies for check-in questions" (or complaints, maintenance, bookings)\n'
    '- "Draft a reply to Priya", "Create the task for Priya", "Mark Tom done"\n'
    '- "What\'s the Wi-Fi at Seaview Loft?"\n'
    '- "Summarise today"'
)

CATEGORY_WORDS: dict[str, tuple[str, ...]] = {
    "check_in": ("check-in", "check in", "checkin", "arrival", "arrivals", "arriving"),
    "complaint": ("complaint", "complaints", "unhappy", "complaining"),
    "maintenance": ("maintenance", "repair", "repairs", "broken"),
    "booking_change": ("booking change", "booking changes", "booking", "bookings"),
    "general_question": ("general question", "general questions", "questions"),
}


def _has(text: str, *phrases: str) -> bool:
    return any(re.search(r"(?<!\w)" + re.escape(p) + r"(?!\w)", text) for p in phrases)


def _norm(text: str) -> str:
    return text.lower().replace("’", "'").strip()


def _by_priority(items: list[InboxItem]) -> list[InboxItem]:
    """Urgent first, then the longest wait first."""
    return sorted(items, key=lambda i: (not i.urgent, -i.wait_minutes))


def _line(i: InboxItem) -> str:
    wait = f"waiting {format_minutes(i.wait_minutes)}" if i.status == "new" else i.status
    flags = []
    if i.urgent:
        flags.append("urgent")
    if i.overdue:
        flags.append("overdue")
    flag = f", {' and '.join(flags)}" if flags else ""
    return f"- {i.guest_name} ({i.property_name}, {CATEGORY_LABELS[i.category]}, {wait}{flag})"


def _list_reply(intro: str, items: list[InboxItem], empty: str) -> AgentReply:
    if not items:
        return AgentReply(text=empty)
    ordered = _by_priority(items)
    return AgentReply(
        text=intro + "\n" + "\n".join(_line(i) for i in ordered),
        highlight=tuple(i.id for i in ordered),
    )


def draft_card(i: InboxItem) -> Card:
    return Card(
        kind="draft",
        message_id=i.id,
        draft=i.draft_reply,
        language=i.language,
        confidence=i.confidence,
        facts_used=i.facts_used,
    )


def task_card(i: InboxItem) -> Card | None:
    if not i.task_title or i.open_tasks:
        return None
    return Card(
        kind="task",
        message_id=i.id,
        task_title=i.task_title,
        task_assignee=i.task_assignee,
        task_due_minutes=i.task_due_minutes,
    )


def mentioned_guests(text: str, items: tuple[InboxItem, ...]) -> list[InboxItem]:
    """Messages whose guest is named in the text (full or first name)."""
    found = []
    for i in items:
        full = i.guest_name.lower()
        first = full.split(" ")[0]
        if _has(text, full) or (len(first) > 2 and _has(text, first)):
            found.append(i)
    return found


def mentioned_property(text: str, props: tuple[PropertyInfo, ...]) -> PropertyInfo | None:
    for p in props:
        name = p.name.lower()
        if _has(text, name) or _has(text, name.split(" ")[0]):
            return p
    return None


def mentioned_category(text: str) -> str | None:
    for category, words in CATEGORY_WORDS.items():
        if _has(text, *words):
            return category
    return None


class RulesAgent:
    name = "rules"

    def respond(self, item: AgentInput) -> AgentReply:
        text = _norm(item.text)
        items = item.items
        new = [i for i in items if i.status == "new"]

        target = item.item(item.focus_id) if item.focus_id is not None else None
        if target is not None:
            return self.for_message(text, target, item)

        if not text or _has(text, "brief", "briefing", "start of shift"):
            return self.briefing(item)
        if _has(text, "help", "what can you do", "commands"):
            return AgentReply(text=HELP)

        guests = mentioned_guests(text, items)
        if guests:
            return self.about_guests(text, guests)

        wants_draft = _has(text, "draft", "drafts", "reply", "replies", "answer", "respond")
        category = mentioned_category(text)

        if _has(text, "urgent", "emergency", "emergencies"):
            urgent = [i for i in new if i.urgent]
            if _has(text, "handle", "deal with", "sort out", "take care", "fix") or wants_draft:
                return self.handle(urgent, "No urgent messages are waiting. Nice.")
            return _list_reply(
                f"{len(urgent)} urgent message{'s' if len(urgent) != 1 else ''} still "
                "need a reply:",
                urgent,
                "No urgent messages are waiting for a reply.",
            )
        if wants_draft and category:
            picked = [i for i in new if i.category == category]
            label = CATEGORY_LABELS[category].lower()
            return self.drafts(picked, f"No new {label} messages are waiting.")
        if wants_draft and _has(text, "all", "everything", "every"):
            return self.drafts(new, "Every message has a reply already.")
        if _has(text, "overdue", "waiting", "too long", "late", "slow", "behind"):
            late = [i for i in items if i.overdue]
            return _list_reply(
                f"{len(late)} guest{'s have' if len(late) != 1 else ' has'} waited past the "
                "reply target (15 min for urgent, 1 h for the rest):",
                late,
                "Nobody is waiting past the reply target. Good going.",
            )
        if _has(text, "need me", "needs me", "needs host", "need host", "not sure", "unsure"):
            unsure = [i for i in new if i.needs_host]
            return _list_reply(
                "These need you: I'm not sure enough to answer them on my own.",
                unsure,
                "Nothing needs you right now: every new message has a confident draft.",
            )
        if _has(text, "task", "tasks"):
            return self.tasks(text, new, items)
        prop = mentioned_property(text, item.properties)
        if prop:
            return self.facts(text, prop)
        if _has(
            text,
            "summary",
            "summarise",
            "summarize",
            "today",
            "how are we",
            "how did we",
            "how is it going",
            "dashboard",
            "stats",
            "numbers",
            "report",
            "shift",
        ):
            return self.summary(item)
        if category:
            label = CATEGORY_LABELS[category].lower()
            return _list_reply(
                f"New {label} messages:",
                [i for i in new if i.category == category],
                f"No new {label} messages.",
            )
        return AgentReply(text="I didn't catch that. " + HELP)

    # --- answers -------------------------------------------------------------------------

    def for_message(self, text: str, target: InboxItem, item: AgentInput) -> AgentReply:
        """The host has one message open: propose actions for it, or answer about it."""
        if not text or _has(text, "suggest", "propose", "redo", "again", "what should", "handle"):
            return self.proposals(target)
        prop = item.prop(target.property_id)
        keys = matching_facts(text, prop.facts) if prop else []
        if prop and keys and not _has(text, "draft", "reply", "task", "mark"):
            lines = [f"- {FACT_LABELS[k]}: {prop.facts[k]}" for k in keys]
            return AgentReply(
                text=f"{prop.name}, from its fact sheet:\n" + "\n".join(lines),
                highlight=(target.id,),
                focus=target.id,
            )
        return self.about_guests(text, [target])

    def proposals(self, target: InboxItem) -> AgentReply:
        cards: list[Card] = []
        if target.status == "new":
            cards.append(draft_card(target))
        task = task_card(target)
        if task:
            cards.append(task)
        cards.append(
            Card(
                kind="status",
                message_id=target.id,
                status="done" if target.status == "replied" else "replied",
            )
        )
        lead = (
            "I'm not sure enough to answer this alone: check the draft before sending."
            if target.needs_host
            else "Here's what I'd do. Edit anything, then approve."
        )
        return AgentReply(
            text=lead, cards=tuple(cards[:MAX_CARDS]), highlight=(target.id,), focus=target.id
        )

    def briefing(self, item: AgentInput) -> AgentReply:
        stats = summary_stats(item.items, sum(len(i.open_tasks) for i in item.items))
        urgent = _by_priority([i for i in item.items if i.urgent and i.status == "new"])
        parts = [
            f"Hello. {stats['new']} messages are waiting for a reply, "
            f"{stats['urgent_new']} of them urgent, and {stats['overdue']} "
            "past the reply target."
        ]
        if stats["needs_host_new"]:
            n = stats["needs_host_new"]
            parts.append(f"{n} {'needs' if n == 1 else 'need'} you to check before replying.")
        if urgent:
            first = urgent[0]
            body = first.body if len(first.body) <= 90 else first.body[:90].rstrip() + "…"
            parts.append(f'Start with {first.guest_name} at {first.property_name}: "{body}"')
        parts.append('Ask me anything about the inbox, or say "handle the urgent ones".')
        return AgentReply(text=" ".join(parts), highlight=tuple(i.id for i in urgent))

    def summary(self, item: AgentInput) -> AgentReply:
        stats = summary_stats(item.items, sum(len(i.open_tasks) for i in item.items))
        counts: dict[str, int] = {}
        for i in item.items:
            counts[i.category] = counts.get(i.category, 0) + 1
        by_category = ", ".join(
            f"{CATEGORY_LABELS[c]} {n}" for c, n in sorted(counts.items(), key=lambda x: -x[1])
        )
        avg = stats["avg_reply_minutes"]
        lines = [
            "Today so far:",
            f"- Messages: {stats['total']} ({stats['new']} new, {stats['replied']} replied, "
            f"{stats['done']} done)",
            f"- Urgent still waiting: {stats['urgent_new']}; past the reply target: "
            f"{stats['overdue']}",
            f"- Need you to check: {stats['needs_host_new']}",
            f"- Open tasks: {stats['open_tasks']}",
            f"- Average reply time: {format_minutes(avg) if avg is not None else 'no replies yet'}",
            f"- By topic: {by_category}",
        ]
        return AgentReply(text="\n".join(lines))

    def handle(self, picked: list[InboxItem], empty: str) -> AgentReply:
        if not picked:
            return AgentReply(text=empty)
        ordered = _by_priority(picked)
        cards: list[Card] = []
        for i in ordered:
            cards.append(draft_card(i))
            task = task_card(i)
            if task:
                cards.append(task)
        cards = cards[:MAX_CARDS]
        names = ", ".join(i.guest_name for i in ordered)
        return AgentReply(
            text=f"Here's what I'd do for {names}. Check each card, then approve.",
            cards=tuple(cards),
            highlight=tuple(i.id for i in ordered),
            focus=ordered[0].id,
        )

    def drafts(self, picked: list[InboxItem], empty: str) -> AgentReply:
        if not picked:
            return AgentReply(text=empty)
        ordered = _by_priority(picked)[:MAX_CARDS]
        unsure = sum(1 for i in ordered if i.needs_host)
        note = f" {unsure} of them need you to check first." if unsure else ""
        return AgentReply(
            text=f"{len(ordered)} draft{'s' if len(ordered) != 1 else ''} ready from the "
            f"property facts.{note} Approving a draft marks the message Replied.",
            cards=tuple(draft_card(i) for i in ordered),
            highlight=tuple(i.id for i in ordered),
        )

    def about_guests(self, text: str, guests: list[InboxItem]) -> AgentReply:
        ordered = _by_priority(guests)[:MAX_CARDS]
        ids = tuple(i.id for i in ordered)
        status = None
        if _has(text, "done", "close", "closed", "resolved", "finished"):
            status = "done"
        elif _has(text, "replied", "answered"):
            status = "replied"
        elif _has(text, "reopen", "re-open", "mark new", "as new"):
            status = "new"
        if status:
            return AgentReply(
                text=f"Mark {', '.join(i.guest_name for i in ordered)} as {status}?",
                cards=tuple(Card(kind="status", message_id=i.id, status=status) for i in ordered),
                highlight=ids,
            )
        if _has(text, "task", "tasks"):
            cards = [c for c in (task_card(i) for i in ordered) if c]
            if not cards:
                return AgentReply(
                    text="No task to suggest there (or it already has an open task).",
                    highlight=ids,
                    focus=ordered[0].id,
                )
            return AgentReply(
                text="Here's the task I'd create. Edit it if needed, then approve.",
                cards=tuple(cards),
                highlight=ids,
                focus=ordered[0].id,
            )
        if _has(text, "draft", "reply", "answer", "respond", "write", "handle"):
            cards = [draft_card(i) for i in ordered]
            if _has(text, "handle"):
                cards += [c for c in (task_card(i) for i in ordered) if c]
            return AgentReply(
                text="Here's my draft. Edit it if needed; approving marks the message Replied.",
                cards=tuple(cards[:MAX_CARDS]),
                highlight=ids,
                focus=ordered[0].id,
            )
        first = ordered[0]
        return AgentReply(
            text=f"{first.guest_name} at {first.property_name} ({CATEGORY_LABELS[first.category]}"
            f'{", urgent" if first.urgent else ""}, {first.status}): "{first.body}"\n'
            'Say "draft a reply" or "create the task" for them.',
            highlight=ids,
            focus=first.id,
        )

    def tasks(self, text: str, new: list[InboxItem], items: tuple[InboxItem, ...]) -> AgentReply:
        open_lines = [f"- {t} ({i.guest_name})" for i in items for t in i.open_tasks]
        if _has(text, "create", "suggest", "make", "add", "need", "needed"):
            cards = [c for c in (task_card(i) for i in _by_priority(new)) if c][:MAX_CARDS]
            if not cards:
                return AgentReply(text="No new tasks to suggest: the open messages are covered.")
            return AgentReply(
                text=f"{len(cards)} task{'s' if len(cards) != 1 else ''} I'd create for the "
                "team. Edit any of them, then approve.",
                cards=tuple(cards),
                highlight=tuple(c.message_id for c in cards),
            )
        if not open_lines:
            return AgentReply(text='No open tasks. Say "suggest tasks" and I\'ll propose some.')
        return AgentReply(text="Open tasks:\n" + "\n".join(open_lines))

    def facts(self, text: str, prop: PropertyInfo) -> AgentReply:
        keys = matching_facts(text, prop.facts)
        if keys:
            lines = [f"- {FACT_LABELS[k]}: {prop.facts[k]}" for k in keys]
            return AgentReply(text=f"{prop.name}, from its fact sheet:\n" + "\n".join(lines))
        lines = [f"- {FACT_LABELS[k]}: {v}" for k, v in prop.facts.items() if k in FACT_LABELS]
        return AgentReply(text=f"{prop.name} ({prop.city}) fact sheet:\n" + "\n".join(lines))
