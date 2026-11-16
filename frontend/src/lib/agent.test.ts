import { describe, expect, it } from "vitest";
import type { AgentCard, AgentReply, Message } from "../types";
import {
  CHAT_KEY,
  MAX_ENTRIES,
  type ChatEntry,
  agentState,
  applyCard,
  assistantEntry,
  cardTitle,
  historyFor,
  isAi,
  latestHighlight,
  loadChat,
  pendingIndexes,
  providerLabel,
  saveChat,
  setCardState,
} from "./agent";
import { EMPTY_STATE, addTask, setStatus, statusOf } from "./workflow";

const NOW = Date.parse("2026-11-14T10:00:00Z");

function msg(id: number, status: Message["status"] = "new"): Message {
  return {
    id,
    guest_name: `Guest ${id}`,
    property_id: 1,
    property_name: "Bangsar Loft",
    property_city: "Kuala Lumpur",
    received_at: "2026-11-14T09:30:00",
    body: "text",
    status,
    replied_at: null,
    channel: "airbnb",
    triage: {
      category: "maintenance",
      category_label: "Maintenance",
      urgent: false,
      reason: "",
      draft_reply: "",
      triaged_by: "saved example",
      language: "en",
      language_label: "English",
      confidence: "medium",
      needs_host: false,
      facts_used: [],
      suggested_task: null,
    },
  };
}

function card(kind: AgentCard["kind"], id: number, extra: Partial<AgentCard> = {}): AgentCard {
  return {
    kind,
    message_id: id,
    guest_name: `Guest ${id}`,
    property_name: "Bangsar Loft",
    draft: kind === "draft" ? "Hi there" : "",
    language: "en",
    language_label: "English",
    confidence: "high",
    needs_host: false,
    facts_used: [],
    status: "",
    task: null,
    ...extra,
  };
}

const PLUMBER = { title: "Plumber", assignee: "maintenance" as const, assignee_label: "Maintenance", due_minutes: 30 };
const MESSAGES = [msg(1), msg(2), msg(3, "done")];

function reply(extra: Partial<AgentReply> = {}): AgentReply {
  return {
    text: "Here you go.",
    cards: [card("draft", 1), card("task", 1, { task: PLUMBER })],
    highlight: [1],
    focus: 1,
    by: "rules",
    ai_left_today: null,
    note: null,
    ...extra,
  };
}

describe("applyCard", () => {
  it("approving a draft marks a new message replied", () => {
    const demo = applyCard(EMPTY_STATE, card("draft", 1), MESSAGES, {}, NOW);
    expect(statusOf(MESSAGES[0], demo)).toEqual({ status: "replied", repliedAt: NOW });
  });

  it("a draft does not reopen or change a message that is already done", () => {
    expect(applyCard(EMPTY_STATE, card("draft", 3), MESSAGES, {}, NOW)).toBe(EMPTY_STATE);
  });

  it("applies status cards", () => {
    const demo = applyCard(EMPTY_STATE, card("status", 2, { status: "done" }), MESSAGES, {}, NOW);
    expect(statusOf(MESSAGES[1], demo).status).toBe("done");
  });

  it("creates the task, with the host's edits when given", () => {
    const plain = applyCard(EMPTY_STATE, card("task", 1, { task: PLUMBER }), MESSAGES, {}, NOW);
    expect(plain.tasks.map((t) => t.title)).toEqual(["Plumber"]);
    const edited = applyCard(
      EMPTY_STATE,
      card("task", 1, { task: PLUMBER }),
      MESSAGES,
      { task: { ...PLUMBER, title: "Plumber, 9am" } },
      NOW,
    );
    expect(edited.tasks[0].title).toBe("Plumber, 9am");
    expect(edited.tasks[0].dueAt).toBe(NOW + 30 * 60000);
  });

  it("ignores cards for unknown messages", () => {
    expect(applyCard(EMPTY_STATE, card("draft", 99), MESSAGES, {}, NOW)).toBe(EMPTY_STATE);
  });
});

