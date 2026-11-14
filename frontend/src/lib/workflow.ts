/**
 * The operator's own actions: message status and tasks. They are saved in this browser only
 * (localStorage), so every visitor starts from the same inbox and nobody changes it for others.
 */
import type { Message, Status, TaskSuggestion } from "../types";
import { parseUtc } from "./inbox";

export const STORAGE_KEY = "gia-demo-v2";

export const STATUS_LABELS: Record<Status, string> = {
  new: "New",
  replied: "Replied",
  done: "Done",
};

/** Reply-time targets: urgent messages within 15 minutes, the rest within an hour. */
export const REPLY_TARGET_MINUTES = { urgent: 15, normal: 60 };

export interface StatusEntry {
  status: Status;
  repliedAt?: number;
}

export interface Task {
  id: string;
  messageKey: string;
  guest: string;
  property: string;
  title: string;
  assignee: string;
  assigneeLabel: string;
  dueAt: number;
  done: boolean;
}

export interface DemoState {
  statuses: Record<string, StatusEntry>;
  tasks: Task[];
}

export const EMPTY_STATE: DemoState = { statuses: {}, tasks: [] };

/** Stable per message even if the demo data is reseeded with new ids. */
export function messageKey(m: Message): string {
  return `${m.id}:${m.guest_name}`;
}

export function loadState(storage: Pick<Storage, "getItem"> | undefined): DemoState {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    return {
      statuses: parsed.statuses && typeof parsed.statuses === "object" ? parsed.statuses : {},
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    };
  } catch {
    return EMPTY_STATE;
  }
}

export function saveState(storage: Pick<Storage, "setItem"> | undefined, state: DemoState): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or full storage: the demo still works for this visit.
  }
}

/** The visitor's status if they changed it, else the message's starting status. */
export function statusOf(m: Message, state: DemoState): StatusEntry {
  const own = state.statuses[messageKey(m)];
  if (own) return own;
  return {
    status: m.status,
    repliedAt: m.replied_at ? parseUtc(m.replied_at) : undefined,
  };
}

export function setStatus(
  state: DemoState,
  m: Message,
  status: Status,
  now: number = Date.now(),
): DemoState {
  const current = statusOf(m, state);
  // Keep the first reply time; reopening clears it.
  const repliedAt = status === "new" ? undefined : (current.repliedAt ?? now);
  return {
    ...state,
    statuses: { ...state.statuses, [messageKey(m)]: { status, repliedAt } },
  };
}

export function addTask(
  state: DemoState,
  m: Message,
  task: Pick<TaskSuggestion, "title" | "assignee" | "assignee_label" | "due_minutes">,
  now: number = Date.now(),
): DemoState {
  const created: Task = {
    id: `${messageKey(m)}:${now}`,
    messageKey: messageKey(m),
    guest: m.guest_name,
    property: m.property_name,
    title: task.title.trim() || "Follow up",
    assignee: task.assignee,
    assigneeLabel: task.assignee_label,
    dueAt: now + task.due_minutes * 60000,
    done: false,
  };
  return { ...state, tasks: [...state.tasks, created] };
}

export function toggleTask(state: DemoState, id: string): DemoState {
  return {
    ...state,
    tasks: state.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
  };
}

export function tasksFor(m: Message, state: DemoState): Task[] {
  return state.tasks.filter((t) => t.messageKey === messageKey(m));
}

/** Open tasks first (soonest due first), then done ones. */
export function sortedTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || a.dueAt - b.dueAt);
}

export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

export interface WaitInfo {
  /** Minutes the guest waited (so far, or until the reply). */
  minutes: number;
  replied: boolean;
  overdue: boolean;
  label: string;
}

/** How long the guest has waited, against the reply-time target. */
export function waitInfo(m: Message, state: DemoState, now: number = Date.now()): WaitInfo {
  const target = m.triage.urgent ? REPLY_TARGET_MINUTES.urgent : REPLY_TARGET_MINUTES.normal;
  const entry = statusOf(m, state);
  const received = parseUtc(m.received_at);
  const end = entry.status === "new" ? now : (entry.repliedAt ?? now);
  const minutes = Math.max(0, (end - received) / 60000);
  const replied = entry.status !== "new";
  const overdue = minutes > target;
  const label = replied
    ? `Replied in ${formatMinutes(minutes)}`
    : overdue
      ? `Overdue · waiting ${formatMinutes(minutes)}`
      : `Waiting ${formatMinutes(minutes)}`;
  return { minutes, replied, overdue, label };
}

/** Due label for a task: "due in 25 min", "overdue by 1 h", "done". */
export function dueLabel(task: Task, now: number = Date.now()): string {
  if (task.done) return "done";
  const minutes = (task.dueAt - now) / 60000;
  return minutes >= 0
    ? `due in ${formatMinutes(minutes)}`
    : `overdue by ${formatMinutes(-minutes)}`;
}
