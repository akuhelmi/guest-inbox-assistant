import { useEffect, useRef, useState } from "react";
import { TriagePanel } from "./components";
import {
  type AssistantEntry,
  type ChatCard,
  type ChatEntry,
  cardTitle,
  pendingIndexes,
} from "./lib/agent";
import type { Property, TaskSuggestion } from "./types";

export interface CardEdit {
  draft?: string;
  task?: TaskSuggestion;
}

const ASSIGNEES: { key: TaskSuggestion["assignee"]; label: string }[] = [
  { key: "maintenance", label: "Maintenance" },
  { key: "cleaner", label: "Cleaner" },
  { key: "host", label: "Host" },
];
const DUE_OPTIONS = [5, 15, 30, 60, 120, 240, 480, 1440];

function dueText(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}

/** Assistant text: plain lines, with "- " lines shown as a list. */
function RichText({ text }: { text: string }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const line of text.split("\n")) {
    const list = line.startsWith("- ");
    const last = blocks.at(-1);
    if (last && last.list === list) last.lines.push(list ? line.slice(2) : line);
    else blocks.push({ list, lines: [list ? line.slice(2) : line] });
  }
  return (
    <>
      {blocks.map((b, i) =>
        b.list ? (
          <ul key={i} className="bubble-list">
            {b.lines.map((l, j) => (
              <li key={j}>{l}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{b.lines.join("\n")}</p>
        ),
      )}
    </>
  );
}

function ActionCard({
  card,
  edit,
  onEdit,
  onApprove,
  onDismiss,
  onOpen,
}: {
  card: ChatCard;
  edit: CardEdit | undefined;
  onEdit: (e: CardEdit) => void;
  onApprove: () => void;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const draft = edit?.draft ?? card.draft;
  const task = edit?.task ?? card.task;
  const pending = card.state === "pending";

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={`acard acard-${card.kind} acard-${card.state}`}>
      <div className="acard-head">
        <strong>{cardTitle(card)}</strong>
        <button type="button" className="link small" onClick={onOpen}>
          {card.property_name} · open
        </button>
      </div>

      {card.kind === "draft" && (
        <>
          <div className="row-meta">
            <span className={`badge-conf badge-conf-${card.needs_host ? "low" : card.confidence}`}>
              {card.needs_host
                ? "Needs host"
                : card.confidence === "high"
                  ? "High confidence"
                  : "Medium confidence"}
            </span>
            {card.language !== "en" && <span className="tag tag-lang">{card.language_label}</span>}
            {card.facts_used.map((f) => (
              <span key={f.key} className="fact-chip">
                {f.label}
              </span>
            ))}
          </div>
          {editing && pending ? (
            <textarea
              className="draft"
              rows={4}
              value={draft}
              onChange={(e) => onEdit({ ...edit, draft: e.target.value })}
              aria-label={`Draft reply to ${card.guest_name}`}
            />
          ) : (
            <p className="acard-draft">{draft}</p>
          )}
          {card.needs_host && pending && (
            <p className="needs-host small">Not sure enough on its own: check before approving.</p>
          )}
        </>
      )}

      {card.kind === "task" && task && (
        <>
          {editing && pending ? (
            <div className="task-form">
              <input
                className="input"
                value={task.title}
                maxLength={120}
                onChange={(e) => onEdit({ ...edit, task: { ...task, title: e.target.value } })}
                aria-label="Task"
              />
              <select
                className="input"
                value={task.assignee}
                onChange={(e) => {
                  const a = ASSIGNEES.find((x) => x.key === e.target.value) ?? ASSIGNEES[0];
                  onEdit({ ...edit, task: { ...task, assignee: a.key, assignee_label: a.label } });
                }}
                aria-label="Who"
              >
                {ASSIGNEES.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={task.due_minutes}
                onChange={(e) =>
                  onEdit({ ...edit, task: { ...task, due_minutes: Number(e.target.value) } })
                }
                aria-label="Due"
              >
                {[...new Set([...DUE_OPTIONS, task.due_minutes])]
                  .sort((a, b) => a - b)
                  .map((m) => (
                    <option key={m} value={m}>
                      within {dueText(m)}
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <p className="acard-task">
              {task.title} · {task.assignee_label} · within {dueText(task.due_minutes)}
            </p>
          )}
        </>
      )}

      {card.kind === "status" && (
        <p className="muted small acard-task">Changes the message status in your inbox.</p>
      )}

      <div className="acard-actions">
        {pending ? (
          <>
            <button type="button" className="btn btn-small" onClick={onApprove}>
              {card.kind === "draft" ? "Approve · mark replied" : "Approve"}
            </button>
            {card.kind !== "status" && (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? "Done editing" : "Edit"}
              </button>
            )}
            <button type="button" className="link small" onClick={onDismiss}>
              Dismiss
            </button>
          </>
        ) : (
          <span className={`small acard-result-${card.state}`}>
            {card.state === "approved" ? "✓ Approved" : "Dismissed"}
          </span>
        )}
        {card.kind === "draft" && card.state !== "dismissed" && (
          <button type="button" className="link small" onClick={copy}>
            {copied ? "Copied" : "Copy reply"}
          </button>
        )}
      </div>
    </div>
  );
}

function AssistantBubble({
  entry,
  onApprove,
  onDismiss,
  onOpen,
}: {
  entry: AssistantEntry;
  onApprove: (indexes: number[], edits: Record<number, CardEdit>) => void;
  onDismiss: (index: number) => void;
  onOpen: (messageId: number) => void;
}) {
  const [edits, setEdits] = useState<Record<number, CardEdit>>({});
  const pending = pendingIndexes(entry);

  return (
    <div className="bubble bubble-assistant">
      <div className="bubble-text">
        <RichText text={entry.text} />
      </div>
      {entry.note && <p className="bubble-note small">{entry.note}</p>}
      {entry.cards.length > 0 && (
        <div className="acards">
          {entry.cards.map((c, i) => (
            <ActionCard
              key={i}
              card={c}
              edit={edits[i]}
              onEdit={(e) => setEdits((all) => ({ ...all, [i]: e }))}
              onApprove={() => onApprove([i], edits)}
              onDismiss={() => onDismiss(i)}
              onOpen={() => onOpen(c.message_id)}
            />
          ))}
          {pending.length > 1 && (
            <button type="button" className="btn" onClick={() => onApprove(pending, edits)}>
              Approve all ({pending.length})
            </button>
          )}
        </div>
      )}
      <span className="bubble-by muted small">
        {entry.by.startsWith("gemini") ? "AI" : "Quick commands"}
      </span>
    </div>
  );
}

export function ChatView({
  chat,
  busy,
  suggestions,
  properties,
  maxChars,
  aiLabel,
  onSend,
  onPaste,
  onApprove,
  onDismiss,
  onOpen,
}: {
  chat: ChatEntry[];
  busy: boolean;
  suggestions: string[];
  properties: Property[];
  maxChars: number;
  aiLabel: string;
  onSend: (text: string) => void;
  onPaste: (body: string, guest: string, propertyId: number | null) => void;
  onApprove: (entry: string, indexes: number[], edits: Record<number, CardEdit>) => void;
  onDismiss: (entry: string, index: number) => void;
  onOpen: (messageId: number) => void;
}) {
  const [text, setText] = useState("");
  const [pasteMode, setPasteMode] = useState(false);
  const [guest, setGuest] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const propertyId = picked ?? properties[0]?.id ?? null;
  const logRef = useRef<HTMLDivElement>(null);
  const limit = pasteMode ? maxChars : 500;

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [chat.length, busy]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    if (pasteMode) onPaste(value, guest.trim() || "Guest", propertyId);
    else onSend(value);
    setText("");
  }

  return (
    <section className="chat" aria-label="Inbox assistant">
      <div className="chat-log" ref={logRef} aria-live="polite">
        {chat.map((e) => {
          if (e.role === "host") {
            return (
              <div key={e.id} className="bubble bubble-host">
                {e.text}
              </div>
            );
          }
          if (e.role === "pasted") {
            return (
              <div key={e.id} className="bubble bubble-assistant">
                <p className="small muted">
                  Guest message from {e.guest} at {e.propertyName} (pasted, not stored)
                </p>
                <blockquote className="body">{e.body}</blockquote>
                <TriagePanel triage={e.triage} title="Sorted and drafted" />
              </div>
            );
          }
          return (
            <AssistantBubble
              key={e.id}
              entry={e}
              onApprove={(idx, edits) => onApprove(e.id, idx, edits)}
              onDismiss={(i) => onDismiss(e.id, i)}
              onOpen={onOpen}
            />
          );
        })}
        {busy && <div className="bubble bubble-assistant bubble-busy muted">Thinking…</div>}
      </div>

      <div className="chips" aria-label="Suggestions">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            className="chip-suggest"
            disabled={busy}
            onClick={() => onSend(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <form className="composer" onSubmit={submit}>
        {pasteMode && (
          <div className="composer-paste">
            <select
              className="input"
              value={propertyId ?? ""}
              onChange={(e) => setPicked(Number(e.target.value))}
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
          </div>
        )}
        <div className="composer-row">
          <textarea
            className="input composer-input"
            rows={2}
            maxLength={limit}
            value={text}
            placeholder={
              pasteMode
                ? "Paste a guest message, in any language. It is sorted and answered, never stored."
                : 'Ask the assistant, e.g. "handle the urgent ones"'
            }
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) submit(e);
            }}
            aria-label={pasteMode ? "Guest message" : "Message to the assistant"}
          />
          <button type="submit" className="btn" disabled={busy || !text.trim()}>
            {pasteMode ? "Sort" : "Send"}
          </button>
        </div>
        <div className="composer-foot small muted">
          <button type="button" className="link small" onClick={() => setPasteMode((v) => !v)}>
            {pasteMode ? "Back to the assistant" : "Paste a guest message instead"}
          </button>
          <span>
            {text.length}/{limit} · {aiLabel}
          </span>
        </div>
      </form>
    </section>
  );
}
