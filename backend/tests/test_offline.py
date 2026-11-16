import pytest

from app.seed_data import MESSAGES, PROPERTIES
from app.triage.base import CATEGORIES, TriageInput
from app.triage.offline import (
    OfflineTriager,
    classify,
    detect_language,
    matching_facts,
    urgent_signals,
)

triager = OfflineTriager()


ENGLISH = [m for m in MESSAGES if m.get("language", "en") == "en"]
OTHER_LANGUAGES = [m for m in MESSAGES if m.get("language", "en") != "en"]


@pytest.mark.parametrize("m", ENGLISH, ids=lambda m: m["guest"])
def test_offline_rules_agree_with_every_english_seed_example(m):
    result = triager.triage(TriageInput(m["body"], m["guest"], "Bangsar Loft"))
    assert result.category == m["category"]
    assert result.urgent == m["urgent"]


@pytest.mark.parametrize(
    "text, category",
    [
        ("What's the door code for the lockbox?", "check_in"),
        ("The room was dirty and smelled, I want a refund.", "complaint"),
        ("The fridge is broken.", "maintenance"),
        ("Can we change our dates to next week?", "booking_change"),
        ("Do you have a hairdryer?", "general_question"),
    ],
)
def test_classify_each_category(text, category):
    assert classify(text)[0] == category


def test_unknown_topic_falls_back_to_general_question():
    category, hits = classify("Hello!")
    assert category == "general_question"
    assert hits == []


def test_urgent_signals_and_curly_apostrophe():
    assert "can't get in" in urgent_signals("We can’t get in to the flat")
    assert urgent_signals("Lovely place, thanks") == []


def test_urgent_flag_is_independent_of_category():
    result = triager.triage(TriageInput("Is the pool open? Also there is smoke in the hallway."))
    assert result.urgent is True


def test_draft_uses_first_name_and_property():
    item = TriageInput("The heater is not working", "Maria Lopez", "Kampung Chalet")
    result = triager.triage(item)
    assert result.draft_reply.startswith("Hi Maria,")
    assert "Kampung Chalet" in result.draft_reply
    assert result.triaged_by == "offline"


def test_urgent_draft_promises_a_quick_call():
    result = triager.triage(TriageInput("We are locked out!", "Sam Ong"))
    assert result.urgent
    assert "within 15 minutes" in result.draft_reply
    assert result.category in CATEGORIES


FACTS = {p["key"]: p["facts"] for p in PROPERTIES}


@pytest.mark.parametrize("m", MESSAGES, ids=lambda m: m["guest"])
def test_language_detection_matches_every_seed_example(m):
    assert detect_language(m["body"]) == m.get("language", "en")


def test_seed_examples_only_use_facts_on_their_property_sheet():
    for m in MESSAGES:
        assert set(m["facts_used"]) <= set(FACTS[m["property"]]), m["guest"]
        assert m["confidence"] in ("high", "medium", "low")


@pytest.mark.parametrize("m", OTHER_LANGUAGES, ids=lambda m: m["guest"])
def test_offline_never_pretends_to_translate(m):
    result = triager.triage(TriageInput(m["body"], m["guest"], "Bangsar Loft"))
    assert result.language == m["language"]
    assert result.confidence == "low"
    assert "Live AI replies in the guest's language" in result.reason
    assert result.draft_reply.startswith("Hi ")


def test_wifi_question_is_answered_from_the_fact_sheet():
    facts = FACTS["bangsar"]
    result = triager.triage(
        TriageInput("Hi, what's the wifi password?", "Ana Costa", "Bangsar Loft", facts)
    )
    assert result.facts_used == ("wifi",)
    assert result.confidence == "high"
    assert "bangsar2026" in result.draft_reply


def test_unknown_question_says_it_will_check_instead_of_inventing():
    facts = FACTS["skyline"]
    result = triager.triage(
        TriageInput("Is the rooftop pool heated?", "Ana Costa", "Skyline", facts)
    )
    assert result.facts_used == ()
    assert result.confidence == "low"
    assert "check" in result.draft_reply
    for value in facts.values():
        assert value not in result.draft_reply


def test_facts_are_only_used_when_the_property_has_them():
    assert matching_facts("Can we bring our dog?", FACTS["garden"]) == ["pets"]
    assert matching_facts("Can we bring our dog?", FACTS["skyline"]) == []


def test_maintenance_draft_adds_useful_facts_but_keeps_the_urgent_promise():
    facts = FACTS["kampung"]
    result = triager.triage(
        TriageInput("Power cut, no electricity at all!", "Ben", "Kampung", facts)
    )
    assert result.urgent
    assert "15 minutes" in result.draft_reply
    assert "Fuse box behind the front door" in result.draft_reply


def test_seed_tasks_have_a_known_assignee_and_due_time():
    from app.triage.base import TASK_ASSIGNEES

    tasks = [m["task"] for m in MESSAGES if "task" in m]
    assert len(tasks) >= 10
    for t in tasks:
        assert t["title"] and t["assignee"] in TASK_ASSIGNEES and t["due_minutes"] > 0


@pytest.mark.parametrize(
    "text, assignee",
    [
        ("The fridge is broken.", "maintenance"),
        ("The room was dirty and smelled.", "cleaner"),
        ("The host was rude, I want a refund.", "host"),
        ("We're locked out!", "host"),
        ("Can we extend by another night?", "host"),
    ],
)
def test_offline_suggests_a_task_for_the_right_person(text, assignee):
    result = triager.triage(TriageInput(text, "Ana"))
    assert result.task_assignee == assignee and result.task_title
    assert result.task_due_minutes > 0


def test_no_task_for_a_simple_question():
    result = triager.triage(TriageInput("Do you have a hairdryer?", "Ana"))
    assert (result.task_title, result.task_assignee, result.task_due_minutes) == ("", "", 0)


def test_urgent_tasks_are_due_sooner():
    calm = triager.triage(TriageInput("The aircon stopped working.", "Ana"))
    urgent = triager.triage(TriageInput("Gas smell and the stove is broken!", "Ana"))
    assert urgent.task_due_minutes < calm.task_due_minutes


TEAM_TASKS = [
    m for m in MESSAGES if (m.get("task") or {}).get("assignee") in ("maintenance", "cleaner")
]


@pytest.mark.parametrize("m", TEAM_TASKS, ids=lambda m: m["guest"])
def test_saved_team_drafts_leave_the_arrival_time_to_the_app(m):
    # D26: the app adds who is coming and when, from the team's real day.
    draft = m["draft"].lower()
    for promise in ("within", "on the way", "between", "secepat mungkin", "will be there"):
        assert promise not in draft
