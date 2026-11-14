/**
 * The chat with the inbox assistant. The assistant only proposes cards; approving one changes
 * this visitor's own statuses and tasks (saved in the browser, like the rest of the demo).
 */
import type {
  AgentCard,
  AgentReply,
  AgentStateIn,
  AgentTurn,
  Message,
  TaskSuggestion,
  Triage,
} from "../types";
import { type DemoState, addTask, messageKey, setStatus, statusOf } from "./workflow";

export const CHAT_KEY = "gia-chat-v1";
/** Older entries are dropped so the saved chat stays small. */
export const MAX_ENTRIES = 40;
/** Turns sent with each question, so the assistant can follow the conversation. */
export const HISTORY_TURNS = 8;

export type CardState = "pending" | "approved" | "dismissed";

export interface ChatCard extends AgentCard {
  state: CardState;
}

export type ChatEntry =
  | { id: string; role: "host"; text: string; at: number }
  | {
      id: string;
      role: "assistant";
      text: string;
      at: number;
      cards: ChatCard[];
      highlight: number[];
      focus: number | null;
      by: string;
      note: string | null;
    }
  | {
      /** A guest message the host pasted, sorted and answered (never stored on the server). */
      id: string;
      role: "pasted";
      at: number;
      guest: string;
      propertyName: string;
      body: string;
      triage: Triage;
    };

export type AssistantEntry = Extract<ChatEntry, { role: "assistant" }>;

let counter = 0;
export function entryId(now: number = Date.now()): string {
  counter += 1;
  return `${now}-${counter}`;
}

export function assistantEntry(reply: AgentReply, now: number = Date.now()): AssistantEntry {
  return {
    id: entryId(now),
    role: "assistant",
    text: reply.text,
    at: now,
    cards: reply.cards.map((c) => ({ ...c, state: "pending" as const })),
    highlight: reply.highlight,
    focus: reply.focus,
    by: reply.by,
    note: reply.note,
  };
}

export function loadChat(storage: Pick<Storage, "getItem"> | undefined): ChatEntry[] {
  try {
    const raw = storage?.getItem(CHAT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ChatEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveChat(storage: Pick<Storage, "setItem"> | undefined, chat: ChatEntry[]) {
  try {
    storage?.setItem(CHAT_KEY, JSON.stringify(trimChat(chat)));
  } catch {
    // Private mode or full storage: the chat still works for this visit.
  }
}

export function trimChat(chat: ChatEntry[]): ChatEntry[] {
  return chat.length > MAX_ENTRIES ? chat.slice(chat.length - MAX_ENTRIES) : chat;
}

/** The last few host/assistant turns, as text, for the next question. */
export function historyFor(chat: ChatEntry[]): AgentTurn[] {
  return chat
    .filter((e): e is Exclude<ChatEntry, { role: "pasted" }> => e.role !== "pasted")
    .slice(-HISTORY_TURNS)
    .map((e) => ({ role: e.role, text: e.text }));
}

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

/** Mark cards in one entry as approved or dismissed. */
export function setCardState(
  chat: ChatEntry[],
  entry: string,
  indexes: number[],
  state: CardState,
): ChatEntry[] {
  return chat.map((e) =>
    e.id === entry && e.role === "assistant"
      ? {
          ...e,
          cards: e.cards.map((c, i) => (indexes.includes(i) ? { ...c, state } : c)),
        }
      : e,
  );
}

export function pendingIndexes(entry: AssistantEntry): number[] {
  return entry.cards.flatMap((c, i) => (c.state === "pending" ? [i] : []));
}

/** Highlights from the latest assistant answer: these messages light up in the inbox. */
export function latestHighlight(chat: ChatEntry[]): number[] {
  for (let i = chat.length - 1; i >= 0; i -= 1) {
    const e = chat[i];
    if (e.role === "assistant") return e.highlight;
  }
  return [];
}

export function cardTitle(card: AgentCard): string {
  if (card.kind === "draft") return `Reply to ${card.guest_name}`;
  if (card.kind === "status") return `Mark ${card.guest_name} as ${card.status || "new"}`;
  return `Task for ${card.guest_name}`;
}
