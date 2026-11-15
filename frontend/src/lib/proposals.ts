/**
 * The open message's workspace: a short review, a numbered plan of steps (reply, task, status)
 * that the host agrees to, then one step at a time. Saved in this browser only, like the rest
 * of the demo.
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
  /** The steps of the plan, in order. */
  proposals: Proposal[];
  turns: ThreadTurn[];
  /** The host pressed "Agree & proceed": the steps now come one at a time. */
  agreed?: boolean;
}

const KIND_ORDER: Record<string, number> = { draft: 0, task: 1, status: 2 };

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
    // A simple question is finished once answered; one with follow-up work waits as Replied.
    const target = status === "new" && cards.some((c) => c.kind === "task") ? "replied" : "done";
    cards.push({ ...baseCard(m), kind: "status", status: target });
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
 * Add the AI's answer to the thread. When the answer is a whole plan (`reply.plan`), its cards
 * replace every step not done yet (so the host can drop a step). Otherwise a new card replaces
 * the pending step of the same kind and other new cards become new steps. Finished steps never
 * change. Pending steps stay in plan order: reply, task, status.
 */
export function addReply(
  threads: Threads,
  m: Message,
  demo: DemoState,
  reply: AgentReply,
  now: number = Date.now(),
): Threads {
  const t = threadFor(threads, m, demo);
  const seen = new Set<string>();
  const cards = reply.cards.filter((c) => {
    if (c.message_id !== m.id || seen.has(c.kind)) return false;
    seen.add(c.kind);
    return true;
  });
  const fresh = toProposals(cards, reply.by, now);
  const finished = t.proposals.filter((p) => p.state !== "pending");
  const pending = [
    ...t.proposals.filter((p) => p.state === "pending" && !reply.plan && !seen.has(p.kind)),
    ...fresh,
  ].sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9));
  return put(threads, m, {
    ...t,
    proposals: [...finished, ...pending],
    turns: [...t.turns, { role: "assistant", text: reply.text, by: reply.by, note: reply.note }],
  });
}

export function agreePlan(threads: Threads, m: Message, demo: DemoState): Threads {
  return put(threads, m, { ...threadFor(threads, m, demo), agreed: true });
}

/** The step waiting for the host, or null when the plan is finished. */
export function currentStep(thread: Thread): Proposal | null {
  return thread.proposals.find((p) => p.state === "pending") ?? null;
}

/** One line per step for the plan, e.g. "Reply to Priya on Airbnb". */
export function stepTitle(p: Proposal, m: Message): string {
  if (p.kind === "draft") return `Reply to ${m.guest_name} on ${sendLabel(m.channel).replace("Send on ", "")}`;
  if (p.kind === "status") {
    const label = p.status === "done" ? "Done" : p.status === "new" ? "New" : "Replied";
    return `Move the message to ${label}`;
  }
  const task = p.task;
  if (!task) return "Create a task";
  const who = TEAM[task.assignee];
  return who
    ? `Create a task for ${who.name} and notify them: ${task.title}`
    : `Add a task for yourself: ${task.title}`;
}

/** What the message is about, in a sentence or two, from its saved triage. */
export function reviewText(m: Message): string {
  const t = m.triage;
  const head = `${t.urgent ? "Urgent. " : ""}${t.category_label} from ${m.guest_name} (${channelLabel(m.channel)}, ${m.property_name}).`;
  const extra = t.needs_host ? " The AI isn't sure about the answer: check the reply before it goes." : "";
  return `${head} ${t.reason}${extra}`;
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
