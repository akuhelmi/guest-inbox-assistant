/**
 * The inbox as a work queue: what needs the host first, the shift numbers, and the
 * "approve all safe ones" batch (confident drafts only; unsure ones stay for the host).
 */
import type { Message, Status } from "../types";
import { parseUtc } from "./inbox";
import { type DemoState, addTask, setStatus, statusOf, tasksFor, waitInfo } from "./workflow";

export type QueueView = "todo" | "replied" | "done" | "all";

export const QUEUE_VIEWS: { key: QueueView; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "replied", label: "Replied" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
];

const STATUS_ORDER: Record<Status, number> = { new: 0, replied: 1, done: 2 };

/** New first (urgent, then overdue, then oldest waiting); then replied and done, newest first. */
export function queueSort(messages: Message[], demo: DemoState, now: number = Date.now()) {
  const rank = (m: Message) => {
    const status = statusOf(m, demo).status;
    const wait = waitInfo(m, demo, now);
    return {
      status: STATUS_ORDER[status],
      urgent: status === "new" && m.triage.urgent ? 0 : 1,
      overdue: status === "new" && wait.overdue ? 0 : 1,
      received: parseUtc(m.received_at),
      isNew: status === "new",
    };
  };
  return [...messages].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra.status !== rb.status) return ra.status - rb.status;
    if (ra.urgent !== rb.urgent) return ra.urgent - rb.urgent;
    if (ra.overdue !== rb.overdue) return ra.overdue - rb.overdue;
    // Waiting messages: oldest first. Handled ones: newest first.
    return ra.isNew ? ra.received - rb.received : rb.received - ra.received;
  });
}

export function inView(m: Message, demo: DemoState, view: QueueView): boolean {
  const status = statusOf(m, demo).status;
  if (view === "all") return true;
  if (view === "todo") return status === "new";
  return status === view;
}

/** The next message still waiting for a reply after `currentId` (wraps to the top). */
export function nextInQueue(
  messages: Message[],
  demo: DemoState,
  currentId: number | null,
  now: number = Date.now(),
): Message | null {
  const todo = queueSort(messages, demo, now).filter((m) => inView(m, demo, "todo"));
  const others = todo.filter((m) => m.id !== currentId);
  return others[0] ?? null;
}

export interface ShiftStats {
  waiting: number;
  urgent: number;
  overdue: number;
  needsHost: number;
  openTasks: number;
}

export function shiftStats(messages: Message[], demo: DemoState, now: number = Date.now()) {
  const waiting = messages.filter((m) => statusOf(m, demo).status === "new");
  return {
    waiting: waiting.length,
    urgent: waiting.filter((m) => m.triage.urgent).length,
    overdue: waiting.filter((m) => waitInfo(m, demo, now).overdue).length,
    needsHost: waiting.filter((m) => m.triage.needs_host).length,
    openTasks: demo.tasks.filter((t) => !t.done).length,
  } satisfies ShiftStats;
}

export interface SafeBatch {
  /** Waiting messages with a confident draft: reply and mark Replied. */
  replies: Message[];
  /** Of those, the ones with a suggested task and no open task yet. */
  tasks: Message[];
  /** Waiting messages left for the host to check. */
  leftForHost: number;
}

export function safeBatch(messages: Message[], demo: DemoState): SafeBatch {
  const waiting = messages.filter((m) => statusOf(m, demo).status === "new");
  const replies = waiting.filter((m) => !m.triage.needs_host && m.triage.confidence === "high");
  const tasks = replies.filter(
    (m) => m.triage.suggested_task && !tasksFor(m, demo).some((t) => !t.done),
  );
  return { replies, tasks, leftForHost: waiting.length - replies.length };
}

export function applySafeBatch(
  demo: DemoState,
  batch: SafeBatch,
  now: number = Date.now(),
): DemoState {
  let next = demo;
  for (const m of batch.tasks) {
    const task = m.triage.suggested_task;
    if (task) next = addTask(next, m, task, now);
  }
  for (const m of batch.replies) next = setStatus(next, m, "replied", now);
  return next;
}
