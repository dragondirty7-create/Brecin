import type { Debrief, DebriefInput, LeadAccuracy, MoreLikeThis, Outcome, Project, Reason, Route } from "./types";

export const ACCURACY: { id: LeadAccuracy; label: string }[] = [
  { id: "right", label: "Spot on" },
  { id: "partly", label: "Partly" },
  { id: "wrong", label: "Wrong" },
];

export const REASONS: { id: Reason; label: string }[] = [
  { id: "price", label: "Price" },
  { id: "timing", label: "Timing" },
  { id: "relationship", label: "Knew them" },
  { id: "scope_fit", label: "Scope fit" },
  { id: "no_response", label: "No reply" },
  { id: "paperwork", label: "Paperwork" },
  { id: "distance", label: "Distance" },
  { id: "other", label: "Other" },
];

export const MORE: { id: MoreLikeThis; label: string }[] = [
  { id: "more", label: "More like this" },
  { id: "same", label: "Same" },
  { id: "fewer", label: "Fewer" },
];

export function isDone(stage: Route["stage"]): stage is Outcome {
  return stage === "won" || stage === "lost";
}

/** Routes that ended but have no debrief from this person yet. */
export function needsDebrief(p: Project, debriefs: Debrief[], me: string | null): Route[] {
  if (!me || p.kind === "partner") return [];
  return p.routes.filter((r) => isDone(r.stage) && !debriefs.some((d) => d.route_id === r.id && d.author === me));
}

export function emptyDebrief(outcome: Outcome): DebriefInput {
  return { outcome, lead_accuracy: null, reasons: [], more_like_this: null, real_value: null, for_agents: null };
}

/** Returns a problem to show, or null when the debrief can be saved. */
export function validateDebrief(d: DebriefInput): string | null {
  if (!d.lead_accuracy && !d.reasons.length && !d.more_like_this && !d.for_agents?.trim())
    return "Answer at least one question.";
  if (d.real_value !== null && (!Number.isFinite(d.real_value) || d.real_value < 0)) return "Job value must be a positive number.";
  if (d.for_agents && d.for_agents.length > 2000) return "Keep the note under 2,000 characters.";
  return null;
}

/** "$12,400" → 12400. Blank → null. Junk → NaN (caught by validateDebrief). */
export function parseMoney(s: string): number | null {
  const t = s.replace(/[$,\s]/g, "");
  if (!t) return null;
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : NaN;
}

const label = <T extends string>(list: { id: T; label: string }[], id: T | null) => list.find((x) => x.id === id)?.label ?? "—";

/**
 * The briefing agents read: one block per finished route, newest first, plus
 * a few counts at the top. Plain markdown so it can go in Drive or a prompt.
 */
export function agentBriefing(
  projects: Project[],
  debriefs: Debrief[],
  people: Record<string, { display_name: string }>,
  voiceCounts: Record<string, number> = {},
  today = new Date()
): string {
  const lines: string[] = [];
  const sorted = [...debriefs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const won = sorted.filter((d) => d.outcome === "won").length;
  const more = sorted.filter((d) => d.more_like_this === "more").length;
  const fewer = sorted.filter((d) => d.more_like_this === "fewer").length;
  const wrong = sorted.filter((d) => d.lead_accuracy === "wrong").length;
  const reasonCount = new Map<Reason, number>();
  for (const d of sorted) for (const r of d.reasons) reasonCount.set(r, (reasonCount.get(r) ?? 0) + 1);
  const topReasons = [...reasonCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  lines.push(`# Project Presser — agent briefing (${today.toISOString().slice(0, 10)})`);
  lines.push("");
  lines.push("What the people who worked these leads said after each job ended. Use it to pick and check future leads.");
  lines.push("");
  lines.push(`- Debriefs: ${sorted.length} (won ${won}, lost ${sorted.length - won})`);
  lines.push(`- Wants more like this: ${more} · fewer: ${fewer}`);
  lines.push(`- Lead info was wrong: ${wrong}`);
  if (topReasons.length) lines.push(`- Top reasons: ${topReasons.map(([r, n]) => `${label(REASONS, r)} (${n})`).join(", ")}`);
  lines.push("");

  for (const d of sorted) {
    const p = projects.find((x) => x.id === d.project_id);
    const r = p?.routes.find((x) => x.id === d.route_id);
    lines.push(`## ${p?.name ?? "Unknown project"} — ${r?.contractor ?? "unknown route"} — ${d.outcome.toUpperCase()}`);
    lines.push(`- Told by ${people[d.author]?.display_name ?? "someone"} on ${d.created_at.slice(0, 10)}`);
    if (p?.city || r?.trade_scope) lines.push(`- ${[p?.city, r?.trade_scope].filter(Boolean).join(" · ")}`);
    lines.push(`- Lead info: ${label(ACCURACY, d.lead_accuracy)} · Why: ${d.reasons.map((x) => label(REASONS, x)).join(", ") || "—"} · Next time: ${label(MORE, d.more_like_this)}`);
    if (d.real_value !== null) lines.push(`- Real value: $${d.real_value.toLocaleString("en-US")}${p?.est_value ? ` (estimated $${p.est_value.toLocaleString("en-US")})` : ""}`);
    if (d.for_agents?.trim()) lines.push(`- For the agents: "${d.for_agents.trim().replace(/\s+/g, " ")}"`);
    const v = voiceCounts[d.route_id] ?? 0;
    if (v) lines.push(`- ${v} spoken answer${v > 1 ? "s" : ""} on the board (not transcribed)`);
    lines.push("");
  }
  if (!sorted.length) lines.push("_No finished jobs debriefed yet._");
  return lines.join("\n").trimEnd() + "\n";
}
