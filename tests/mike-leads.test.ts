import { describe, expect, it } from "vitest";
import {
  safeSourceUrl, visibleMikeLeads, verificationLabel, type MikeLead,
} from "../lib/mike-leads";

const base: MikeLead = {
  id: "1", owner_id: "owner", title: "Mix a song", category: "audio",
  source_platform: "Freelancer", source_url: "https://example.org/job",
  posted_budget: "$250–$750", proposed_price: "$500", lead_status: "research",
  verification_status: "prior_report_only", verified_on: null,
  contact_route: "Bid on platform", research_notes: "Confirm licensing.",
  created_at: "2026-10-14T00:00:00Z", updated_at: "2026-10-14T00:00:00Z",
};

describe("Mike leads read-only helpers", () => {
  it("rejects unsafe research links", () => {
    expect(safeSourceUrl("javascript:alert(1)")).toBeNull();
    expect(safeSourceUrl("data:text/html,hello")).toBeNull();
    expect(safeSourceUrl("//evil.test")).toBeNull();
    expect(safeSourceUrl("https://example.org/job")).toBe("https://example.org/job");
  });
  it("searches platform, category and notes without altering source rows", () => {
    const data = [base, { ...base, id: "2", title: "Repair website", category: "web", lead_status: "contacted" as const, updated_at: "2026-10-15T00:00:00Z" }];
    expect(visibleMikeLeads(data, "mix", "all").map((x) => x.id)).toEqual(["1"]);
    expect(visibleMikeLeads(data, "", "contacted").map((x) => x.id)).toEqual(["2"]);
    expect(data).toHaveLength(2);
  });
  it("never presents a historical report as an already verified buyer", () => {
    expect(verificationLabel("prior_report_only")).toMatch(/not reverified/i);
    expect(verificationLabel("source_unavailable")).toMatch(/unavailable/i);
  });
});
