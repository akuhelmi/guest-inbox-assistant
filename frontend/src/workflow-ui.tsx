import type { Message, Property } from "./types";
import { HOST, type Slot, type Team, busyWith, clock } from "./lib/team";
import { type Task, type WaitInfo, dueLabel, sortedTasks } from "./lib/workflow";

export function WaitChip({ wait }: { wait: WaitInfo }) {
  const kind = wait.replied ? "replied" : wait.overdue ? "overdue" : "waiting";
  return <span className={`wait wait-${kind}`}>{wait.label}</span>;
}

/** Each team member's day: what they're on now and what's booked. */
export function TeamDay({
  team,
  slots,
  properties,
  now,
}: {
  team: Team;
  slots: Slot[];
  properties: Property[];
  now: number;
}) {
  if (team.people.length === 0) return null;
  const place = (id: number) => properties.find((p) => p.id === id)?.name ?? "";
  return (
    <section className="team-day" aria-label="Team today">
      <h3>Team today</h3>
      <ul className="team-list">
        {team.people.map((p) => {
          const job = busyWith(slots, p.id, now);
          const day = slots.filter((s) => s.person === p.id && s.end > now);
          return (
            <li key={p.id} className="team-person">
              <div className="team-head">
                <strong>{p.name}</strong>
                <span className="muted small">
                  {p.role} · {p.base}
                </span>
                <span className={`team-now ${job ? "team-busy" : "team-free"}`}>
                  {job ? `Busy until ${clock(job.end)}` : "Free now"}
                </span>
              </div>
              {day.length > 0 && (
                <ul className="team-slots small">
                  {day.map((s, i) => (
                    <li key={i} className={s.fromDemo ? "slot-new" : undefined}>
                      {clock(s.start)}–{clock(s.end)} · {s.title} · {place(s.propertyId)}
                      {s.fromDemo && <span className="tag tag-new">new</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
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
                  · {t.person && t.person !== HOST ? t.personName : t.assigneeLabel}
                  {t.person && t.person !== HOST && (t.confirmed ? " ✓ confirmed" : " (not confirmed)")}{" "}
                  · {t.property} · {t.guest}
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