describe("chat entries", () => {
  it("cards start pending and can be approved or dismissed one by one", () => {
    const entry = assistantEntry(reply(), NOW);
    expect(pendingIndexes(entry)).toEqual([0, 1]);
    const chat = setCardState([entry], entry.id, [1], "dismissed");
    const updated = chat[0] as typeof entry;
    expect(updated.cards.map((c) => c.state)).toEqual(["pending", "dismissed"]);
    expect(pendingIndexes(updated)).toEqual([0]);
  });

  it("history keeps only host and assistant text, last turns only", () => {
    const chat: ChatEntry[] = [];
    for (let i = 0; i < 6; i += 1) {
      chat.push({ id: `h${i}`, role: "host", text: `q${i}`, at: NOW });
      chat.push(assistantEntry(reply({ text: `a${i}` }), NOW));
    }
    chat.push({
      id: "p",
      role: "pasted",
      at: NOW,
      guest: "Ana",
      propertyName: "Bangsar Loft",
      body: "wifi?",
      triage: MESSAGES[0].triage,
    });
    const history = historyFor(chat);
    expect(history).toHaveLength(8);
    expect(history[0]).toEqual({ role: "host", text: "q2" });
    expect(history.at(-1)).toEqual({ role: "assistant", text: "a5" });
  });

  it("the latest assistant answer decides the highlights", () => {
    const chat: ChatEntry[] = [
      assistantEntry(reply({ highlight: [1] }), NOW),
      { id: "h", role: "host", text: "and now?", at: NOW },
      assistantEntry(reply({ highlight: [2, 3] }), NOW),
    ];
    expect(latestHighlight(chat)).toEqual([2, 3]);
    expect(latestHighlight([])).toEqual([]);
  });

  it("saves, trims and reloads the chat; bad data gives an empty chat", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const chat: ChatEntry[] = Array.from({ length: MAX_ENTRIES + 5 }, (_, i) => ({
      id: `h${i}`,
      role: "host" as const,
      text: `q${i}`,
      at: NOW,
    }));
    saveChat(storage, chat);
    const loaded = loadChat(storage);
    expect(loaded).toHaveLength(MAX_ENTRIES);
    expect(loaded[0]).toMatchObject({ text: "q5" });
    store.set(CHAT_KEY, "{not json");
    expect(loadChat(storage)).toEqual([]);
    expect(loadChat(undefined)).toEqual([]);
  });

  it("card titles", () => {
    expect(cardTitle(card("draft", 1))).toBe("Reply to Guest 1");
    expect(cardTitle(card("status", 1, { status: "done" }))).toBe("Mark Guest 1 as done");
    expect(cardTitle(card("task", 1))).toBe("Task for Guest 1");
  });
});

describe("agentState", () => {
  it("sends only the visitor's own changes, keyed by message id", () => {
    let demo = setStatus(EMPTY_STATE, MESSAGES[0], "replied", NOW);
    demo = addTask(demo, MESSAGES[1], PLUMBER, NOW);
    expect(agentState(MESSAGES, demo)).toEqual({
      statuses: { 1: { status: "replied", replied_at_ms: NOW } },
      tasks: [{ message_id: 2, title: "Plumber", done: false }],
    });
  });
});

describe("provider labels", () => {
  it("treats Gemini and local Claude as AI, fallbacks as quick commands", () => {
    expect(isAi("gemini")).toBe(true);
    expect(isAi("claude")).toBe(true);
    expect(isAi("rules")).toBe(false);
    expect(isAi("rules (fallback)")).toBe(false);
    expect(isAi("offline")).toBe(false);
  });

  it("names each provider", () => {
    expect(providerLabel("claude")).toBe("Claude (local)");
    expect(providerLabel("gemini")).toBe("Google Gemini");
    expect(providerLabel("offline")).toBe("Offline rules (no AI key)");
  });
});
