import { useEffect, useRef, useState } from "react";
import { CategoryChip, ConfidenceBadge, FactSheet, LanguageBadge, UrgentBadge } from "./components";
import { isAi } from "./lib/agent";
import { timeAgo } from "./lib/inbox";
import {
  type Proposal,
  type Thread,
  channelLabel,
  currentStep,
  reviewText,
  sendLabel,
  stepTitle,
} from "./lib/proposals";
import { STATUS_LABELS, type Task, type WaitInfo, dueLabel } from "./lib/workflow";
import type { Message, Property, Status, TaskSuggestion } from "./types";
import { WaitChip } from "./workflow-ui";

const ASSIGNEES: { key: TaskSuggestion["assignee"]; label: string }[] = [
  { key: "maintenance", label: "Maintenance" },
  { key: "cleaner", label: "Cleaner" },
  { key: "host", label: "Host (me)" },
];
const DUE_OPTIONS = [5, 15, 30, 60, 120, 240, 480, 1440];

function dueText(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}

function ProposalCard({
  p,
  channel,
  onApprove,
  onChange,
  onDismiss,
}: {
  p: Proposal;
  channel: string;
  onApprove: () => void;
  onChange: (change: Partial<Pick<Proposal, "draft" | "task">>) => void;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const pending = p.state === "pending";
  const from = p.source === "saved" ? "ready" : isAi(p.source) ? "AI" : "quick commands";

  async function copy() {
    try {
      await navigator.clipboard.writeText(p.draft);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const title =
    p.kind === "draft"
      ? "Reply to the guest"
      : p.kind === "task"
        ? "Open a task for the team"
        : `Mark as ${STATUS_LABELS[(p.status || "new") as Status]}`;

  return (
    <div className={`acard acard-${p.kind} acard-${p.state}`}>
      <div className="acard-head">
        <strong>{title}</strong>
        <span className="muted small">{from}</span>
      </div>

      {p.kind === "draft" && (
        <>
          <div className="row-meta">
            <span className={`badge-conf badge-conf-${p.needs_host ? "low" : p.confidence}`}>
              {p.needs_host
                ? "Needs host"
                : p.confidence === "high"
                  ? "High confidence"
                  : "Medium confidence"}
            </span>
            {p.language !== "en" && <span className="tag tag-lang">{p.language_label}</span>}
            {p.facts_used.map((f) => (
              <span key={f.key} className="fact-chip">
                {f.label}
              </span>
            ))}
          </div>
          {pending ? (
            <textarea
              className="draft"
              rows={4}
              value={p.draft}
              onChange={(e) => onChange({ draft: e.target.value })}
              aria-label="Reply to the guest"
            />
          ) : (
            <p className="acard-draft">{p.draft}</p>
          )}
          {p.needs_host && pending && (
            <p className="needs-host small">Not sure enough on its own: check before sending.</p>
          )}
        </>
      )}

      {p.kind === "task" && p.task && (
        <>
          {pending ? (
            <div className="task-form">
              <input
                className="input"
                value={p.task.title}
                maxLength={120}
                onChange={(e) => onChange({ task: { ...p.task!, title: e.target.value } })}
                aria-label="Task"
              />
              <select
                className="input"
                value={p.task.assignee}
                onChange={(e) => {
                  const a = ASSIGNEES.find((x) => x.key === e.target.value) ?? ASSIGNEES[0];
                  onChange({
                    task: { ...p.task!, assignee: a.key, assignee_label: a.label.replace(" (me)", "") },
                  });
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
                value={p.task.due_minutes}
                onChange={(e) => onChange({ task: { ...p.task!, due_minutes: Number(e.target.value) } })}
                aria-label="Due"
              >
                {[...new Set([...DUE_OPTIONS, p.task.due_minutes])]
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
              {p.task.title} · {p.task.assignee_label} · within {dueText(p.task.due_minutes)}
            </p>
          )}
        </>
      )}

      <div className="acard-actions">
        {pending ? (
          <>
            <button
              type="button"
              className="btn btn-small"
              onClick={onApprove}
              disabled={p.kind === "draft" ? !p.draft.trim() : p.kind === "task" ? !p.task?.title.trim() : false}
            >
              {p.kind === "draft"
                ? sendLabel(channel)
                : p.kind === "task"
                  ? p.task?.assignee === "host"
                    ? "Create task"
                    : "Create task & nudge"
                  : "Approve"}
            </button>
            {p.kind === "draft" && (
              <button type="button" className="btn btn-secondary btn-small" onClick={copy}>
                {copied ? "Copied" : "Copy reply"}
              </button>
            )}
            <button type="button" className="link small" onClick={onDismiss}>
              Skip this step
            </button>
          </>
        ) : (
          <span className={`small acard-result-${p.state}`}>
            {p.state === "approved" ? `✓ ${p.result ?? "Approved"}` : "Skipped"}
          </span>
        )}
      </div>
    </div>
  );
}

export function MessageWorkspace({
  message,
  property,
  status,
  wait,
  tasks,
  thread,
  busy,
  aiLabel,
  shift,
  onClose,
  onNext,
  onAgree,
  onApprove,
  onChange,
  onDismiss,
  onStatus,
  onAsk,
  now,
}: {
  message: Message;
  property?: Property;
  status: Status;
  wait: WaitInfo;
  tasks: Task[];
  thread: Thread;
  busy: boolean;
  aiLabel: string;
  /** Shift mode: "3 left" and a prominent Next button. */
  shift: { left: number } | null;
  onClose: () => void;
  onNext: (() => void) | null;
  onAgree: () => void;
  onApprove: (p: Proposal) => void;
  onChange: (p: Proposal, change: Partial<Pick<Proposal, "draft" | "task">>) => void;
  onDismiss: (p: Proposal) => void;
  onStatus: (s: Status) => void;
  onAsk: (text: string) => void;
  now: number;
}) {
  const [text, setText] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const steps = thread.proposals;
  const current = currentStep(thread);
  const agreed = Boolean(thread.agreed);
  const t = message.triage;

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [thread.turns.length, busy, current?.pid, agreed]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    onAsk(value);
    setText("");
  }

  return (
    <section className="workspace" aria-label={`Message from ${message.guest_name}`}>
      <div className="ws-top">
        <button type="button" className="link small" onClick={onClose}>
          ← Inbox
        </button>
        {shift && <span className="muted small">Shift: {shift.left} left to answer</span>}
        {onNext && (
          <button type="button" className={`btn btn-small${shift ? "" : " btn-secondary"}`} onClick={onNext}>
            Next message →
          </button>
        )}
      </div>

      <div className="ws-scroll" ref={logRef}>
        <header className="ws-head">
          <div>
            <h2>{message.guest_name}</h2>
            <p className="muted small">
              {message.property_name}, {message.property_city} · {timeAgo(message.received_at)}
            </p>
          </div>
          <div className="ws-head-tags">
            <span className={`channel channel-${message.channel}`}>{channelLabel(message.channel)}</span>
            <span className={`status status-${status}`}>{STATUS_LABELS[status]}</span>
            <WaitChip wait={wait} />
          </div>
        </header>

        <blockquote className="body">{message.body}</blockquote>
        <div className="row-meta">
          {t.urgent && <UrgentBadge />}
          <CategoryChip triage={t} />
          <ConfidenceBadge triage={t} />
          <LanguageBadge triage={t} />
          <span className="muted small">{t.reason}</span>
        </div>

        <div className="review">
          <h3>Review</h3>
          <p>{reviewText(message)}</p>
          {steps.length > 0 ? (
            <>
              <h4>Plan</h4>
              <ol className="plan">
                {steps.map((p) => (
                  <li
                    key={p.pid}
                    className={`plan-step plan-${p.state}${agreed && p === current ? " plan-now" : ""}`}
                  >
                    <span className="plan-mark" aria-hidden="true">
                      {p.state === "approved" ? "✓" : p.state === "dismissed" ? "–" : ""}
                    </span>
                    {stepTitle(p, message)}
                    {p.state === "dismissed" && <span className="muted small"> (skipped)</span>}
                  </li>
                ))}
              </ol>
              {!agreed && current && (
                <div className="review-actions">
                  <button type="button" className="btn" onClick={onAgree}>
                    Agree &amp; proceed
                  </button>
                  <span className="muted small">or type below to change the plan</span>
                </div>
              )}
            </>
          ) : (
            <p className="muted small">Nothing left to do for this message.</p>
          )}
        </div>

        {agreed &&
          steps
            .filter((p) => p.state !== "pending")
            .map((p) => (
              <p key={p.pid} className={`step-done step-${p.state} small`}>
                {p.state === "approved" ? "✓" : "–"} Step {steps.indexOf(p) + 1}:{" "}
                {p.state === "approved" ? (p.result ?? "Done") : "Skipped"}
              </p>
            ))}

        {thread.turns.length > 0 && (
          <div className="ws-thread" aria-live="polite">
            {thread.turns.map((turn, i) =>
              turn.role === "host" ? (
                <div key={i} className="bubble bubble-host">
                  {turn.text}
                </div>
              ) : (
                <div key={i} className="bubble bubble-assistant">
                  <p className="bubble-plain">{turn.text}</p>
                  {turn.note && <p className="bubble-note small">{turn.note}</p>}
                  <span className="bubble-by muted small">
                    {turn.by && isAi(turn.by) ? "AI" : "Quick commands"}
                  </span>
                </div>
              ),
            )}
          </div>
        )}

        {agreed && current && (
          <div className="step">
            <p className="step-count muted small">
              Step {steps.indexOf(current) + 1} of {steps.length}
            </p>
            <ProposalCard
              key={current.pid}
              p={current}
              channel={message.channel}
              onApprove={() => onApprove(current)}
              onChange={(change) => onChange(current, change)}
              onDismiss={() => onDismiss(current)}
            />
          </div>
        )}

        {agreed && !current && steps.length > 0 && (
          <div className="step-end">
            <strong>All steps done.</strong>
            {onNext && (
              <button type="button" className="btn btn-small" onClick={onNext}>
                Next message →
              </button>
            )}
          </div>
        )}

        {tasks.length > 0 && (
          <div className="ws-tasks small">
            {tasks.map((task) => (
              <p key={task.id} className="task-made">
                ✓ Task: {task.title} · {task.assigneeLabel} · {dueLabel(task, now)}
              </p>
            ))}
          </div>
        )}

        <details className="ws-more">
          <summary className="small">Change the status yourself</summary>
          <div className="status-control" role="group" aria-label="Message status">
            {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
              <button
                key={s}
                type="button"
                className={`seg${status === s ? " seg-on" : ""}`}
                aria-pressed={status === s}
                onClick={() => onStatus(s)}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </details>
        <FactSheet property={property} triage={t} />

        {busy && <div className="bubble bubble-assistant bubble-busy muted">Thinking…</div>}
      </div>

      <form className="composer ws-composer" onSubmit={submit}>
        <div className="composer-row">
          <textarea
            className="input composer-input"
            rows={2}
            maxLength={500}
            value={text}
            placeholder={
              !agreed
                ? 'Change the plan, e.g. "also offer a late check-out"'
                : current
                  ? 'Change this step, e.g. "make it warmer"'
                  : "Ask anything about this guest"
            }
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) submit(e);
            }}
            aria-label="Message to the AI about this guest"
          />
          <button type="submit" className="btn" disabled={busy || !text.trim()}>
            Send
          </button>
        </div>
        <div className="composer-foot small muted">
          <span>
            {agreed && current ? "The AI updates this step." : "The AI updates the plan."}
          </span>
          <span>{aiLabel}</span>
        </div>
      </form>
    </section>
  );
}
