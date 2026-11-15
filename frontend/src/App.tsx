import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { type CardEdit, ChatView } from "./chat-ui";
import { MessageRow } from "./components";
import {
  type ChatEntry,
  agentState,
  applyCard,
  assistantEntry,
  entryId,
  historyFor,
  isAi,
  loadChat,
  providerLabel,
  saveChat,
  setCardState,
} from "./lib/agent";
import { countByFilter, filterMessages } from "./lib/inbox";
import {
  type Proposal,
  type Threads,
  addHostTurn,
  addReply,
  agreePlan,
  channelLabel,
  ensureThread,
  loadThreads,
  resultText,
  saveThreads,
  setProposal,
  threadFor,
} from "./lib/proposals";
import {
  QUEUE_VIEWS,
  type QueueView,
  inView,
  nextInQueue,
  queueSort,
  shiftStats,
} from "./lib/queue";
import {
  type DemoState,
  EMPTY_STATE,
  STATUS_LABELS,
  loadState,
  messageKey,
  saveState,
  setStatus,
  statusOf,
  tasksFor,
  toggleTask,
  waitInfo,
} from "./lib/workflow";
import type { AgentReply, AgentTurn, Filter, LiveTriage, Message, Meta, Property } from "./types";
import { TasksView, WaitChip } from "./workflow-ui";
import { MessageWorkspace } from "./workspace-ui";

type View = "inbox" | "tasks";

