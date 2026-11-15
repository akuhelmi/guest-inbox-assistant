import { describe, expect, it } from "vitest";
import type { AgentReply } from "../types";
import {
  THREADS_KEY,
  addHostTurn,
  addReply,
  agreePlan,
  channelLabel,
  currentStep,
  ensureThread,
  loadThreads,
  resultText,
  saveThreads,
  savedProposals,
  sendLabel,
  setProposal,
  stepTitle,
  reviewText,
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

  it("plans Done straight after the reply when there is no follow-up task", () => {
    const quiet = msg(3, 5, { confidence: "high" });
    const cards = savedProposals(quiet, EMPTY_STATE);
    expect(cards.map((c) => c.kind)).toEqual(["draft", "status"]);
    expect(cards[1].status).toBe("done");
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

  it("swaps a pending step for the AI's new card of the same kind and keeps plan order", () => {
    let threads = ensureThread({}, leak, EMPTY_STATE);
    const [draft, task] = threadFor(threads, leak, EMPTY_STATE).proposals;
    threads = setProposal(threads, leak, EMPTY_STATE, draft.pid, { state: "approved" });
    threads = addHostTurn(threads, leak, EMPTY_STATE, "make the plumber come sooner");
    const newTask = { ...task, task: { ...TASK, due_minutes: 15 } };
    const other = { ...newTask, message_id: 2 };
    const t = threadFor(
      addReply(threads, leak, EMPTY_STATE, reply({ cards: [newTask, newTask, other] }), NOW),
      leak,
      EMPTY_STATE,
    );
    expect(t.proposals.map((p) => [p.kind, p.state])).toEqual([
      ["draft", "approved"],
      ["task", "pending"],
      ["status", "pending"],
    ]);
    expect(t.proposals[1].task?.due_minutes).toBe(15);
    expect(t.proposals[1].source).toBe("claude");
    expect(t.turns.map((x) => x.role)).toEqual(["host", "assistant"]);
  });

  it("lets a whole AI plan drop a step the host doesn't want", () => {
    let threads = ensureThread({}, leak, EMPTY_STATE);
    const [draft, , status] = threadFor(threads, leak, EMPTY_STATE).proposals;
    const plan = reply({ plan: true, cards: [{ ...draft, draft: "Shorter" }, status] });
    threads = addReply(threads, leak, EMPTY_STATE, plan, NOW);
    const t = threadFor(threads, leak, EMPTY_STATE);
    expect(t.proposals.map((p) => p.kind)).toEqual(["draft", "status"]);
    expect(t.proposals[0].draft).toBe("Shorter");
  });

  it("adds a new kind of step in plan order", () => {
    const quiet = msg(3, 5, { confidence: "high" });
    let threads = ensureThread({}, quiet, EMPTY_STATE);
    const draft = threadFor(threads, quiet, EMPTY_STATE).proposals[0];
    const card = { ...draft, kind: "task" as const, task: TASK };
    threads = addReply(threads, quiet, EMPTY_STATE, reply({ cards: [card] }), NOW);
    expect(threadFor(threads, quiet, EMPTY_STATE).proposals.map((p) => p.kind)).toEqual([
      "draft",
      "task",
      "status",
    ]);
  });

  it("walks the plan one step at a time after Agree", () => {
    let threads = ensureThread({}, leak, EMPTY_STATE);
    expect(threadFor(threads, leak, EMPTY_STATE).agreed).toBeFalsy();
    threads = agreePlan(threads, leak, EMPTY_STATE);
    let t = threadFor(threads, leak, EMPTY_STATE);
    expect(t.agreed).toBe(true);
    expect(currentStep(t)?.kind).toBe("draft");
    threads = setProposal(threads, leak, EMPTY_STATE, t.proposals[0].pid, { state: "dismissed" });
    t = threadFor(threads, leak, EMPTY_STATE);
    expect(currentStep(t)?.kind).toBe("task");
    for (const p of t.proposals) {
      threads = setProposal(threads, leak, EMPTY_STATE, p.pid, { state: "approved" });
    }
    expect(currentStep(threadFor(threads, leak, EMPTY_STATE))).toBeNull();
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
  it("writes the review and one line per step", () => {
    const [draft, task, status] = threadFor(ensureThread({}, leak, EMPTY_STATE), leak, EMPTY_STATE)
      .proposals;
    expect(reviewText(leak)).toMatch(/^Urgent\. /);
    expect(stepTitle(draft, leak)).toBe(`Reply to ${leak.guest_name} on Airbnb`);
    expect(stepTitle(task, leak)).toBe(
      "Create a task for Aiman (maintenance) and notify them: Plumber",
    );
    expect(stepTitle(status, leak)).toBe("Move the message to Replied");
  });

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
