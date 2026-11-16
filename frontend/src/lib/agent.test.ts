import { describe, expect, it } from "vitest";
import type { AgentCard, Message } from "../types";
import { agentState, applyCard, isAi, providerLabel } from "./agent";
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
