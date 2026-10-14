export type MikeLeadStatus =
  | "research" | "qualified" | "contacted" | "proposal_sent"
  | "negotiating" | "won" | "lost" | "archived";

export type VerificationStatus =
  | "original_checked" | "prior_report_only" | "needs_review" | "source_unavailable";

export interface MikeLead {
  id: string;
  owner_id: string;
  title: string;
  category: string;
  source_platform: string;
  source_url: string;
  posted_budget: string | null;
  proposed_price: string | null;
  lead_status: MikeLeadStatus;
  verification_status: VerificationStatus;
  verified_on: string | null;
  contact_route: string | null;
  research_notes: string | null;
  created_at: string;
  updated_at: string;
}

export const MIKE_STAGES: { value: MikeLeadStatus; label: string }[] = [
  { value: "research", label: "Research" },
  { value: "qualified", label: "Qualified" },
  { value: "contacted", label: "Contacted" },
  { value: "proposal_sent", label: "Proposal sent" },
  { value: "negotiating", label: "Negotiating" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "archived", label: "Archived" },
];

export function stageLabel(status: MikeLeadStatus): string {
  return MIKE_STAGES.find((x) => x.value === status)?.label ?? "Unknown";
}

export function verificationLabel(status: VerificationStatus): string {
  switch (status) {
    case "original_checked": return "Original checked; recheck before outreach";
    case "prior_report_only": return "Prior research only; not reverified";
    case "source_unavailable": return "Source unavailable; verify before acting";
    case "needs_review": return "Needs verification";
    default: return "Not verified";
  }
}

/** Untrusted URLs come from research notes. Never open javascript: or data: links. */
export function safeSourceUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname
      ? url.href : null;
  } catch {
    return null;
  }
}

export function visibleMikeLeads(
  leads: MikeLead[],
  query: string,
  status: MikeLeadStatus | "all",
): MikeLead[] {
  const q = query.trim().toLocaleLowerCase();
  return leads.filter((lead) => {
    if (status !== "all" && lead.lead_status !== status) return false;
    if (!q) return true;
    return [
      lead.title, lead.category, lead.source_platform,
      lead.contact_route ?? "", lead.research_notes ?? ""
    ].join(" ").toLocaleLowerCase().includes(q);
  }).sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at) || a.title.localeCompare(b.title)
  );
}