function errorReply(message: string): AgentReply {
  return {
    text: `Sorry, that didn't work: ${message}`,
    cards: [],
    highlight: [],
    focus: null,
    by: "error",
    ai_left_today: null,
    note: null,
  };
}

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All topics" },
  { key: "urgent", label: "Urgent" },
  { key: "needs_host", label: "Needs host" },
  { key: "check_in", label: "Check-in" },
  { key: "complaint", label: "Complaint" },
  { key: "maintenance", label: "Maintenance" },
  { key: "booking_change", label: "Booking change" },
  { key: "general_question", label: "General question" },
];

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [demo, setDemo] = useState<DemoState>(() => loadState(browserStorage()));
  const [chat, setChat] = useState<ChatEntry[]>(() => loadChat(browserStorage()));
  const [threads, setThreads] = useState<Threads>(() => loadThreads(browserStorage()));
  const [busy, setBusy] = useState(false);
  const [wsBusy, setWsBusy] = useState(false);
  const [aiLeft, setAiLeft] = useState<number | null>(null);
  const [view, setView] = useState<View>("inbox");
  const [queueView, setQueueView] = useState<QueueView>("todo");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<number | null>(null);
  const [shift, setShift] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const briefed = useRef(false);

  useEffect(() => saveState(browserStorage(), demo), [demo]);
  useEffect(() => saveChat(browserStorage(), chat), [chat]);
  useEffect(() => saveThreads(browserStorage(), threads), [threads]);

  // Keep the waiting times moving.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    Promise.all([api.messages(), api.meta(), api.properties()])
      .then(([msgs, m, props]) => {
        setMessages(msgs);
        setMeta(m);
        setProperties(props);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  const ask = useCallback(
    async (text: string, history: AgentTurn[]) => {
      setBusy(true);
      try {
        const reply = await api.agent(text, history, agentState(messages, demo));
        setChat((c) => [...c, assistantEntry(reply)]);
        if (reply.ai_left_today !== null) setAiLeft(reply.ai_left_today);
      } catch (e) {
        setChat((c) => [...c, assistantEntry(errorReply((e as Error).message))]);
      } finally {
        setBusy(false);
      }
    },
    [messages, demo],
  );

  // Opening briefing in the Ask panel (free, no AI call).
  useEffect(() => {
    if (briefed.current || messages.length === 0 || chat.length > 0) return;
    briefed.current = true;
    void ask("", []);
  }, [messages, chat.length, ask]);

  const stats = useMemo(() => shiftStats(messages, demo, now), [messages, demo, now]);
  const counts = useMemo(() => countByFilter(messages), [messages]);
  const queue = useMemo(
    () =>
      queueSort(filterMessages(messages, filter), demo, now).filter((m) =>
        inView(m, demo, queueView),
      ),
    [messages, filter, demo, now, queueView],
  );
  const viewCounts = useMemo(() => {
    const c: Record<QueueView, number> = { todo: 0, replied: 0, done: 0, all: messages.length };
    for (const m of messages) {
      const s = statusOf(m, demo).status;
      c[s === "new" ? "todo" : s] += 1;
    }
    return c;
  }, [messages, demo]);
  const open = messages.find((m) => m.id === openId) ?? null;
  const next = open ? nextInQueue(messages, demo, open.id, now) : null;

  function openMessage(id: number) {
    const m = messages.find((x) => x.id === id);
    if (!m) return;
    setThreads((t) => ensureThread(t, m, demo));
    setView("inbox");
    setOpenId(id);
  }

  function goNext() {
    const next = nextInQueue(messages, demo, openId, now);
    if (next) openMessage(next.id);
    else {
      setOpenId(null);
      setShift(false);
      setToast("Inbox clear: every guest has a reply. Nice shift.");
    }
  }

  function startShift() {
    setShift(true);
    setToast(null);
    const first = nextInQueue(messages, demo, null, now);
    if (first) openMessage(first.id);
    else setToast("Nothing waiting: every guest has a reply.");
  }

  function approveProposals(m: Message, picked: Proposal[]) {
    setDemo((d) =>
      picked.reduce((acc, p) => applyCard(acc, p, messages, { task: p.task ?? undefined }), d),
    );
    setThreads((t) =>
      picked.reduce(
        (acc, p) =>
          setProposal(acc, m, demo, p.pid, { state: "approved", result: resultText(p, m.channel) }),
        t,
      ),
    );
  }

  async function askAbout(m: Message, text: string) {
    const thread = threadFor(threads, m, demo);
    const history: AgentTurn[] = thread.turns.slice(-8).map((x) => ({ role: x.role, text: x.text }));
    setThreads((t) => addHostTurn(t, m, demo, text));
    setWsBusy(true);
    try {
      const reply = await api.agent(text, history, agentState(messages, demo), m.id);
      setThreads((t) => addReply(t, m, demo, reply));
      if (reply.ai_left_today !== null) setAiLeft(reply.ai_left_today);
    } catch (e) {
      setThreads((t) => addReply(t, m, demo, errorReply((e as Error).message)));
    } finally {
      setWsBusy(false);
    }
  }

  async function paste(body: string, guest: string, propertyId: number | null) {
    setBusy(true);
    try {
      const result: LiveTriage = await api.triageText(body, guest, propertyId);
      const prop = properties.find((p) => p.id === propertyId);
      setChat((c) => [
        ...c,
        {
          id: entryId(),
          role: "pasted",
          at: Date.now(),
          guest,
          propertyName: prop?.name ?? "our property",
          body,
          triage: result.triage,
        },
      ]);
    } catch (e) {
      setChat((c) => [...c, assistantEntry(errorReply((e as Error).message))]);
    } finally {
      setBusy(false);
    }
  }

  function approveChat(entry: string, indexes: number[], edits: Record<number, CardEdit>) {
    const found = chat.find((e) => e.id === entry);
    if (!found || found.role !== "assistant") return;
    setDemo((d) =>
      indexes.reduce((acc, i) => applyCard(acc, found.cards[i], messages, edits[i] ?? {}), d),
    );
    setChat((c) => setCardState(c, entry, indexes, "approved"));
  }

  function reset() {
    setDemo(EMPTY_STATE);
    setChat([]);
    setThreads({});
    setOpenId(null);
    setShift(false);
    setToast(null);
    briefed.current = false;
  }

  const aiLabel = meta
    ? isAi(meta.provider)
      ? `AI replies left today: ${aiLeft ?? meta.agent_limit_per_day}`
      : "Quick commands (no AI key)"
    : "";

  return (
    <div className="page page-full">
      <header className="header">
        <div>
          <h1>Guest Inbox Assistant</h1>
          <p className="muted">
            Every guest message arrives sorted and reviewed by AI, with a plan. Open one, agree to
            the plan, then go through it step by step.
          </p>
        </div>
        <div className="header-tags">
          <span className="tag">Demo · fake data</span>
          {meta && <span className="tag tag-ai">AI: {providerLabel(meta.provider)}</span>}
        </div>
      </header>

      {loadError && <p className="error">Could not load the inbox: {loadError}</p>}

      <section className="shiftbar" aria-label="Shift">
        <div className="stats">
          <span className="stat">
            <strong>{stats.waiting}</strong> waiting
          </span>
          <span className="stat stat-urgent">
            <strong>{stats.urgent}</strong> urgent
          </span>
          <span className="stat stat-overdue">
            <strong>{stats.overdue}</strong> overdue
          </span>
          <span className="stat stat-host">
            <strong>{stats.needsHost}</strong> need you
          </span>
          <span className="stat">
            <strong>{stats.openTasks}</strong> open tasks
          </span>
        </div>
        <div className="shiftbar-actions">
          <button type="button" className="btn" onClick={startShift} disabled={!messages.length}>
            Start shift
          </button>
          <button
            type="button"
            className="link small"
            onClick={reset}
            title="Clear your statuses, tasks and chats (saved only in this browser)"
          >
            Reset demo
          </button>
        </div>
      </section>

      {toast && (
        <p className="toast" role="status">
          {toast}{" "}
          <button type="button" className="link small" onClick={() => setToast(null)}>
            Close
          </button>
        </p>
      )}

      <main className={`shell2${open ? " has-open" : ""}`}>
        <section className="queue-col">
          <div className="tabs">
            <div role="tablist" aria-label="View">
              <button
                type="button"
                role="tab"
                className={`tab${view === "inbox" ? " tab-on" : ""}`}
                aria-selected={view === "inbox"}
                onClick={() => setView("inbox")}
              >
                Inbox <span className="tab-badge">{stats.waiting}</span>
              </button>
              <button
                type="button"
                role="tab"
                className={`tab${view === "tasks" ? " tab-on" : ""}`}
                aria-selected={view === "tasks"}
                onClick={() => setView("tasks")}
              >
                Tasks <span className="tab-badge">{stats.openTasks}</span>
              </button>
            </div>
          </div>

          {view === "tasks" ? (
            <section className="tasks-panel">
              <TasksView
                tasks={demo.tasks}
                onToggle={(id) => setDemo((s) => toggleTask(s, id))}
                onOpen={(m) => openMessage(m.id)}
                now={now}
                findMessage={(t) => messages.find((m) => messageKey(m) === t.messageKey)}
              />
            </section>
          ) : (
            <>
              <div className="list-head" role="group" aria-label="Show">
                {QUEUE_VIEWS.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    className={`list-head-btn${queueView === v.key ? " list-head-on" : ""}`}
                    onClick={() => setQueueView(v.key)}
                    aria-pressed={queueView === v.key}
                  >
                    {v.label}
                    <span className="list-head-count">{viewCounts[v.key]}</span>
                  </button>
                ))}
              </div>
              <nav className="filters filters-compact" aria-label="Filter by topic">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`filter${filter === f.key ? " filter-on" : ""}${f.key === "urgent" ? " filter-urgent" : ""}${f.key === "needs_host" ? " filter-host" : ""}`}
                    onClick={() => setFilter(f.key)}
                    aria-pressed={filter === f.key}
                  >
                    {f.label} <span className="count">{counts[f.key]}</span>
                  </button>
                ))}
              </nav>
              <ul className="list" aria-label="Guest messages">
                {queue.map((m) => {
                  const s = statusOf(m, demo).status;
                  return (
                    <MessageRow
                      key={m.id}
                      message={m}
                      selected={m.id === openId}
                      onSelect={() => openMessage(m.id)}
                      extra={
                        <>
                          <span className={`channel channel-${m.channel}`}>
                            {channelLabel(m.channel)}
                          </span>
                          <span className={`status status-${s}`}>{STATUS_LABELS[s]}</span>
                          <WaitChip wait={waitInfo(m, demo, now)} />
                        </>
                      }
                    />
                  );
                })}
                {queue.length === 0 && messages.length > 0 && (
                  <li className="muted empty">
                    {queueView === "todo" ? "Nothing waiting here. Nice." : "No messages here."}
                  </li>
                )}
              </ul>
            </>
          )}
        </section>

        <aside className="panel-col">
          {open ? (
            <MessageWorkspace
              key={open.id}
              message={open}
              property={properties.find((p) => p.id === open.property_id)}
              status={statusOf(open, demo).status}
              wait={waitInfo(open, demo, now)}
              tasks={tasksFor(open, demo)}
              thread={threadFor(threads, open, demo)}
              busy={wsBusy}
              aiLabel={aiLabel}
              shift={shift ? { left: stats.waiting } : null}
              onClose={() => {
                setOpenId(null);
                setShift(false);
              }}
              onNext={next ? goNext : null}
              onAgree={() => setThreads((t) => agreePlan(t, open, demo))}
              onApprove={(p) => approveProposals(open, [p])}
              onChange={(p, change) => setThreads((t) => setProposal(t, open, demo, p.pid, change))}
              onDismiss={(p) =>
                setThreads((t) => setProposal(t, open, demo, p.pid, { state: "dismissed" }))
              }
              onStatus={(s) => setDemo((d) => setStatus(d, open, s))}
              onAsk={(text) => void askAbout(open, text)}
              now={now}
            />
          ) : (
            <div className="overview">
              <p className="overview-hint muted small">
                Open a message to see the AI&apos;s review and plan, or ask about the whole inbox
                here.
              </p>
              <ChatView
                chat={chat}
                busy={busy}
                suggestions={meta?.suggestions ?? []}
                properties={properties}
                maxChars={meta?.max_message_chars ?? 1000}
                aiLabel={aiLabel}
                onSend={(text) => {
                  const history = historyFor(chat);
                  setChat((c) => [...c, { id: entryId(), role: "host", text, at: Date.now() }]);
                  void ask(text, history);
                }}
                onPaste={paste}
                onApprove={approveChat}
                onDismiss={(entry, i) => setChat((c) => setCardState(c, entry, [i], "dismissed"))}
                onOpen={(id) => openMessage(id)}
              />
            </div>
          )}
        </aside>
      </main>

      <footer className="footer muted small">
        Demo app with invented properties and guests. Nothing is ever sent to a guest or a team
        member. AI-assisted build, human-reviewed.
      </footer>
    </div>
  );
}
