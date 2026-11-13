import type { LiveTriage, Message, Meta } from "./types";

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
  retriage: (id: number) =>
    request<LiveTriage>(`/api/messages/${id}/triage`, { method: "POST" }),
  triageText: (body: string, guestName: string) =>
    request<LiveTriage>("/api/triage", {
      method: "POST",
      body: JSON.stringify({ body, guest_name: guestName }),
    }),
};
