import { describe, expect, it } from "vitest";
import {
  HOST,
  type Team,
  assign,
  busyWith,
  daySlots,
  escalate,
  freeFrom,
  notifyText,
  teamLines,
} from "./team";
import { msg, NOW } from "./test-data";
import { EMPTY_STATE, addTask, reassignTask } from "./workflow";

// Property ids as the API would give them: 1 Bangsar Loft, 2 Garden Terrace, 3 Skyline, 4 Kampung.
const T = (bangsar: number, garden: number, skyline: number, kampung: number) => ({
  "1": bangsar,
  "2": garden,
  "3": skyline,
  "4": kampung,
});
const TEAM: Team = {
  people: [
    { id: "aiman", name: "Aiman", role: "Maintenance", base: "Cheras", skills: ["maintenance"], travel: T(25, 35, 20, 25) },
    { id: "ravi", name: "Ravi", role: "Maintenance", base: "Petaling Jaya", skills: ["maintenance"], travel: T(15, 10, 30, 50) },
    { id: "lina", name: "Lina", role: "Cleaning", base: "Bangsar", skills: ["cleaner"], travel: T(5, 15, 15, 45) },
    { id: "rosli", name: "Rosli", role: "All-rounder", base: "Ampang", skills: ["maintenance", "cleaner"], travel: T(25, 35, 15, 20) },
  ],
  jobs: [
    { person: "aiman", property_id: 2, title: "Aircon service", start: -20, minutes: 110 },
    { person: "ravi", property_id: 1, title: "Water heater check", start: 60, minutes: 60 },
    { person: "lina", property_id: 3, title: "Turnover clean", start: -30, minutes: 90 },
    { person: "rosli", property_id: 4, title: "Garden and pool clean-up", start: 30, minutes: 60 },
  ],
};
const MIN = 60000;
const SLOTS = daySlots(TEAM, [], NOW);
const FIX = { assignee: "maintenance" as const, due_minutes: 30 };

describe("the team's day", () => {
  it("places the seeded jobs from the start of the demo", () => {
    expect(busyWith(SLOTS, "aiman", NOW)?.title).toBe("Aircon service");
    expect(busyWith(SLOTS, "ravi", NOW)).toBeUndefined();
  });

  it("finds the first gap long enough to drive over and do the job", () => {
    // Ravi: free now, 15 min drive + 45 min work fits before his job at +60.
    expect(freeFrom(SLOTS, "ravi", NOW, 15)).toBe(NOW);
    // 20 min drive no longer fits: after his job, at +120.
    expect(freeFrom(SLOTS, "ravi", NOW, 20)).toBe(NOW + 120 * MIN);
    expect(freeFrom(SLOTS, "aiman", NOW, 25)).toBe(NOW + 90 * MIN);
  });
});

describe("assign", () => {
  it("gives the job to whoever arrives first", () => {
    const a = assign(TEAM, SLOTS, FIX, 1, NOW);
    expect(a.person).toBe("ravi");
    expect(a.arrivesAt).toBe(NOW + 15 * MIN);
    expect(a.late).toBe(false);
    expect(a.note).toMatch(/^Ravi is free now, 15 min away/);
    expect(a.chain.at(-1)).toBe(HOST);
    expect(a.chain).not.toContain("lina");
  });

  it("flags a target nobody can meet", () => {
    // Kampung Chalet: Rosli is nearest but has a job there first; he still arrives first.
    const a = assign(TEAM, SLOTS, { ...FIX, due_minutes: 15 }, 4, NOW);
    expect(a.person).toBe("rosli");
    expect(a.leavesAt).toBe(NOW + 90 * MIN);
    expect(a.late).toBe(true);
    expect(a.note).toContain("nobody on the team can get there in time");
  });

  it("explains why a closer person was skipped", () => {
    const leak = msg(1, 5);
    const first = assign(TEAM, SLOTS, FIX, 1, NOW);
    const demo = addTask(EMPTY_STATE, leak, { ...FIX, title: "Leak", assignee_label: "Maintenance" }, NOW, first);
    const a = assign(TEAM, daySlots(TEAM, demo.tasks, NOW), FIX, 1, NOW);
    expect(a.person).toBe("aiman");
    expect(a.note).toContain("Ravi is closer but busy with Leak until");
    expect(a.note).toContain("Aiman is free from");
  });

  it("matches the skill: cleaning goes to cleaners and all-rounders", () => {
    const a = assign(TEAM, SLOTS, { assignee: "cleaner", due_minutes: 120 }, 1, NOW);
    expect(["lina", "rosli"]).toContain(a.person);
    expect(a.chain).not.toContain("ravi");
  });

  it("follows a pick by the host or the AI, including the host", () => {
    expect(assign(TEAM, SLOTS, FIX, 1, NOW, { pick: "aiman" }).person).toBe("aiman");
    expect(assign(TEAM, SLOTS, FIX, 1, NOW, { pick: HOST }).person).toBe(HOST);
    expect(assign(TEAM, SLOTS, { ...FIX, assignee: "host" }, 1, NOW).person).toBe(HOST);
  });

  it("counts tasks made in the demo: a busy person isn't picked twice", () => {
    const leak = msg(1, 5);
    const first = assign(TEAM, SLOTS, FIX, 1, NOW);
    const demo = addTask(EMPTY_STATE, leak, { ...FIX, title: "Leak", assignee_label: "Maintenance" }, NOW, first);
    const slots = daySlots(TEAM, demo.tasks, NOW);
    expect(busyWith(slots, "ravi", NOW + 30 * MIN)?.title).toBe("Leak");
    expect(assign(TEAM, slots, FIX, 1, NOW).person).not.toBe("ravi");
  });
});

describe("escalation", () => {
  it("passes the task down the chain, then to the host", () => {
    const leak = msg(1, 5);
    const first = assign(TEAM, SLOTS, FIX, 1, NOW);
    let demo = addTask(EMPTY_STATE, leak, { ...FIX, title: "Leak", assignee_label: "Maintenance" }, NOW, first);
    expect(notifyText(TEAM, first)).toContain("Ravi notified by WhatsApp (demo)");

    const seen: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const task = demo.tasks[0];
      const slots = daySlots(TEAM, demo.tasks, NOW);
      const { assignment, text } = escalate(TEAM, slots, task, 1, NOW);
      seen.push(assignment.person);
      expect(text).toContain(`No answer from ${task.personName}`);
      demo = reassignTask(demo, task.id, assignment, NOW);
      if (assignment.person === HOST) {
        expect(text).toContain("The task is now yours");
        break;
      }
    }
    expect(seen.at(-1)).toBe(HOST);
    expect(new Set(seen).size).toBe(seen.length);
    expect(demo.tasks[0].tried).toContain("ravi");
  });
});

describe("for the AI", () => {
  it("writes one line per person with who is free and who is busy", () => {
    const lines = teamLines(TEAM, SLOTS, NOW);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^aiman: Aiman, Maintenance, based in Cheras, busy with Aircon service/);
    expect(lines[1]).toContain("free now; next job Water heater check");
  });
});
