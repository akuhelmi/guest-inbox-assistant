/**
 * Talking to the assistant API: this visitor's own state (saved in the browser), applying an
 * approved card to it, and the provider labels.
 */
import type { AgentCard, AgentStateIn, Message, TaskSuggestion } from "../types";
import { type DemoState, addTask, messageKey, setStatus, statusOf } from "./workflow";

export type CardState = "pending" | "approved" | "dismissed";

/** This visitor's statuses and tasks, keyed by message id, for the assistant. */
export function agentState(messages: Message[], demo: DemoState): AgentStateIn {
  const byKey = new Map(messages.map((m) => [messageKey(m), m]));
  const statuses: AgentStateIn["statuses"] = {};
  for (const m of messages) {
    if (!demo.statuses[messageKey(m)]) continue;
    const entry = statusOf(m, demo);
    statuses[m.id] = { status: entry.status, replied_at_ms: entry.repliedAt ?? null };
  }
  const tasks = demo.tasks.flatMap((t) => {
    const m = byKey.get(t.messageKey);
    return m ? [{ message_id: m.id, title: t.title, done: t.done }] : [];
  });
  return { statuses, tasks };
}

/** Apply one approved card to the demo state. `edit` holds the host's changes, if any. */
export function applyCard(
  demo: DemoState,
  card: AgentCard,
  messages: Message[],
  edit: { draft?: string; task?: TaskSuggestion } = {},
  now: number = Date.now(),
): DemoState {
  const m = messages.find((x) => x.id === card.message_id);
  if (!m) return demo;
  if (card.kind === "draft") {
    // Nothing is sent from the demo: approving a draft records the reply.
    return statusOf(m, demo).status === "new" ? setStatus(demo, m, "replied", now) : demo;
  }
  if (card.kind === "status" && card.status) return setStatus(demo, m, card.status, now);
  if (card.kind === "task") {
    const task = edit.task ?? card.task;
    return task ? addTask(demo, m, task, now) : demo;
  }
  return demo;
}

const AI_PROVIDERS: Record<string, string> = {
  gemini: "Google Gemini",
  claude: "Claude (local)",
};

/** True when a reply or provider name comes from a live AI, not the quick commands. */
export function isAi(by: string): boolean {
  return Object.keys(AI_PROVIDERS).some((p) => by === p || by.startsWith(`${p} `));
}

export function providerLabel(provider: string): string {
  return AI_PROVIDERS[provider] ?? "Offline rules (no AI key)";
}
