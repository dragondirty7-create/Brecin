import type { MikeLead } from "./mike-leads";

export type QuestKind = "audio" | "web" | "education" | "tech" | "wild";
export type QuestStep = "verify" | "scope" | "pitch";
export type QuestProgress = Record<string, QuestStep[]>;
export const QUEST_STEPS: { id: QuestStep; title: string; xp: number }[] = [
  { id: "verify", title: "Check buyer & original source", xp: 10 },
  { id: "scope", title: "Prepare a 30-minute plan", xp: 15 },
  { id: "pitch", title: "Draft a pitch for approval", xp: 25 },
];

export function questKind(category: string, title: string): QuestKind {
  const s = (category + " " + title).toLowerCase();
  if (/audio|music|mix|song|sound|livestream|stream|podcast|production/.test(s)) return "audio";
  if (/camera|ring|hardware|security|install|device/.test(s)) return "tech";
  if (/educat|teach|lesson|coach|training|workshop/.test(s)) return "education";
  if (/web|seo|site|wordpress|shopify|squarespace|landing|ux|design/.test(s)) return "web";
  return "wild";
}
export function questName(kind: QuestKind): string {
  return ({
    audio: "The Audio Gremlin",
    web: "The Broken Portal",
    tech: "The Four-Eyed Guardian",
    education: "The Knowledge Wizard",
    wild: "The Mystery Bounty",
  } as const)[kind];
}
export function earnedXP(progress: QuestProgress, validIds: string[]): number {
  return validIds.reduce((sum, id) => {
    const completed = progress[id] ?? [];
    return sum + QUEST_STEPS.reduce((total, step) => total + (completed.includes(step.id) ? step.xp : 0), 0);
  }, 0);
}
export function levelForXP(xp: number): number { return Math.floor(Math.max(0, xp) / 100) + 1; }
export function isRealMoney(status: string): boolean { return status === "won"; }
export function mapLeadToQuest(lead: MikeLead) {
  const kind = questKind(lead.category, lead.title);
  return {
    id: lead.id,
    title: lead.title,
    codename: questName(kind),
    kind,
    stage: lead.lead_status,
    source: lead.source_url,
    buyerBudget: lead.posted_budget,
    proposedPrice: lead.proposed_price,
    verification: lead.verification_status,
    sourcePlatform: lead.source_platform,
    contactRoute: lead.contact_route,
    notes: lead.research_notes,
  };
}
