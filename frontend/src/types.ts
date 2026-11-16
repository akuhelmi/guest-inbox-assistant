export type Category =
  | "check_in"
  | "complaint"
  | "maintenance"
  | "booking_change"
  | "general_question";

export type Confidence = "high" | "medium" | "low";

export interface FactRef {
  key: string;
  label: string;
}

export interface Fact extends FactRef {
  value: string;
}

export interface Property {
  id: number;
  name: string;
  city: string;
  facts: Fact[];
}

export interface Triage {
  category: Category;
  category_label: string;
  urgent: boolean;
  reason: string;
  draft_reply: string;
  triaged_by: string;
  language: string;
  language_label: string;
  confidence: Confidence;
  /** Low confidence: a person should check before replying. */
  needs_host: boolean;
  facts_used: FactRef[];
  suggested_task: TaskSuggestion | null;
}

export interface TaskSuggestion {
  title: string;
  assignee: "host" | "cleaner" | "maintenance";
  assignee_label: string;
  due_minutes: number;
  /** A team member id (the AI named one, or the app picked the nearest free one). */
  person?: string;
  /** "Ravi (maintenance)", set by the app for the plan. */
  person_label?: string;
}

export type Status = "new" | "replied" | "done";

export interface Message {
  id: number;
  guest_name: string;
  property_id: number;
  property_name: string;
  property_city: string;
  received_at: string; // UTC, without a zone suffix
  body: string;
  triage: Triage;
  /** Starting status of the demo data; the visitor's own changes live in the browser. */
  status: Status;
  replied_at: string | null;
  /** Where the guest wrote from: airbnb, booking or direct. */
  channel: string;
}

export interface LiveTriage {
  triage: Triage;
  calls_left_this_hour: number;
}

export interface Meta {
  provider: string;
  categories: Record<Category, string>;
  max_message_chars: number;
  rate_limit_per_hour: number;
  agent_limit_per_day: number;
  suggestions: string[];
}

export type Filter = "all" | "urgent" | "needs_host" | Category;

// --- Inbox assistant --------------------------------------------------------------------

export type CardKind = "draft" | "status" | "task";

/** An action the assistant proposes. Nothing changes until the host approves it. */
export interface AgentCard {
  kind: CardKind;
  message_id: number;
  guest_name: string;
  property_name: string;
  draft: string;
  language: string;
  language_label: string;
  confidence: Confidence;
  needs_host: boolean;
  facts_used: FactRef[];
  status: Status | "";
  task: TaskSuggestion | null;
}

export interface AgentReply {
  text: string;
  cards: AgentCard[];
  highlight: number[];
  focus: number | null;
  by: string;
  ai_left_today: number | null;
  note: string | null;
  /** The cards are the whole remaining plan for the open message. */
  plan?: boolean;
}

export interface AgentTurn {
  role: "host" | "assistant";
  text: string;
}

export interface AgentStateIn {
  statuses: Record<number, { status: Status; replied_at_ms: number | null }>;
  tasks: { message_id: number; title: string; done: boolean }[];
}
