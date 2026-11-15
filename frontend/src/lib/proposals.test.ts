import { describe, expect, it } from "vitest";
import type { AgentReply } from "../types";
import {
  THREADS_KEY,
  addHostTurn,
  addReply,
  channelLabel,
  ensureThread,
  loadThreads,
  resultText,
  saveThreads,
  savedProposals,
  sendLabel,
  setProposal,
  threadFor,
} from "./proposals";
import { msg } from "./test-data";
import { EMPTY_STATE, addTask, messageKey, setStatus } from "./workflow";

const NOW = Date.parse("2026-11-14T10:00:00Z");
const TASK = {
  title: "Plumber",
  assignee: "maintenance" as const,
  assignee_label: "Maintenance",
  due_minutes: 30,
};
const leak = msg(1, 10, { urgent: true, suggested_task: TASK, confidence: "high" });

function reply(extra: Partial<AgentReply> = {}): AgentReply {
  return {
    text: "Done.",
    cards: [],
    highlight: [],
    focus: 1,
    by: "claude",
    ai_left_today: 29,
    note: null,
    ...extra,
  };
}

describe("saved proposals", () => {
  it("offers a reply, a task and the next status for a waiting message", () => {
    const cards = savedProposals(leak, EMPTY_STATE);
    expect(cards.map((c) => c.kind)).toEqual(["draft", "task", "status"]);
    expect(cards[0].draft).toBe("Hi guest 1");
    expect(cards[2].status).toBe("replied");
  });

  it("skips the reply once replied and the task once one is open", () => {
    let demo = setStatus(EMPTY_STATE, leak, "replied", NOW);
    demo = addTask(demo, leak, TASK, NOW);
    const cards = savedProposals(leak, demo);
    expect(cards.map((c) => c.kind)).toEqual(["status"]);
    expect(cards[0].status).toBe("done");
    expect(savedProposals(leak, setStatus(demo, leak, "done", NOW))).toEqual([]);
  });
});

describe("threads", () => {
  it("keeps proposal ids stable once the thread is saved", () => {
    const threads = ensureThread({}, leak, EMPTY_STATE);
    const first = threadFor(threads, leak, EMPTY_STATE).proposals[0].pid;
    expect(threadFor(threads, leak, EMPTY_STATE).proposals[0].pid).toBe(first);
    expect(ensureThread(threads, leak, EMPTY_STATE)).toBe(threads);
  });

  it("adds AI cards to the proposals, or replaces the pending ones on redo", () => {
    let threads = ensureThread({}, leak, EMPTY_STATE);
    const draft = threadFor(threads, leak, EMPTY_STATE).proposals[0];
    threads = setProposal(threads, leak, EMPTY_STATE, draft.pid, { state: "approved" });
    threads = addHostTurn(threads, leak, EMPTY_STATE, "offer a fan too");
    const card = { ...draft, kind: "draft" as const, draft: "New draft" };
    const other = { ...card, message_id: 2 };
    const added = addReply(threads, leak, EMPTY_STATE, reply({ cards: [card, other] }), false, NOW);
    const t = threadFor(added, leak, EMPTY_STATE);
    expect(t.proposals).toHaveLength(4);
    expect(t.proposals.at(-1)?.source).toBe("claude");
    expect(t.turns.map((x) => x.role)).toEqual(["host", "assistant"]);

    const redone = threadFor(
      addReply(threads, leak, EMPTY_STATE, reply({ cards: [card] }), true, NOW),
      leak,
      EMPTY_STATE,
    );
    expect(redone.proposals.map((p) => p.state)).toEqual(["approved", "pending"]);
  });

  it("saves and loads, tolerating bad data", () => {
    const store: Record<string, string> = {};
    const storage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    };
    const threads = ensureThread({}, leak, EMPTY_STATE);
    saveThreads(storage, threads);
    expect(Object.keys(loadThreads(storage))).toEqual([messageKey(leak)]);
    store[THREADS_KEY] = "[1]";
    expect(loadThreads(storage)).toEqual({});
    store[THREADS_KEY] = "{bad";
    expect(loadThreads(storage)).toEqual({});
  });
});

describe("labels and results", () => {
  it("names the channel and the send button", () => {
    expect(channelLabel("booking")).toBe("Booking.com");
    expect(sendLabel("airbnb")).toBe("Send on Airbnb");
    expect(sendLabel("direct")).toBe("Send on WhatsApp");
  });

  it("says what approving did, including who was nudged", () => {
    const [draft, task, status] = threadFor(ensureThread({}, leak, EMPTY_STATE), leak, EMPTY_STATE)
      .proposals;
    expect(resultText(draft, "booking")).toMatch(/^Sent on Booking.com \(demo/);
    expect(resultText(task, "airbnb")).toContain("Aiman (maintenance) nudged");
    expect(resultText({ ...task, task: { ...TASK, assignee: "host" } }, "airbnb")).toBe(
      "Task added to your own list",
    );
    expect(resultText(status, "airbnb")).toBe("Marked Replied");
  });
});
