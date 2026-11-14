import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { FactSheet, MessageRow, TriagePanel } from "./components";
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
import type { Filter, LiveTriage, Message, Meta, Property, Status } from "./types";
import { StatusControl, TaskSuggestionCard, TasksView, WaitChip } from "./workflow-ui";

type View = "inbox" | "tasks";
type StatusFilter = "any" | Status;

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

function providerLabel(provider: string): string {
  return provider === "gemini" ? "Google Gemini" : "Offline rules (no AI key)";
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [demo, setDemo] = useState<DemoState>(() => loadState(browserStorage()));
  const [view, setView] = useState<View>("inbox");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("any");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => saveState(browserStorage(), demo), [demo]);

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
        setSelectedId(msgs[0]?.id ?? null);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, []);

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
  const selected = messages.find((m) => m.id === selectedId) ?? null;

  function openMessage(m: Message) {
    setView("inbox");
    setFilter("all");
    setStatusFilter("any");
    setSelectedId(m.id);
  }

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>Guest Inbox Assistant</h1>
          <p className="muted">
            Sorts guest messages, flags the urgent ones and drafts a reply. The host stays in
            control.
          </p>
        </div>
        <div className="header-tags">
          <span className="tag">Demo · fake data</span>
          {meta && <span className="tag tag-ai">AI: {providerLabel(meta.provider)}</span>}
        </div>
      </header>

      {loadError && <p className="error">Could not load the inbox: {loadError}</p>}

      <TryItBox meta={meta} properties={properties} />

      <div className="tabs">
        <div role="tablist" aria-label="View">
          <button
            type="button"
            role="tab"
            className={`tab${view === "inbox" ? " tab-on" : ""}`}
            aria-selected={view === "inbox"}
            onClick={() => setView("inbox")}
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
          onClick={() => setDemo(EMPTY_STATE)}
          title="Clear your statuses and tasks (saved only in this browser)"
        >
          Reset demo
        </button>
      </div>

      {view === "tasks" ? (
        <section className="tasks-panel">
          <TasksView
            tasks={demo.tasks}
            onToggle={(id) => setDemo((s) => toggleTask(s, id))}
            onOpen={openMessage}
            now={now}
            findMessage={(t) => messages.find((m) => messageKey(m) === t.messageKey)}
          />
          <p className="muted small">
            Your statuses and tasks are saved in this browser only, so other visitors never see
            them.
          </p>
        </section>
      ) : (
        <>
          <nav className="filters" aria-label="Filter messages">
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

          <main className="layout">
            <div className="list-col">
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
                    selected={m.id === selectedId}
                    onSelect={() => setSelectedId(m.id)}
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
            <div className="detail">
              {selected ? (
                <MessageDetail
                  key={selected.id}
                  message={selected}
                  meta={meta}
                  property={properties.find((p) => p.id === selected.property_id)}
                  workflow={
                    <Workflow
                      message={selected}
                      demo={demo}
                      now={now}
                      onStatus={(s) => setDemo((d) => setStatus(d, selected, s))}
                      onTask={(t) => setDemo((d) => addTask(d, selected, t))}
                    />
                  }
                />
              ) : (
                <p className="muted">Select a message.</p>
              )}
            </div>
          </main>
        </>
      )}

      <footer className="footer muted small">
        Demo app with invented properties and guests. AI-assisted build, human-reviewed.
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

function TryItBox({ meta, properties }: { meta: Meta | null; properties: Property[] }) {
  const max = meta?.max_message_chars ?? 1000;
  const [text, setText] = useState("");
  const [guest, setGuest] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const propertyId = picked ?? properties[0]?.id ?? null;
  const property = properties.find((p) => p.id === propertyId);
  const [result, setResult] = useState<LiveTriage | null>(null);
  const [runs, setRuns] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await api.triageText(text.trim(), guest.trim() || "Guest", propertyId));
      setRuns((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tryit">
      <form onSubmit={submit}>
        <h2>Try your own guest message</h2>
        <p className="muted small">
          Type any message a guest might send, in any language. It is sorted and answered live from
          the property's facts, and never stored.
        </p>
        <div className="tryit-fields">
          <select
            className="input"
            value={propertyId ?? ""}
            onChange={(e) => {
              setPicked(Number(e.target.value));
              setResult(null);
            }}
            aria-label="Property"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}, {p.city}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Guest name (optional)"
            value={guest}
            maxLength={80}
            onChange={(e) => setGuest(e.target.value)}
            aria-label="Guest name"
          />
          <textarea
            className="input"
            rows={3}
            placeholder="e.g. Hi, the hot water isn't working and we have to leave in an hour."
            value={text}
            maxLength={max}
            onChange={(e) => setText(e.target.value)}
            aria-label="Guest message"
          />
        </div>
        <div className="actions">
          <button type="submit" className="btn" disabled={busy || !text.trim()}>
            {busy ? "Sorting…" : "Sort and draft reply"}
          </button>
          <span className="muted small">
            {text.length}/{max}
            {result && ` · ${result.calls_left_this_hour} live runs left this hour`}
          </span>
        </div>
      </form>
      {error && <p className="error">{error}</p>}
      {result && (
        <TriagePanel key={runs} triage={result.triage} title="Result for your message" fresh />
      )}
      <FactSheet property={property} triage={result?.triage} />
    </section>
  );
}
