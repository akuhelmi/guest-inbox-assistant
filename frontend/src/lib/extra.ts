/**
 * Messages the visitor added with "New guest message". Kept in this browser only (like the
 * statuses and tasks) and sent with each AI request so the assistant can see them.
 */
import type { ExtraMessageIn, Message } from "../types";
import { parseUtc } from "./inbox";
import { type DemoState, statusOf } from "./workflow";

export const EXTRA_KEY = "gia-extra-v1";
/** Most added messages kept (and sent to the AI). */
export const MAX_EXTRA = 20;

/** Give a composed message its own id: negative, so it never clashes with a saved one. */
export function addExtra(extra: Message[], m: Message): Message[] {
  const id = Math.min(0, ...extra.map((x) => x.id)) - 1;
  return [{ ...m, id, status: "new" as const, replied_at: null }, ...extra].slice(0, MAX_EXTRA);
}

/** The added messages as the assistant API takes them. */
export function extraPayload(
  extra: Message[],
  demo: DemoState,
  now: number = Date.now(),
): ExtraMessageIn[] {
  return extra.map((m) => {
    const t = m.triage;
    const waiting = statusOf(m, demo).status === "new";
    return {
      id: m.id,
      guest_name: m.guest_name,
      property_id: m.property_id,
      wait_minutes: waiting ? Math.max(0, Math.round((now - parseUtc(m.received_at)) / 60000)) : 0,
      category: t.category,
      urgent: t.urgent,
      needs_host: t.needs_host,
      body: m.body,
      draft_reply: t.draft_reply,
      language: t.language,
      confidence: t.confidence,
      task_title: t.suggested_task?.title ?? "",
      task_assignee: t.suggested_task?.assignee ?? "",
      task_due_minutes: t.suggested_task?.due_minutes ?? 0,
    };
  });
}

export function loadExtra(storage: Pick<Storage, "getItem"> | undefined): Message[] {
  try {
    const raw = storage?.getItem(EXTRA_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? (parsed as Message[]).filter((m) => m && typeof m.id === "number" && m.id < 0 && m.triage)
      : [];
  } catch {
    return [];
  }
}

export function saveExtra(storage: Pick<Storage, "setItem"> | undefined, extra: Message[]) {
  try {
    storage?.setItem(EXTRA_KEY, JSON.stringify(extra));
  } catch {
    // Private mode or full storage: the demo still works for this visit.
  }
}
