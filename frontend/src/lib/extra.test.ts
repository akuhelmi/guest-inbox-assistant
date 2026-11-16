import { describe, expect, it } from "vitest";
import { EXTRA_KEY, MAX_EXTRA, addExtra, extraPayload, loadExtra, saveExtra } from "./extra";
import { NOW, msg } from "./test-data";
import { EMPTY_STATE, setStatus } from "./workflow";

const composed = (minutesAgo = 5) => ({
  ...msg(0, minutesAgo, {
    urgent: true,
    suggested_task: { title: "Fix", assignee: "maintenance" as const, assignee_label: "Maintenance", due_minutes: 30 },
  }),
  status: "done" as const,
});

describe("added messages", () => {
  it("get their own negative ids, newest first, and start as New", () => {
    let extra = addExtra([], composed());
    extra = addExtra(extra, composed());
    expect(extra.map((m) => m.id)).toEqual([-2, -1]);
    expect(extra[0].status).toBe("new");
  });

  it("keep at most MAX_EXTRA", () => {
    let extra: ReturnType<typeof addExtra> = [];
    for (let i = 0; i < MAX_EXTRA + 3; i += 1) extra = addExtra(extra, composed());
    expect(extra).toHaveLength(MAX_EXTRA);
  });

  it("are sent to the assistant with their triage and waiting time", () => {
    const [m] = addExtra([], composed(12));
    const [x] = extraPayload([m], EMPTY_STATE, NOW);
    expect(x).toMatchObject({ id: -1, urgent: true, wait_minutes: 12, task_title: "Fix" });
    const replied = setStatus(EMPTY_STATE, m, "replied", NOW);
    expect(extraPayload([m], replied, NOW)[0].wait_minutes).toBe(0);
  });

  it("save and load, dropping anything that isn't an added message", () => {
    const store: Record<string, string> = {};
    const storage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    };
    const extra = addExtra([], composed());
    saveExtra(storage, extra);
    expect(loadExtra(storage)).toEqual(extra);
    store[EXTRA_KEY] = JSON.stringify([{ ...extra[0], id: 3 }, { nope: 1 }]);
    expect(loadExtra(storage)).toEqual([]);
    store[EXTRA_KEY] = "{bad";
    expect(loadExtra(storage)).toEqual([]);
  });
});
