import type { Message } from "./types";
import { type Task, type WaitInfo, dueLabel, sortedTasks } from "./lib/workflow";

export function WaitChip({ wait }: { wait: WaitInfo }) {
  const kind = wait.replied ? "replied" : wait.overdue ? "overdue" : "waiting";
  return <span className={`wait wait-${kind}`}>{wait.label}</span>;
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
        No tasks yet. Open a maintenance message and approve its suggested task.
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
