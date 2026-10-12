import { describe, expect, it } from "vitest";
import seed from "../data/seed.json";
import {
  can, cleanUrl, confirmedPipelineValue, counts, daysUntil, deadlineLabel, displayValue,
  filterProjects, isContactReady, linkState, mailHref, sortProjects, telHref, toCSV,
} from "../lib/leads";
import type { Project, Route } from "../lib/types";

function fromSeed(): Project[] {
  return (seed.projects as any[]).map((p) => ({
    ...p,
    verdict: null, verdict_by: null, verdict_at: null, archived: false,
    routes: p.routes.map((r: any) => ({ ...r, project_id: p.id, stage: "new", updated_by: null, updated_at: null })),
  }));
}
const byId = (ps: Project[], id: string) => ps.find((p) => p.id === id)!;

describe("starter data matches the brief", () => {
  const ps = fromSeed();
  it("has 4 bid projects with 6 contractor routes", () => {
    const bids = ps.filter((p) => p.kind === "bid");
    expect(bids).toHaveLength(4);
    expect(bids.reduce((n, p) => n + p.routes.length, 0)).toBe(6);
  });
  it("counts Magnolia/Naranca as ONE project with THREE bid contacts", () => {
    const m = byId(ps, "p-magnolia-naranca");
    expect(m.routes.map((r) => r.contractor)).toEqual(["Conan Construction", "Grahovac Construction", "Fordyce Construction"]);
    expect(ps.filter((p) => /Magnolia/.test(p.name))).toHaveLength(1);
  });
  it("seeds the residential queue as research with no contact routes", () => {
    const res = ps.filter((p) => p.kind === "residential_research");
    expect(res.map((p) => p.name)).toEqual(["Rancho Bernardo remodel", "Bay Park whole-home remodel", "Garage ADU"]);
    res.forEach((p) => expect(p.routes).toHaveLength(0));
  });
  it("marks the architect as a partner, never a job, and never contact-ready", () => {
    const w = byId(ps, "p-partner-winkelstein");
    expect(w.kind).toBe("partner");
    expect(isContactReady(w, w.routes[0])).toBe(false);
  });
  it("shows no value anywhere (none are confirmed); Mission $450K stays a caveat", () => {
    ps.forEach((p) => expect(displayValue(p)).toBeNull());
    expect(byId(ps, "p-mission-library").value_note).toMatch(/not a framing contract/);
    expect(confirmedPipelineValue(ps)).toBe(0);
  });
  it("never seeds anything as already contacted", () => {
    ps.flatMap((p) => p.routes).forEach((r) => expect(r.stage).toBe("new"));
  });
  it("keeps the Conan email caveat", () => {
    const conan = byId(ps, "p-magnolia-naranca").routes[0];
    expect(conan.verification_note).toMatch(/separate .*solicitation/i);
  });
});

describe("provenance: no fabricated links", () => {
  const base = { original_ad_url: null, source_url: null } as Pick<Route, "original_ad_url" | "source_url">;
  it("original ad gets the real button", () => {
    expect(linkState({ ...base, original_ad_url: "https://x.com/ad/1" })).toMatchObject({ kind: "original", label: "Open original ad" });
  });
  it("aggregator-only is labeled UNVERIFIED and never called the original", () => {
    const s = linkState({ ...base, source_url: "https://agg.com/1" });
    expect(s.kind).toBe("source_only");
    if (s.kind === "source_only") {
      expect(s.label).not.toMatch(/original/i);
      expect(s.warning).toMatch(/^UNVERIFIED/);
    }
  });
  it("nothing on file shows a warning and no URL at all", () => {
    const s = linkState(base);
    expect(s).toEqual({ kind: "unverified", warning: "UNVERIFIED: no original link on file." });
  });
  it("rejects junk and javascript: URLs", () => {
    expect(cleanUrl("javascript:alert(1)")).toBeNull();
    expect(cleanUrl("not a url")).toBeNull();
    expect(linkState({ ...base, original_ad_url: "javascript:alert(1)" }).kind).toBe("unverified");
  });
  it("Mission library (aggregator) and Sunset View (general bid center) are UNVERIFIED", () => {
    const ps = fromSeed();
    expect(linkState(byId(ps, "p-mission-library").routes[0]).kind).toBe("source_only");
    expect(linkState(byId(ps, "p-sunset-view").routes[0]).kind).toBe("source_only");
  });
});

