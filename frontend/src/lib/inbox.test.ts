import { describe, expect, it } from "vitest";
import type { Category, Message } from "../types";
import { countByFilter, filterMessages, parseUtc, preview, timeAgo } from "./inbox";

function msg(id: number, category: Category, urgent: boolean, receivedAt: string): Message {
  return {
    id,
    guest_name: "Guest",
    property_name: "Seaview Loft",
    property_city: "Penang",
    received_at: receivedAt,
    body: "text",
    triage: {
      category,
      category_label: category,
      urgent,
      reason: "",
      draft_reply: "",
      triaged_by: "saved example",
    },
  };
}

const messages = [
  msg(1, "complaint", false, "2026-11-13T09:00:00"),
  msg(2, "maintenance", true, "2026-11-13T08:00:00"),
  msg(3, "check_in", false, "2026-11-13T10:00:00"),
  msg(4, "maintenance", false, "2026-11-13T07:00:00"),
  msg(5, "check_in", true, "2026-11-13T09:30:00"),
];

describe("filterMessages", () => {
  it("puts urgent messages first, newest first within each group", () => {
    expect(filterMessages(messages, "all").map((m) => m.id)).toEqual([5, 2, 3, 1, 4]);
  });

  it("filters by urgent and by category", () => {
    expect(filterMessages(messages, "urgent").map((m) => m.id)).toEqual([5, 2]);
    expect(filterMessages(messages, "maintenance").map((m) => m.id)).toEqual([2, 4]);
    expect(filterMessages(messages, "booking_change")).toEqual([]);
  });

  it("does not change the input order", () => {
    filterMessages(messages, "all");
    expect(messages.map((m) => m.id)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("countByFilter", () => {
  it("counts all, urgent and each category", () => {
    const counts = countByFilter(messages);
    expect(counts.all).toBe(5);
    expect(counts.urgent).toBe(2);
    expect(counts.maintenance).toBe(2);
    expect(counts.check_in).toBe(2);
    expect(counts.general_question).toBe(0);
  });
});

describe("time helpers", () => {
  it("reads timestamps without a zone as UTC", () => {
    expect(parseUtc("2026-11-13T00:00:00")).toBe(Date.UTC(2026, 10, 13));
    expect(parseUtc("2026-11-13T00:00:00Z")).toBe(Date.UTC(2026, 10, 13));
  });

  it("formats relative time", () => {
    const now = Date.UTC(2026, 10, 13, 12, 0);
    expect(timeAgo("2026-11-13T12:00:00", now)).toBe("just now");
    expect(timeAgo("2026-11-13T11:55:00", now)).toBe("5 min ago");
    expect(timeAgo("2026-11-13T09:00:00", now)).toBe("3 h ago");
    expect(timeAgo("2026-11-11T12:00:00", now)).toBe("2 d ago");
  });
});

describe("preview", () => {
  it("keeps short text and shortens long text", () => {
    expect(preview("Short   message")).toBe("Short message");
    const long = preview("word ".repeat(40), 20);
    expect(long.length).toBeLessThanOrEqual(20);
    expect(long.endsWith("…")).toBe(true);
  });
});
