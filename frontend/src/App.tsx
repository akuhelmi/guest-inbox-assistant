import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { type CardEdit, ChatView } from "./chat-ui";
import { FactSheet, MessageRow, TriagePanel } from "./components";
import {
  type ChatEntry,
  agentState,
  applyCard,
  assistantEntry,
  entryId,
  historyFor,
  isAi,
  latestHighlight,
  loadChat,
  providerLabel,
  saveChat,
  setCardState,
} from "./lib/agent";
import { countByFilter, filterMessages, timeAgo } from "./lib/inbox";
import {
  type DemoState,
  EMPTY_STATE,
  addTask,
  loadState,
  messageKey,
  saveState,
  setStatus,
  statusOf,
  tasksFor,
  toggleTask,
  STATUS_LABELS,
  waitInfo,
} from "./lib/workflow";
import type { AgentReply, Filter, LiveTriage, Message, Meta, Property, Status } from "./types";
import { StatusControl, TaskSuggestionCard, TasksView, WaitChip } from "./workflow-ui";

type View = "inbox" | "tasks";
type StatusFilter = "any" | Status;
/** On a phone only one pane shows at a time. */
type Pane = "chat" | "side";

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
  { key: "all", label: "All" },
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
  const [filter, setFilter] = useState<Filter>("all");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [demo, setDemo] = useState<DemoState>(() => loadState(browserStorage()));
  const [chat, setChat] = useState<ChatEntry[]>(() => loadChat(browserStorage()));
  const [busy, setBusy] = useState(false);
  const [aiLeft, setAiLeft] = useState<number | null>(null);
  const [view, setView] = useState<View>("inbox");
  const [pane, setPane] = useState<Pane>("chat");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("any");
  const [now, setNow] = useState(() => Date.now());
  const briefed = useRef(false);

  useEffect(() => saveState(browserStorage(), demo), [demo]);
  useEffect(() => saveChat(browserStorage(), chat), [chat]);

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
    async (text: string, history: ReturnType<typeof historyFor>) => {
      setBusy(true);
      try {
        const reply = await api.agent(text, history, agentState(messages, demo));
        setChat((c) => [...c, assistantEntry(reply)]);
        if (reply.ai_left_today !== null) setAiLeft(reply.ai_left_today);
        if (reply.focus !== null) {
          setView("inbox");
          setDetailId(reply.focus);
        }
      } catch (e) {
        setChat((c) => [...c, assistantEntry(errorReply((e as Error).message))]);
      } finally {
        setBusy(false);
      }
    },
    [messages, demo],
  );

  // Opening briefing: the assistant starts the shift with a summary (free, no AI call).
  useEffect(() => {
    if (briefed.current || messages.length === 0 || chat.length > 0) return;
    briefed.current = true;
    void ask("", []);
  }, [messages, chat.length, ask]);

  const highlight = useMemo(() => new Set(latestHighlight(chat)), [chat]);
  const visible = useMemo(
    () =>
      filterMessages(messages, filter).filter(
        (m) => statusFilter === "any" || statusOf(m, demo).status === statusFilter,
      ),
    [messages, filter, statusFilter, demo],
  );
  const counts = useMemo(() => countByFilter(messages), [messages]);
  const statusCounts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      any: messages.length,
      new: 0,
      replied: 0,
      done: 0,
    };
    for (const m of messages) c[statusOf(m, demo).status] += 1;
    return c;
  }, [messages, demo]);
  const openTasks = demo.tasks.filter((t) => !t.done).length;
  const detail = messages.find((m) => m.id === detailId) ?? null;

  function send(text: string) {
    const history = historyFor(chat);
    setChat((c) => [...c, { id: entryId(), role: "host", text, at: Date.now() }]);
    void ask(text, history);
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

  function approve(entry: string, indexes: number[], edits: Record<number, CardEdit>) {
    const found = chat.find((e) => e.id === entry);
    if (!found || found.role !== "assistant") return;
    setDemo((d) =>
      indexes.reduce(
        (acc, i) => applyCard(acc, found.cards[i], messages, edits[i] ?? {}),
        d,
      ),
    );
    setChat((c) => setCardState(c, entry, indexes, "approved"));
  }

  function openMessage(id: number, showOnPhone = true) {
    setView("inbox");
    setDetailId(id);
    if (showOnPhone) setPane("side");
  }

  function reset() {
    setDemo(EMPTY_STATE);
    setChat([]);
    setDetailId(null);
    briefed.current = false;
  }

  const aiLabel = meta
    ? isAi(meta.provider)
      ? `AI replies left today: ${aiLeft ?? meta.agent_limit_per_day}`
      : "Quick commands (no AI key)"
    : "";

  return (
    <div className="page page-wide">
      <header className="header">
        <div>
          <h1>Guest Inbox Assistant</h1>
          <p className="muted">
            Run the guest inbox by talking to an assistant. It sorts, drafts and plans; you
            approve every change.
          </p>
        </div>
        <div className="header-tags">
          <span className="tag">Demo · fake data</span>
          {meta && <span className="tag tag-ai">AI: {providerLabel(meta.provider)}</span>}
        </div>
      </header>

      {loadError && <p className="error">Could not load the inbox: {loadError}</p>}

      <div className="pane-switch" role="tablist" aria-label="Show">
        <button
          type="button"
          role="tab"
          aria-selected={pane === "chat"}
          className={`seg${pane === "chat" ? " seg-on" : ""}`}
          onClick={() => setPane("chat")}
        >
          Assistant
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pane === "side" && view === "inbox"}
          className={`seg${pane === "side" && view === "inbox" ? " seg-on" : ""}`}
          onClick={() => {
            setPane("side");
            setView("inbox");
          }}
        >
          Inbox {statusCounts.new}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pane === "side" && view === "tasks"}
          className={`seg${pane === "side" && view === "tasks" ? " seg-on" : ""}`}
          onClick={() => {
            setPane("side");
            setView("tasks");
          }}
        >
          Tasks {openTasks}
        </button>
      </div>

      <main className={`shell shell-${pane}`}>
        <div className="chat-col">
          <ChatView
            chat={chat}
            busy={busy}
            suggestions={meta?.suggestions ?? []}
            properties={properties}
            maxChars={meta?.max_message_chars ?? 1000}
            aiLabel={aiLabel}
            onSend={send}
            onPaste={paste}
            onApprove={approve}
            onDismiss={(entry, i) => setChat((c) => setCardState(c, entry, [i], "dismissed"))}
            onOpen={(id) => openMessage(id)}
          />
        </div>

        <aside className="side-col">
          <div className="tabs">
            <div role="tablist" aria-label="View">
              <button
                type="button"
                role="tab"
                className={`tab${view === "inbox" ? " tab-on" : ""}`}
                aria-selected={view === "inbox"}
                onClick={() => {
                  setView("inbox");
                  setDetailId(null);
                }}
              >
                Inbox <span className="tab-badge">{statusCounts.new}</span>
              </button>
              <button
                type="button"
                role="tab"
                className={`tab${view === "tasks" ? " tab-on" : ""}`}
                aria-selected={view === "tasks"}
                onClick={() => setView("tasks")}
              >
                Tasks <span className="tab-badge">{openTasks}</span>
              </button>
            </div>
            <button
              type="button"
              className="link small"
              onClick={reset}
              title="Clear the chat, your statuses and your tasks (saved only in this browser)"
            >
              Reset demo
            </button>
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
              <p className="muted small">
                Your chat, statuses and tasks are saved in this browser only, so other visitors
                never see them.
              </p>
            </section>
          ) : detail ? (
            <div className="detail">
              <button type="button" className="link small back" onClick={() => setDetailId(null)}>
                ← All messages
              </button>
              <MessageDetail
                key={detail.id}
                message={detail}
                meta={meta}
                property={properties.find((p) => p.id === detail.property_id)}
                workflow={
                  <Workflow
                    message={detail}
                    demo={demo}
                    now={now}
                    onStatus={(s) => setDemo((d) => setStatus(d, detail, s))}
                    onTask={(t) => setDemo((d) => addTask(d, detail, t))}
                  />
                }
              />
            </div>
          ) : (
            <div className="list-col">
              <nav className="filters filters-compact" aria-label="Filter messages">
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
              <div className="list-head" role="group" aria-label="Filter by status">
                {(["any", "new", "replied", "done"] as StatusFilter[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`list-head-btn${statusFilter === s ? " list-head-on" : ""}`}
                    onClick={() => setStatusFilter(s)}
                    aria-pressed={statusFilter === s}
                  >
                    {s === "any" ? "All" : STATUS_LABELS[s]}
                    <span className="list-head-count">{statusCounts[s]}</span>
                  </button>
                ))}
              </div>
              <ul className="list" aria-label="Guest messages">
                {visible.map((m) => (
                  <MessageRow
                    key={m.id}
                    message={m}
                    selected={false}
                    highlighted={highlight.has(m.id)}
                    onSelect={() => openMessage(m.id, false)}
                    extra={
                      <>
                        <span className={`status status-${statusOf(m, demo).status}`}>
                          {STATUS_LABELS[statusOf(m, demo).status]}
                        </span>
                        <WaitChip wait={waitInfo(m, demo, now)} />
                      </>
                    }
                  />
                ))}
                {visible.length === 0 && messages.length > 0 && (
                  <li className="muted empty">No messages in this filter.</li>
                )}
              </ul>
            </div>
          )}
        </aside>
      </main>

      <footer className="footer muted small">
        Demo app with invented properties and guests. Nothing is ever sent to a guest. AI-assisted
        build, human-reviewed.
      </footer>
    </div>
  );
}

