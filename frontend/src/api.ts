import type {
  AgentReply,
  AgentStateIn,
  AgentTurn,
  LiveTriage,
  Message,
  Meta,
  Property,
} from "./types";
import type { Team } from "./lib/team";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // keep the generic message
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  meta: () => request<Meta>("/api/meta"),
  messages: () => request<Message[]>("/api/messages"),
  properties: () => request<Property[]>("/api/properties"),
  team: () => request<Team>("/api/team"),
  retriage: (id: number) =>
    request<LiveTriage>(`/api/messages/${id}/triage`, { method: "POST" }),
  triageText: (body: string, guestName: string, propertyId: number | null) =>
    request<LiveTriage>("/api/triage", {
      method: "POST",
      body: JSON.stringify({ body, guest_name: guestName, property_id: propertyId }),
    }),
  /** One turn with the inbox assistant. An empty text asks for the opening briefing. */
  agent: (
    text: string,
    history: AgentTurn[],
    state: AgentStateIn,
    messageId?: number,
    team: string[] = [],
  ) =>
    request<AgentReply>("/api/agent", {
      method: "POST",
      body: JSON.stringify({ text, history, state, message_id: messageId ?? null, team }),
    }),
};
