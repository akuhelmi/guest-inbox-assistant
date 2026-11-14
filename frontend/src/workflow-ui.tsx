import { useState } from "react";
import type { Message, Status, TaskSuggestion } from "./types";
import { STATUS_LABELS, type Task, type WaitInfo, dueLabel, sortedTasks } from "./lib/workflow";

const ASSIGNEES: { key: TaskSuggestion["assignee"]; label: string }[] = [
  { key: "maintenance", label: "Maintenance" },
  { key: "cleaner", label: "Cleaner" },
  { key: "host", label: "Host" },
];

export function WaitChip({ wait }: { wait: WaitInfo }) {
  const kind = wait.replied ? "replied" : wait.overdue ? "overdue" : "waiting";
  return <span className={`wait wait-${kind}`}>{wait.label}</span>;
}

export function StatusControl({
  status,
  onChange,
}: {
  status: Status;
  onChange: (s: Status) => void;
}) {
  return (
    <div className="status-control" role="group" aria-label="Message status">
      {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
        <button
          key={s}
          type="button"
          className={`seg${status === s ? " seg-on" : ""}`}
          aria-pressed={status === s}
          onClick={() => onChange(s)}
        >
          {STATUS_LABELS[s]}
        </button>
      ))}
    </div>
  );
}

/** The AI's suggested task: the host edits it if needed and creates it with one click (D8). */
export function TaskSuggestionCard({
  suggestion,
  existing,
  onCreate,
  now,
}: {
  suggestion: TaskSuggestion | null;
  existing: Task[];
  onCreate: (t: TaskSuggestion) => void;
  now: number;
}) {
  const [title, setTitle] = useState(suggestion?.title ?? "");
  const [assignee, setAssignee] = useState<TaskSuggestion["assignee"]>(
    suggestion?.assignee ?? "host",
  );
  const [due, setDue] = useState(suggestion?.due_minutes ?? 60);
  const [open, setOpen] = useState(suggestion !== null);

  return (
    <section className="task-card">
      <div className="triage-head">
        <h3>Task for the team</h3>
        {suggestion && <span className="muted small">suggested by the AI, you confirm</span>}
      </div>
      {existing.map((t) => (
        <p key={t.id} className="small task-made">
          ✓ {t.title} · {t.assigneeLabel} · {dueLabel(t, now)}
        </p>
      ))}
      {open ? (
        <form
          className="task-form"
          onSubmit={(e) => {
            e.preventDefault();
            const label = ASSIGNEES.find((a) => a.key === assignee)?.label ?? assignee;
            onCreate({
              title,
              assignee,
              assignee_label: label,
              due_minutes: due,
            });
            setOpen(false);
          }}
        >
          <input
            className="input"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Task"
            placeholder="What needs doing?"
          />
          <select
            className="input"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value as TaskSuggestion["assignee"])}
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
            value={due}
            onChange={(e) => setDue(Number(e.target.value))}
            aria-label="Due"
          >
            {[15, 30, 60, 120, 240, 480, 1440].map((m) => (
              <option key={m} value={m}>
                within {m < 60 ? `${m} min` : `${m / 60} h`}
              </option>
            ))}
            {![15, 30, 60, 120, 240, 480, 1440].includes(due) && (
              <option value={due}>within {due} min</option>
            )}
          </select>
          <button type="submit" className="btn" disabled={!title.trim()}>
            Create task
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
          {existing.length ? "Add another task" : "Add a task"}
        </button>
      )}
    </section>
  );
}

export function TasksView({
  tasks,
  onToggle,
  onOpen,
  findMessage,
  now,
}: {
  tasks: Task[];
  onToggle: (id: string) => void;
  onOpen: (m: Message) => void;
  findMessage: (t: Task) => Message | undefined;
  now: number;
}) {
  const sorted = sortedTasks(tasks);

  if (sorted.length === 0) {
    return (
      <p className="muted empty">
        No tasks yet. Open a maintenance or complaint message and create its suggested task.
      </p>
    );
  }
  return (
    <ul className="tasks" aria-label="Tasks">
      {sorted.map((t) => {
        const message = findMessage(t);
        const overdue = !t.done && t.dueAt < now;
        return (
          <li key={t.id} className={`task${t.done ? " task-done" : ""}`}>
            <label className="task-check">
              <input type="checkbox" checked={t.done} onChange={() => onToggle(t.id)} />
              <span>
                <strong>{t.title}</strong>
                <span className="muted small">
                  {" "}
                  · {t.assigneeLabel} · {t.property} · {t.guest}
                </span>
              </span>
            </label>
            <span className={`small ${overdue ? "due-overdue" : "muted"}`}>{dueLabel(t, now)}</span>
            {message && (
              <button type="button" className="link small" onClick={() => onOpen(message)}>
                Open message
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
