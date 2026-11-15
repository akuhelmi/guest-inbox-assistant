import { describe, expect, it } from "vitest";
import { msg } from "./test-data";
import { inView, nextInQueue, queueSort, shiftStats } from "./queue";
import { EMPTY_STATE, addTask, setStatus } from "./workflow";

const NOW = Date.parse("2026-11-14T10:00:00Z");

const urgent = msg(1, 5, { urgent: true });
const overdue = msg(2, 120);
const fresh = msg(3, 10);
const unsure = msg(4, 20, { needs_host: true, confidence: "low" });
const confidentTask = msg(5, 30, {
  confidence: "high",
  suggested_task: { title: "Fix tap", assignee: "maintenance", assignee_label: "Maintenance", due_minutes: 60 },
});
const ALL = [fresh, unsure, overdue, confidentTask, urgent];

describe("queue", () => {
  it("puts urgent, then overdue, then the longest waiting first", () => {
    expect(queueSort(ALL, EMPTY_STATE, NOW).map((m) => m.id)).toEqual([1, 2, 5, 4, 3]);
  });

  it("moves handled messages below the waiting ones", () => {
    const demo = setStatus(EMPTY_STATE, urgent, "replied", NOW);
    const sorted = queueSort(ALL, demo, NOW);
    expect(sorted.at(-1)?.id).toBe(1);
    expect(inView(urgent, demo, "todo")).toBe(false);
    expect(inView(urgent, demo, "replied")).toBe(true);
  });

  it("finds the next waiting message", () => {
    expect(nextInQueue(ALL, EMPTY_STATE, null, NOW)?.id).toBe(1);
    expect(nextInQueue(ALL, EMPTY_STATE, 1, NOW)?.id).toBe(2);
    expect(nextInQueue([urgent], EMPTY_STATE, 1, NOW)).toBeNull();
  });

  it("counts the shift", () => {
    const demo = addTask(EMPTY_STATE, fresh, confidentTask.triage.suggested_task!, NOW);
    expect(shiftStats(ALL, demo, NOW)).toEqual({
      waiting: 5,
      urgent: 1,
      overdue: 1,
      needsHost: 1,
      openTasks: 1,
    });
  });
});
