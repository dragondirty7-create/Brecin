import { describe, expect, it } from "vitest";
import { earnedXP, levelForXP, mapLeadToQuest, questKind } from "../lib/money-quest";
import type { MikeLead } from "../lib/mike-leads";
const lead: MikeLead={ id:"a",owner_id:"owner",title:"Audio troubleshooting",category:"mixing",source_platform:"Example",source_url:"",posted_budget:"$100",proposed_price:"$80",lead_status:"research",verification_status:"needs_review",verified_on:null,contact_route:null,research_notes:null,created_at:"2026-10-15T00:00:00Z",updated_at:"2026-10-15T00:00:00Z" };
describe("Money Quest safety and XP",()=>{
  it("derives a quest without modifying a lead",()=>{const before=JSON.stringify(lead);expect(mapLeadToQuest(lead).codename).toBe("The Audio Gremlin");expect(JSON.stringify(lead)).toBe(before)});
  it("never awards fake XP for stale or unrelated saved entries",()=>{expect(earnedXP({a:["verify","scope"],b:["pitch"]},["a"])).toBe(25);expect(earnedXP({a:["verify","verify"]},["a"])).toBe(10)});
  it("classifies gigs and levels deterministically",()=>{expect(questKind("wordpress","site repair")).toBe("web");expect(questKind("camera install","four cameras")).toBe("tech");expect(levelForXP(99)).toBe(1);expect(levelForXP(100)).toBe(2)});
  it("never turns a proposed quote into real earnings",()=>{expect(mapLeadToQuest(lead).proposedPrice).toBe("$80");expect(mapLeadToQuest(lead).stage).toBe("research")});
});