describe("contact buttons", () => {
  it("builds dialable tel links only with enough digits", () => {
    expect(telHref("(760) 512-1188")).toBe("tel:+17605121188");
    expect(telHref("555-1234")).toBeNull();
    expect(telHref(null)).toBeNull();
  });
  it("builds mailto only for real-looking addresses", () => {
    expect(mailHref("trevorb@grahovacconst.com")).toBe("mailto:trevorb@grahovacconst.com");
    expect(mailHref("call the office")).toBeNull();
  });
});

describe("permissions mirror the database", () => {
  it("Brendan can rate, stage and note, but not edit or archive", () => {
    expect(can.setVerdict("reviewer")).toBe(true);
    expect(can.setStage("reviewer")).toBe(true);
    expect(can.addNote("reviewer")).toBe(true);
    expect(can.editLead("reviewer")).toBe(false);
    expect(can.archive("reviewer")).toBe(false);
  });
  it("strangers can do nothing", () => {
    Object.values(can).forEach((f) => expect(f(null)).toBe(false));
  });
});

describe("value counts once per owner project", () => {
  it("three routes do not triple revenue", () => {
    const ps = fromSeed();
    const m = { ...byId(ps, "p-magnolia-naranca"), est_value: 20000, value_confirmed: true };
    expect(confirmedPipelineValue([m])).toBe(20000);
    expect(displayValue(m)).toBe("$20,000");
  });
  it("unconfirmed value is hidden", () => {
    expect(displayValue({ est_value: 450000, value_confirmed: false })).toBeNull();
  });
});

describe("search, filters, sorting", () => {
  const ps = fromSeed();
  it("searches GC names inside routes", () => {
    expect(filterProjects(ps, { q: "grahovac" }).map((p) => p.id)).toEqual(["p-magnolia-naranca"]);
  });
  it("filters unrated vs rated", () => {
    const rated = ps.map((p) => (p.id === "p-monroe" ? { ...p, verdict: "good" as const } : p));
    expect(filterProjects(rated, { verdict: "good" }).map((p) => p.id)).toEqual(["p-monroe"]);
    expect(filterProjects(rated, { verdict: "unrated" })).toHaveLength(ps.length - 1);
  });
  it("hides archived unless asked", () => {
    const a = ps.map((p) => (p.id === "p-monroe" ? { ...p, archived: true } : p));
    expect(filterProjects(a, {}).some((p) => p.id === "p-monroe")).toBe(false);
    expect(filterProjects(a, { showArchived: true }).map((p) => p.id)).toEqual(["p-monroe"]);
  });
  it("sorts soonest deadline first with no-deadline last", () => {
    const ids = sortProjects(ps, "deadline").map((p) => p.id);
    expect(ids.slice(0, 4)).toEqual(["p-mission-library", "p-magnolia-naranca", "p-sunset-view", "p-monroe"]);
  });
  it("counts projects and routes separately", () => {
    expect(counts(ps)).toEqual({ projects: 8, routes: 7, unrated: 4 });
  });
});

describe("deadlines", () => {
  const today = new Date(2026, 9, 11);
  it("counts days and labels them", () => {
    expect(daysUntil("2026-10-20", today)).toBe(9);
    expect(deadlineLabel("2026-10-12", today)).toMatch(/tomorrow/);
    expect(deadlineLabel("2026-10-01", today)).toMatch(/closed/);
    expect(deadlineLabel(null, today)).toBe("No deadline");
  });
});

describe("CSV export", () => {
  it("has one row per route, value only on the first, UNVERIFIED flagged", () => {
    const ps = fromSeed();
    const csv = toCSV([byId(ps, "p-magnolia-naranca"), byId(ps, "p-mission-library")]).split("\n");
    expect(csv).toHaveLength(1 + 3 + 1);
    expect(csv[2]).toContain("(same project)");
    expect(csv[4]).toContain("UNVERIFIED");
  });
  it("neutralizes spreadsheet formulas", () => {
    const ps = fromSeed();
    const evil = { ...byId(ps, "p-monroe"), name: "=HYPERLINK(\"x\")" };
    expect(toCSV([evil])).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
  });
});
