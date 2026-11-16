/**
 * The demo team: who can do a job, who is free, who is nearest. Pure functions, so the
 * assignment logic is tested and the same on every screen. All people and jobs are invented.
 */
import type { TaskSuggestion } from "../types";
import type { DemoState, Task } from "./workflow";

/** Minutes on site for a new job, after the drive. */
export const WORK_MINUTES = 45;
/** How long the team member has to confirm before the job passes on. */
export const CONFIRM_MINUTES = 10;
export const HOST = "host";

export interface Person {
  id: string;
  name: string;
  role: string;
  base: string;
  skills: string[];
  /** Driving minutes to each property, by property id (JSON keys arrive as strings). */
  travel: Record<string, number>;
}

export interface TeamJob {
  person: string;
  property_id: number;
  title: string;
  /** Minutes from the start of the visitor's demo. */
  start: number;
  minutes: number;
}

export interface Team {
  people: Person[];
  jobs: TeamJob[];
}

/** A busy period in someone's day (absolute times). */
export interface Slot {
  person: string;
  propertyId: number;
  title: string;
  start: number;
  end: number;
  /** A job created in this demo (not part of the seeded day). */
  fromDemo: boolean;
}

export interface Assignment {
  /** A team member id, or "host". */
  person: string;
  name: string;
  /** When they can set off, and when they arrive. Both "now" for the host. */
  leavesAt: number;
  arrivesAt: number;
  /** Arrives after the task's deadline. */
  late: boolean;
  /** Why this person, in a sentence or two. */
  note: string;
  /** Who it passes to if nobody confirms, in order (ends with the host). */
  chain: string[];
}

const MINUTE = 60000;

