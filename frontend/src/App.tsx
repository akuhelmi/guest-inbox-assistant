import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { MessageRow, TriagePanel } from "./components";
import { countByFilter, filterMessages, timeAgo } from "./lib/inbox";
import type { Filter, LiveTriage, Message, Meta } from "./types";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "urgent", label: "Urgent" },
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
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.messages(), api.meta()])
      .then(([msgs, m]) => {
        setMessages(msgs);
        setMeta(m);
        setSelectedId(msgs[0]?.id ?? null);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  const visible = useMemo(() => filterMessages(messages, filter), [messages, filter]);
  const counts = useMemo(() => countByFilter(messages), [messages]);
  const selected = messages.find((m) => m.id === selectedId) ?? null;

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

      <TryItBox meta={meta} />

      <nav className="filters" aria-label="Filter messages">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`filter${filter === f.key ? " filter-on" : ""}${f.key === "urgent" ? " filter-urgent" : ""}`}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
          >
            {f.label} <span className="count">{counts[f.key]}</span>
          </button>
        ))}
      </nav>

      <main className="layout">
        <ul className="list" aria-label="Guest messages">
          {visible.map((m) => (
            <MessageRow
              key={m.id}
              message={m}
              selected={m.id === selectedId}
              onSelect={() => setSelectedId(m.id)}
            />
          ))}
          {visible.length === 0 && messages.length > 0 && (
            <li className="muted empty">No messages in this filter.</li>
          )}
        </ul>
        <div className="detail">
          {selected ? (
            <MessageDetail key={selected.id} message={selected} meta={meta} />
          ) : (
            <p className="muted">Select a message.</p>
          )}
        </div>
      </main>

      <footer className="footer muted small">
        Demo app with invented properties and guests. AI-assisted build, human-reviewed.
      </footer>
    </div>
  );
}

function MessageDetail({ message, meta }: { message: Message; meta: Meta | null }) {
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
      <TriagePanel triage={message.triage} title="Triage" />
      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={rerun} disabled={busy}>
          {busy ? "Running…" : `Re-run live (${meta ? providerLabel(meta.provider) : "AI"})`}
        </button>
        {live && (
          <span className="muted small">{live.calls_left_this_hour} live runs left this hour</span>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {live && <TriagePanel key={runs} triage={live.triage} title="Live result" />}
    </article>
  );
}

function TryItBox({ meta }: { meta: Meta | null }) {
  const max = meta?.max_message_chars ?? 1000;
  const [text, setText] = useState("");
  const [guest, setGuest] = useState("");
  const [result, setResult] = useState<LiveTriage | null>(null);
  const [runs, setRuns] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await api.triageText(text.trim(), guest.trim() || "Guest"));
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
          Type any message a guest might send. It is sorted and answered live, and never stored.
        </p>
        <div className="tryit-fields">
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
      {result && <TriagePanel key={runs} triage={result.triage} title="Your message" />}
    </section>
  );
}
