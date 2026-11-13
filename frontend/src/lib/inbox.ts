import type { Category, Filter, Message } from "../types";

/** Messages that match the selected filter, urgent first, then newest first. */
export function filterMessages(messages: Message[], filter: Filter): Message[] {
  const picked = messages.filter((m) => {
    if (filter === "all") return true;
    if (filter === "urgent") return m.triage.urgent;
    return m.triage.category === filter;
  });
  return [...picked].sort((a, b) => {
    if (a.triage.urgent !== b.triage.urgent) return a.triage.urgent ? -1 : 1;
    return parseUtc(b.received_at) - parseUtc(a.received_at);
  });
}

/** Count per filter chip: all, urgent and each category. */
export function countByFilter(messages: Message[]): Record<Filter, number> {
  const counts: Record<Filter, number> = {
    all: messages.length,
    urgent: 0,
    check_in: 0,
    complaint: 0,
    maintenance: 0,
    booking_change: 0,
    general_question: 0,
  };
  for (const m of messages) {
    if (m.triage.urgent) counts.urgent += 1;
    counts[m.triage.category as Category] += 1;
  }
  return counts;
}

/** The API sends UTC timestamps without a zone suffix. */
export function parseUtc(value: string): number {
  return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function timeAgo(value: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - parseUtc(value)) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** Short preview for the inbox list. */
export function preview(body: string, max = 90): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
