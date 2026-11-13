export type Category =
  | "check_in"
  | "complaint"
  | "maintenance"
  | "booking_change"
  | "general_question";

export interface Triage {
  category: Category;
  category_label: string;
  urgent: boolean;
  reason: string;
  draft_reply: string;
  triaged_by: string;
}

export interface Message {
  id: number;
  guest_name: string;
  property_name: string;
  property_city: string;
  received_at: string; // UTC, without a zone suffix
  body: string;
  triage: Triage;
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

export type Filter = "all" | "urgent" | Category;
