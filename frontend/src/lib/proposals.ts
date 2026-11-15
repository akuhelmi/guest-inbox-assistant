/**
 * The open message's workspace: the AI's proposed actions (reply, task, status) and a short
 * conversation about that message. Saved in this browser only, like the rest of the demo.
 */
import type { AgentCard, AgentReply, Message, TaskSuggestion } from "../types";
import { type CardState } from "./agent";
import { type DemoState, messageKey, statusOf, tasksFor } from "./workflow";

export const THREADS_KEY = "gia-threads-v1";
/** Turns kept per message thread. */
export const MAX_TURNS = 20;

export const CHANNEL_LABELS: Record<string, string> = {
  airbnb: "Airbnb",
  booking: "Booking.com",
  direct: "Direct · WhatsApp",
};

export function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? "Direct";
}

/** Short platform name for the send button ("Send on Airbnb"). */
export function sendLabel(channel: string): string {
  if (channel === "booking") return "Send on Booking.com";
  if (channel === "direct") return "Send on WhatsApp";
  return "Send on Airbnb";
}

/** The demo team who gets nudged when a task is created. Invented, like all demo data. */
export const TEAM: Record<TaskSuggestion["assignee"], { name: string; how: string } | null> = {
  maintenance: { name: "Aiman (maintenance)", how: "WhatsApp, with a call in 10 min if not acknowledged" },
  cleaner: { name: "Siti (cleaning)", how: "WhatsApp, with a call in 10 min if not acknowledged" },
  host: null,
};

export interface Proposal extends AgentCard {
  pid: string;
  state: CardState;
  /** What happened when it was approved, e.g. "Sent on Airbnb". */
  result?: string;
  /** "saved" = from the stored triage; otherwise the provider that proposed it. */
  source: string;
}

export interface ThreadTurn {
  role: "host" | "assistant";
  text: string;
  by?: string;
  note?: string | null;
}

export interface Thread {
  proposals: Proposal[];
  turns: ThreadTurn[];
}

export type Threads = Record<string, Thread>;

let counter = 0;
function pid(now: number): string {
  counter += 1;
  return `p${now}-${counter}`;
}

function baseCard(m: Message): Omit<AgentCard, "kind"> {
  return {
    message_id: m.id,
    guest_name: m.guest_name,
    property_name: m.property_name,
    draft: "",
    language: m.triage.language,
    language_label: m.triage.language_label,
    confidence: m.triage.confidence,
    needs_host: m.triage.needs_host,
    facts_used: [],
    status: "",
    task: null,
  };
}

/** The ready proposals for a message, from its saved triage (instant, no AI call). */
export function savedProposals(m: Message, demo: DemoState): AgentCard[] {
  const status = statusOf(m, demo).status;
  const cards: AgentCard[] = [];
  if (status === "new") {
    cards.push({
      ...baseCard(m),
      kind: "draft",
      draft: m.triage.draft_reply,
      facts_used: m.triage.facts_used,
    });
  }
  const task = m.triage.suggested_task;
  if (task && !tasksFor(m, demo).some((t) => !t.done)) {
    cards.push({ ...baseCard(m), kind: "task", task });
  }
  if (status !== "done") {
    cards.push({ ...baseCard(m), kind: "status", status: status === "new" ? "replied" : "done" });
  }
  return cards;
}

export function toProposals(cards: AgentCard[], source: string, now: number = Date.now()) {
  return cards.map((c) => ({ ...c, pid: pid(now), state: "pending" as const, source }));
}

export function threadFor(threads: Threads, m: Message, demo: DemoState): Thread {
  return (
    threads[messageKey(m)] ?? { proposals: toProposals(savedProposals(m, demo), "saved"), turns: [] }
  );
}

function put(threads: Threads, m: Message, thread: Thread): Threads {
  return { ...threads, [messageKey(m)]: { ...thread, turns: thread.turns.slice(-MAX_TURNS) } };
}

/** Make sure the message has a thread saved (so its proposals keep their ids). */
export function ensureThread(threads: Threads, m: Message, demo: DemoState): Threads {
  return threads[messageKey(m)] ? threads : put(threads, m, threadFor(threads, m, demo));
}

export function addHostTurn(threads: Threads, m: Message, demo: DemoState, text: string): Threads {
  const t = threadFor(threads, m, demo);
  return put(threads, m, { ...t, turns: [...t.turns, { role: "host", text }] });
}

/**
 * Add the AI's answer to the thread. With `replace`, its cards replace the pending proposals
 * ("Redo with AI"); otherwise they are added to them. Approved ones always stay.
 */
export function addReply(
  threads: Threads,
  m: Message,
  demo: DemoState,
  reply: AgentReply,
  replace: boolean,
  now: number = Date.now(),
): Threads {
  const t = threadFor(threads, m, demo);
  const fresh = toProposals(
    reply.cards.filter((c) => c.message_id === m.id),
    reply.by,
    now,
  );
  const kept = replace ? t.proposals.filter((p) => p.state === "approved") : t.proposals;
  return put(threads, m, {
    proposals: [...kept, ...fresh],
    turns: [...t.turns, { role: "assistant", text: reply.text, by: reply.by, note: reply.note }],
  });
}

export function setProposal(
  threads: Threads,
  m: Message,
  demo: DemoState,
  id: string,
  change: Partial<Pick<Proposal, "state" | "result" | "draft" | "task">>,
): Threads {
  const t = threadFor(threads, m, demo);
  return put(threads, m, {
    ...t,
    proposals: t.proposals.map((p) => (p.pid === id ? { ...p, ...change } : p)),
  });
}

/** What the host sees after approving a proposal. Nothing is really sent from the demo. */
export function resultText(p: Proposal, channel: string): string {
  if (p.kind === "draft") return `${sendLabel(channel).replace("Send", "Sent")} (demo: nothing is really sent)`;
  if (p.kind === "status") return `Marked ${p.status === "done" ? "Done" : p.status === "new" ? "New" : "Replied"}`;
  const task = p.task;
  if (!task) return "Task created";
  const who = TEAM[task.assignee];
  return who
    ? `Task created. ${who.name} nudged by ${who.how} (demo)`
    : "Task added to your own list";
}

export function loadThreads(storage: Pick<Storage, "getItem"> | undefined): Threads {
  try {
    const raw = storage?.getItem(THREADS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Threads) : {};
  } catch {
    return {};
  }
}

export function saveThreads(storage: Pick<Storage, "setItem"> | undefined, threads: Threads) {
  try {
    storage?.setItem(THREADS_KEY, JSON.stringify(threads));
  } catch {
    // Private mode or full storage: the demo still works for this visit.
  }
}
