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
}

export type Filter = "all" | "urgent" | "needs_host" | Category;
