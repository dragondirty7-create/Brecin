export type Verdict = "good" | "maybe" | "bad";
export type Stage = "new" | "contacted" | "estimating" | "quote_sent" | "won" | "lost";
export type ProjectKind = "bid" | "residential_research" | "partner";
export type Role = "admin" | "reviewer";

export const STAGES: { id: Stage; label: string }[] = [
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "estimating", label: "Estimating" },
  { id: "quote_sent", label: "Quote Sent" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

/** One way to bid an owner project (usually a general contractor's request). */
export interface Route {
  id: string;
  project_id: string;
  contractor: string;
  trade_scope: string | null;
  /** Where Michael found it (may be an aggregator). */
  source_url: string | null;
  /** The poster's own solicitation. Null means UNVERIFIED. */
  original_ad_url: string | null;
  date_posted: string | null;
  date_checked: string | null;
  how_to_reply: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  /** Free-text caveat, e.g. "email came from a different solicitation". */
  verification_note: string | null;
  bid_status: string | null;
  stage: Stage;
  updated_by: string | null;
  updated_at: string | null;
}

/** The owner project. Revenue belongs here once, never per route. */
export interface Project {
  id: string;
  name: string;
  city: string | null;
  kind: ProjectKind;
  scope: string | null;
  size: string | null;
  deadline: string | null;
  est_value: number | null;
  value_confirmed: boolean;
  value_note: string | null;
  verdict: Verdict | null;
  verdict_by: string | null;
  verdict_at: string | null;
  archived: boolean;
  created_at: string;
  routes: Route[];
}

export interface Note {
  id: string;
  project_id: string;
  route_id: string | null;
  author: string;
  body: string;
  created_at: string;
}

export interface LeadEvent {
  id: string;
  project_id: string;
  route_id: string | null;
  author: string;
  kind: "verdict" | "stage" | "archive" | "edit";
  from_value: string | null;
  to_value: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  display_name: string;
  role: Role;
}
