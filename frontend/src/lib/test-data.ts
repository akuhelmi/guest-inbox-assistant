/** Test fixtures only. */
import type { Message } from "../types";

export const NOW = Date.parse("2026-11-14T10:00:00Z");

export function msg(
  id: number,
  minutesAgo: number,
  extra: Partial<Message["triage"]> = {},
): Message {
  return {
    id,
    guest_name: `Guest ${id}`,
    property_id: 1,
    property_name: "Seaview Loft",
    property_city: "Penang",
    received_at: new Date(NOW - minutesAgo * 60000).toISOString().replace("Z", ""),
    body: "text",
    status: "new",
    replied_at: null,
    channel: "airbnb",
    triage: {
      category: "maintenance",
      category_label: "Maintenance",
      urgent: false,
      reason: "",
      draft_reply: `Hi guest ${id}`,
      triaged_by: "saved example",
      language: "en",
      language_label: "English",
      confidence: "medium",
      needs_host: false,
      facts_used: [],
      suggested_task: null,
      ...extra,
    },
  };
}
