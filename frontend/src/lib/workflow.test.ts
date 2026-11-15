import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import {
  EMPTY_STATE,
  STORAGE_KEY,
  addTask,
  dueLabel,
  formatMinutes,
  loadState,
  messageKey,
  saveState,
  setStatus,
  sortedTasks,
  statusOf,
  tasksFor,
  toggleTask,
  waitInfo,
} from "./workflow";

const NOW = Date.parse("2026-11-14T10:00:00Z");

function msg(
  id: number,
  minutesAgo: number,
  urgent = false,
  extra: Partial<Message> = {},
): Message {
  return {
    id,
    guest_name: `Guest ${id}`,
    property_id: 1,
    property_name: "Seaview Loft",
    property_city: "Penang",
    received_at: new Date(NOW - minutesAgo * 60000).toISOString().replace("Z", ""),
    body: "text",
    status: "new",
    replied_at: null,
    channel: "airbnb",
    triage: {
      category: "maintenance",
      category_label: "Maintenance",
      urgent,
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
    ...extra,
  };
}

describe("status", () => {
  it("starts from the message's own status, then the visitor's", () => {
    const replied = msg(1, 300, false, {
      status: "replied",
      replied_at: "2026-11-14T05:20:00",
    });
    expect(statusOf(replied, EMPTY_STATE).status).toBe("replied");
    const s1 = setStatus(EMPTY_STATE, replied, "done", NOW);
    expect(statusOf(replied, s1)).toEqual({
      status: "done",
      repliedAt: Date.parse("2026-11-14T05:20:00Z"),
    });
  });

  it("records the first reply time and clears it on reopen", () => {
    const m = msg(1, 10);
    const s1 = setStatus(EMPTY_STATE, m, "replied", NOW);
    const s2 = setStatus(s1, m, "done", NOW + 60000);
    expect(statusOf(m, s2).repliedAt).toBe(NOW);
    expect(statusOf(m, setStatus(s2, m, "new", NOW)).repliedAt).toBeUndefined();
  });
});

describe("reply-time tracking", () => {
  it("is overdue after 15 minutes when urgent, 60 otherwise", () => {
    expect(waitInfo(msg(1, 20, true), EMPTY_STATE, NOW)).toMatchObject({
      overdue: true,
      label: "Overdue · waiting 20 min",
    });
    expect(waitInfo(msg(2, 20, false), EMPTY_STATE, NOW)).toMatchObject({
      overdue: false,
      label: "Waiting 20 min",
    });
  });

  it("stops the clock at the reply", () => {
    const m = msg(1, 30);
    const state = setStatus(EMPTY_STATE, m, "replied", NOW - 18 * 60000);
    expect(waitInfo(m, state, NOW)).toMatchObject({
      replied: true,
      minutes: 12,
      label: "Replied in 12 min",
    });
  });

  it("formats minutes, hours and days", () => {
    expect(formatMinutes(5)).toBe("5 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(95)).toBe("1 h 35 min");
    expect(formatMinutes(60 * 50)).toBe("2 d");
  });
});

describe("tasks", () => {
  const suggestion = {
    title: "Plumber: leak",
    assignee: "maintenance" as const,
    assignee_label: "Maintenance",
    due_minutes: 30,
  };

  it("creates a task linked to its message, and ticks it off", () => {
    const m = msg(1, 5, true);
    const s1 = addTask(EMPTY_STATE, m, suggestion, NOW);
    const [task] = tasksFor(m, s1);
    expect(task).toMatchObject({
      title: "Plumber: leak",
      guest: "Guest 1",
      done: false,
    });
    expect(dueLabel(task, NOW)).toBe("due in 30 min");
    expect(dueLabel(task, NOW + 45 * 60000)).toBe("overdue by 15 min");
    const s2 = toggleTask(s1, task.id);
    expect(dueLabel(tasksFor(m, s2)[0], NOW)).toBe("done");
    expect(tasksFor(msg(2, 5), s2)).toEqual([]);
  });

  it("lists open tasks first, soonest due first", () => {
    let s = addTask(EMPTY_STATE, msg(1, 5), { ...suggestion, due_minutes: 120 }, NOW);
    s = addTask(s, msg(2, 5), { ...suggestion, due_minutes: 10 }, NOW);
    s = addTask(s, msg(3, 5), { ...suggestion, due_minutes: 5 }, NOW);
    s = toggleTask(s, s.tasks[2].id);
    expect(sortedTasks(s.tasks).map((t) => t.guest)).toEqual(["Guest 2", "Guest 1", "Guest 3"]);
  });
});

describe("storage", () => {
  it("round-trips and survives bad data", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const m = msg(1, 5);
    const state = setStatus(EMPTY_STATE, m, "replied", NOW);
    saveState(storage, state);
    expect(loadState(storage).statuses[messageKey(m)].status).toBe("replied");
    store.set(STORAGE_KEY, "not json");
    expect(loadState(storage)).toEqual(EMPTY_STATE);
    expect(loadState(undefined)).toEqual(EMPTY_STATE);
  });
});