export function clock(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function personById(team: Team, id: string): Person | undefined {
  return team.people.find((p) => p.id === id);
}

export function personLabel(team: Team, id: string): string {
  if (id === HOST) return "you (host)";
  const p = personById(team, id);
  return p ? `${p.name} (${p.role.toLowerCase()})` : id;
}

export function travelMinutes(p: Person, propertyId: number): number {
  return p.travel[String(propertyId)] ?? 60;
}

/** Everyone's busy periods today: the seeded jobs plus open tasks made in this demo. */
export function daySlots(team: Team, tasks: Task[], anchor: number): Slot[] {
  const seeded = team.jobs.map((j) => ({
    person: j.person,
    propertyId: j.property_id,
    title: j.title,
    start: anchor + j.start * MINUTE,
    end: anchor + (j.start + j.minutes) * MINUTE,
    fromDemo: false,
  }));
  const own = tasks
    .filter((t) => !t.done && t.person && t.person !== HOST && t.startAt && t.arrivesAt)
    .map((t) => ({
      person: t.person as string,
      propertyId: t.propertyId ?? 0,
      title: t.title,
      start: t.startAt as number,
      end: (t.arrivesAt as number) + WORK_MINUTES * MINUTE,
      fromDemo: true,
    }));
  return [...seeded, ...own].sort((a, b) => a.start - b.start);
}

/** The job someone is on at `now`, if any. */
export function busyWith(slots: Slot[], person: string, now: number): Slot | undefined {
  return slots.find((s) => s.person === person && s.start <= now && now < s.end);
}

/**
 * The earliest time from `from` when the person can drive over and do the job without
 * clashing with anything already in their day.
 */
export function freeFrom(slots: Slot[], person: string, from: number, travel: number): number {
  const need = (travel + WORK_MINUTES) * MINUTE;
  let t = from;
  for (const s of slots) {
    if (s.person !== person || s.end <= t) continue;
    if (s.start >= t + need) break;
    t = s.end;
  }
  return t;
}

function hostAssignment(now: number, note: string): Assignment {
  return { person: HOST, name: "You (host)", leavesAt: now, arrivesAt: now, late: false, note, chain: [] };
}

/**
 * Pick who does a task: the right skill, then whoever arrives first (free in time, then
 * nearest). `pick` forces one person (the host chose, or the AI named someone); `exclude`
 * skips people who already didn't answer.
 */
export function assign(
  team: Team,
  slots: Slot[],
  task: Pick<TaskSuggestion, "assignee" | "due_minutes">,
  propertyId: number,
  now: number,
  options: { pick?: string; exclude?: string[] } = {},
): Assignment {
  const exclude = options.exclude ?? [];
  if (task.assignee === HOST || options.pick === HOST) {
    return hostAssignment(now, "You handle this one yourself.");
  }
  const options_ = team.people
    .filter((p) => p.skills.includes(task.assignee) && !exclude.includes(p.id))
    .map((p) => {
      const travel = travelMinutes(p, propertyId);
      const leavesAt = freeFrom(slots, p.id, now, travel);
      return { p, travel, leavesAt, arrivesAt: leavesAt + travel * MINUTE };
    })
    .sort((a, b) => a.arrivesAt - b.arrivesAt || a.travel - b.travel);

  if (options_.length === 0) {
    return hostAssignment(now, "Nobody else on the team can take it, so it's yours.");
  }
  const best = options_.find((o) => o.p.id === options.pick) ?? options_[0];
  const deadline = now + task.due_minutes * MINUTE;
  const late = best.arrivesAt > deadline;

  const parts: string[] = [];
  // Closer people who are busy: say why they weren't picked.
  for (const o of options_) {
    if (o === best || o.travel >= best.travel) continue;
    const job = busyWith(slots, o.p.id, now);
    if (job) parts.push(`${o.p.name} is closer but busy with ${job.title} until ${clock(job.end)}.`);
  }
  const job = busyWith(slots, best.p.id, now);
  parts.push(
    best.leavesAt > now
      ? `${best.p.name} is free from ${clock(best.leavesAt)}${job ? ` (on ${job.title})` : ""}, then ${best.travel} min away: arrives about ${clock(best.arrivesAt)}.`
      : `${best.p.name} is free now, ${best.travel} min away: arrives about ${clock(best.arrivesAt)}.`,
  );
  if (late) {
    parts.push(
      `That's after the ${task.due_minutes}-minute target: nobody on the team can get there in time, so you may want to step in first.`,
    );
  }
  return {
    person: best.p.id,
    name: best.p.name,
    leavesAt: best.leavesAt,
    arrivesAt: best.arrivesAt,
    late,
    note: parts.join(" "),
    chain: [...options_.filter((o) => o !== best).map((o) => o.p.id), HOST],
  };
}

/** One line per person for the AI: who is free, who is busy and until when. */
export function teamLines(team: Team, slots: Slot[], now: number): string[] {
  return team.people.map((p) => {
    const job = busyWith(slots, p.id, now);
    const next = slots.find((s) => s.person === p.id && s.start > now);
    const status = job ? `busy with ${job.title} until ${clock(job.end)}` : "free now";
    const later = next ? `; next job ${next.title} at ${clock(next.start)}` : "";
    return `${p.id}: ${p.name}, ${p.role}, based in ${p.base}, ${status}${later}`;
  });
}

/** What the thread says once a task is sent to someone. */
export function notifyText(team: Team, a: Assignment): string {
  if (a.person === HOST) return "The task is on your own list.";
  const next = a.chain.slice(0, 2).map((id) => personLabel(team, id));
  return (
    `${a.name} notified by WhatsApp (demo). If there's no answer in ${CONFIRM_MINUTES} min, ` +
    `it passes to ${next.join(", then ")}.`
  );
}

/** Nobody answered: who gets it next, and what the thread says. */
export function escalate(
  team: Team,
  slots: Slot[],
  task: Task,
  propertyId: number,
  now: number,
): { assignment: Assignment; text: string } {
  const tried = [...(task.tried ?? []), task.person ?? ""];
  const prev = personById(team, task.person ?? "")?.name ?? "them";
  // The job they didn't confirm is no longer in their day.
  const free = slots.filter((s) => !(s.fromDemo && s.person === task.person && s.title === task.title));
  const assignment = assign(
    team,
    free,
    { assignee: task.assignee as TaskSuggestion["assignee"], due_minutes: Math.max(5, Math.round((task.dueAt - now) / MINUTE)) },
    propertyId,
    now,
    { exclude: tried },
  );
  const text =
    assignment.person === HOST
      ? `No answer from ${prev} after ${CONFIRM_MINUTES} min, and nobody else can take it. The task is now yours.`
      : `No answer from ${prev} after ${CONFIRM_MINUTES} min. Passed to ${assignment.name}. ${assignment.note} ${notifyText(team, assignment)}`;
  return { assignment, text };
}

/** The demo's day starts at the visitor's first visit (Reset demo starts a new one). */
export function anchorOf(demo: DemoState, now: number): number {
  return demo.startedAt ?? now;
}
