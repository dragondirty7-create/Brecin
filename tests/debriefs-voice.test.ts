import { describe, expect, it } from "vitest";
import { agentBriefing, emptyDebrief, needsDebrief, parseMoney, validateDebrief } from "../lib/debrief";
import { baseMime, clock, extFor, micError, pickMimeType, voicePath } from "../lib/voice";
import type { Debrief, Project, Route } from "../lib/types";

const route = (id: string, stage: Route["stage"], contractor = "GC " + id): Route => ({
  id,
  project_id: "p1",
  contractor,
  trade_scope: "Framing",
  source_url: null,
  original_ad_url: null,
  date_posted: null,
  date_checked: null,
  how_to_reply: null,
  contact_name: null,
  phone: null,
  email: null,
  verification_note: null,
  bid_status: null,
  stage,
  updated_by: null,
  updated_at: null,
});

const project = (routes: Route[], kind: Project["kind"] = "bid"): Project => ({
  id: "p1",
  name: "Magnolia + Naranca",
  city: "El Cajon",
  kind,
  scope: null,
  size: null,
  deadline: null,
  est_value: 40000,
  value_confirmed: false,
  value_note: null,
  verdict: null,
  verdict_by: null,
  verdict_at: null,
  archived: false,
  created_at: "2026-10-01T00:00:00Z",
  routes,
});

const debrief = (over: Partial<Debrief>): Debrief => ({
  id: "d1",
  project_id: "p1",
  route_id: "r1",
  author: "brendan",
  outcome: "won",
  lead_accuracy: "right",
  reasons: ["price"],
  more_like_this: "more",
  real_value: 38500,
  for_agents: "This GC always wants a site walk first.",
  created_at: "2026-10-17T10:00:00Z",
  updated_at: "2026-10-17T10:00:00Z",
  ...over,
});

describe("when a debrief is asked for", () => {
  it("asks once a route is Won or Lost, per person, until they answer", () => {
    const p = project([route("r1", "won"), route("r2", "lost"), route("r3", "estimating")]);
    expect(needsDebrief(p, [], "brendan").map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(needsDebrief(p, [debrief({ route_id: "r1" })], "brendan").map((r) => r.id)).toEqual(["r2"]);
    // Brendan's answer doesn't excuse Michael from his own.
    expect(needsDebrief(p, [debrief({ route_id: "r1" })], "michael").map((r) => r.id)).toEqual(["r1", "r2"]);
  });
  it("never asks about partner contacts, or when nobody is signed in", () => {
    expect(needsDebrief(project([route("r1", "won")], "partner"), [], "brendan")).toEqual([]);
    expect(needsDebrief(project([route("r1", "won")]), [], null)).toEqual([]);
  });
});

describe("debrief answers", () => {
  it("needs at least one answer", () => {
    expect(validateDebrief(emptyDebrief("lost"))).toMatch(/at least one/);
    expect(validateDebrief({ ...emptyDebrief("lost"), reasons: ["price"] })).toBeNull();
    expect(validateDebrief({ ...emptyDebrief("won"), for_agents: "  ok " })).toBeNull();
  });
  it("reads money the way people type it", () => {
    expect(parseMoney("$12,400")).toBe(12400);
    expect(parseMoney(" 980.50 ")).toBe(980.5);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("about 5k")).toBeNaN();
    expect(validateDebrief({ ...emptyDebrief("won"), lead_accuracy: "right", real_value: NaN })).toMatch(/positive number/);
  });
});

describe("agent briefing", () => {
  it("gives agents counts and one block per finished job, newest first", () => {
    const p = project([route("r1", "won", "Sun Builders"), route("r2", "lost", "Pacific GC")]);
    const md = agentBriefing(
      [p],
      [
        debrief({ id: "a", route_id: "r1", created_at: "2026-10-16T10:00:00Z" }),
        debrief({ id: "b", route_id: "r2", outcome: "lost", lead_accuracy: "wrong", reasons: ["price", "timing"], more_like_this: "fewer", real_value: null, for_agents: null, created_at: "2026-10-17T10:00:00Z" }),
      ],
      { brendan: { display_name: "Brendan" } },
      { r1: 2 },
      new Date("2026-10-17T12:00:00Z")
    );
    expect(md).toContain("# Project Presser — agent briefing (2026-10-17)");
    expect(md).toContain("- Debriefs: 2 (won 1, lost 1)");
    expect(md).toContain("- Lead info was wrong: 1");
    expect(md).toContain("- Top reasons: Price (2), Timing (1)");
    expect(md.indexOf("Pacific GC — LOST")).toBeLessThan(md.indexOf("Sun Builders — WON"));
    expect(md).toContain("- Real value: $38,500 (estimated $40,000)");
    expect(md).toContain('- For the agents: "This GC always wants a site walk first."');
    expect(md).toContain("- 2 spoken answers on the board (not transcribed)");
    expect(md).toContain("- Told by Brendan on 2026-10-16");
  });
  it("says so when nothing has been debriefed", () => {
    expect(agentBriefing([], [], {})).toContain("No finished jobs debriefed yet");
  });
});

describe("voice recording helpers", () => {
  it("picks webm where supported and mp4 on iPhone", () => {
    expect(pickMimeType((t) => t.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(pickMimeType((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(pickMimeType(() => false)).toBeNull();
    expect(pickMimeType(() => { throw new Error("nope"); })).toBeNull();
  });
  it("stores files under the uploader's own folder with the right extension", () => {
    const p = voicePath("user-123", "test", "audio/mp4", new Date("2026-10-17T10:00:00.000Z"), 0.5);
    expect(p).toMatch(/^user-123\/test-2026-10-17T10-00-00-000Z-[a-z0-9]+\.m4a$/);
    expect(baseMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(extFor("audio/webm;codecs=opus")).toBe("webm");
  });
  it("shows time and plain-English microphone errors", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(125.9)).toBe("2:05");
    expect(micError({ name: "NotAllowedError" })).toMatch(/blocked/);
    expect(micError({ name: "NotFoundError" })).toMatch(/No microphone/);
    expect(micError(new Error("x"))).toMatch(/Couldn't start/);
  });
});
