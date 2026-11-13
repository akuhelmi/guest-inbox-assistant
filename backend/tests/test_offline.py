import pytest

from app.seed_data import MESSAGES
from app.triage.base import CATEGORIES, TriageInput
from app.triage.offline import OfflineTriager, classify, urgent_signals

triager = OfflineTriager()


@pytest.mark.parametrize("m", MESSAGES, ids=lambda m: m["guest"])
def test_offline_rules_agree_with_every_seed_example(m):
    result = triager.triage(TriageInput(m["body"], m["guest"], "Seaview Loft"))
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