function Workflow({
  message,
  demo,
  now,
  onStatus,
  onTask,
}: {
  message: Message;
  demo: DemoState;
  now: number;
  onStatus: (s: Status) => void;
  onTask: Parameters<typeof TaskSuggestionCard>[0]["onCreate"];
}) {
  return (
    <>
      <div className="workflow">
        <StatusControl status={statusOf(message, demo).status} onChange={onStatus} />
        <WaitChip wait={waitInfo(message, demo, now)} />
      </div>
      <TaskSuggestionCard
        key={message.id}
        suggestion={message.triage.suggested_task}
        existing={tasksFor(message, demo)}
        onCreate={onTask}
        now={now}
      />
    </>
  );
}

function MessageDetail({
  message,
  meta,
  property,
  workflow,
}: {
  message: Message;
  meta: Meta | null;
  property?: Property;
  workflow: React.ReactNode;
}) {
  const [live, setLive] = useState<LiveTriage | null>(null);
  const [runs, setRuns] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rerun() {
    setBusy(true);
    setError(null);
    try {
      setLive(await api.retriage(message.id));
      setRuns((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article>
      <div className="detail-head">
        <div>
          <h2>{message.guest_name}</h2>
          <p className="muted small">
            {message.property_name}, {message.property_city} · {timeAgo(message.received_at)}
          </p>
        </div>
      </div>
      <blockquote className="body">{message.body}</blockquote>
      {workflow}
      <TriagePanel triage={message.triage} title="Triage" />
      <FactSheet property={property} triage={live?.triage ?? message.triage} />
      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={rerun} disabled={busy}>
          {busy ? "Running…" : `Re-run live (${meta ? providerLabel(meta.provider) : "AI"})`}
        </button>
        {live && (
          <span className="muted small">{live.calls_left_this_hour} live runs left this hour</span>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {live && <TriagePanel key={runs} triage={live.triage} title="Live result" fresh />}
    </article>
  );
}

