import type { Project, Route, Verdict, Role, Stage } from "./types";

/* ---------- Provenance ---------- */

export type LinkState =
  | { kind: "original"; url: string; label: string }
  | { kind: "source_only"; url: string; label: string; warning: string }
  | { kind: "unverified"; warning: string };

/**
 * What the "open ad" control may honestly claim.
 * Never invents or substitutes a generic link.
 */
export function linkState(r: Pick<Route, "original_ad_url" | "source_url">): LinkState {
  const orig = cleanUrl(r.original_ad_url);
  if (orig) return { kind: "original", url: orig, label: "Open original ad" };
  const src = cleanUrl(r.source_url);
  if (src)
    return {
      kind: "source_only",
      url: src,
      label: "Open source listing",
      warning: "UNVERIFIED: original ad not confirmed. This is where we found it.",
    };
  return { kind: "unverified", warning: "UNVERIFIED: no original link on file." };
}

export function cleanUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  const t = u.trim();
  try {
    const parsed = new URL(t);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** tel: link only when the number has enough digits to dial. */
export function telHref(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `tel:+${digits.length === 10 ? "1" + digits : digits}`;
}

export function mailHref(email: string | null): string | null {
  if (!email) return null;
  const t = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? `mailto:${t}` : null;
}

/** A route is contact-ready only for real bid projects with a usable contact. */
export function isContactReady(p: Project, r: Route): boolean {
  if (p.kind !== "bid") return false;
  return Boolean(telHref(r.phone) || mailHref(r.email));
}

/* ---------- Values ---------- */

/** Estimated value is shown only when confirmed. */
export function displayValue(p: Pick<Project, "est_value" | "value_confirmed">): string | null {
  if (!p.value_confirmed || p.est_value == null) return null;
  return "$" + Math.round(p.est_value).toLocaleString("en-US");
}

/** Pipeline value counts each owner project once, however many routes it has. */
export function confirmedPipelineValue(projects: Project[]): number {
  return projects
    .filter((p) => !p.archived && p.value_confirmed && p.est_value != null)
    .reduce((sum, p) => sum + (p.est_value as number), 0);
}

export function counts(projects: Project[]) {
  const live = projects.filter((p) => !p.archived);
  return {
    projects: live.length,
    routes: live.reduce((n, p) => n + p.routes.length, 0),
    unrated: live.filter((p) => p.kind === "bid" && !p.verdict).length,
  };
}

/* ---------- Permissions (mirrors database rules; DB is the authority) ---------- */

export const can = {
  setVerdict: (role: Role | null) => role === "admin" || role === "reviewer",
  setStage: (role: Role | null) => role === "admin" || role === "reviewer",
  addNote: (role: Role | null) => role === "admin" || role === "reviewer",
  editLead: (role: Role | null) => role === "admin",
  archive: (role: Role | null) => role === "admin",
};

/* ---------- Search, filter, sort ---------- */

export type SortKey = "deadline" | "newest";
export type VerdictFilter = Verdict | "unrated" | "all";

export function filterProjects(
  projects: Project[],
  opts: { q?: string; verdict?: VerdictFilter; showArchived?: boolean; stage?: Stage | "all" }
): Project[] {
  const q = (opts.q ?? "").trim().toLowerCase();
  return projects.filter((p) => {
    if (!opts.showArchived && p.archived) return false;
    if (opts.showArchived && !p.archived) return false;
    const v = opts.verdict ?? "all";
    if (v === "unrated" && p.verdict) return false;
    if (v !== "all" && v !== "unrated" && p.verdict !== v) return false;
    const st = opts.stage ?? "all";
    if (st !== "all" && !p.routes.some((r) => r.stage === st)) return false;
    if (!q) return true;
    const hay = [p.name, p.city, p.scope, ...p.routes.flatMap((r) => [r.contractor, r.trade_scope, r.contact_name])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function sortProjects(projects: Project[], key: SortKey): Project[] {
  const copy = [...projects];
  if (key === "newest") {
    copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
  } else {
    // Soonest deadline first; no deadline sinks to the bottom.
    copy.sort((a, b) => {
      if (!a.deadline && !b.deadline) return a.name.localeCompare(b.name);
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline.localeCompare(b.deadline);
    });
  }
  return copy;
}

/* ---------- Dates ---------- */

export function daysUntil(dateISO: string | null, today: Date = new Date()): number | null {
  if (!dateISO) return null;
  const [y, m, d] = dateISO.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - t) / 86400000);
}

export function deadlineLabel(dateISO: string | null, today: Date = new Date()): string {
  if (!dateISO) return "No deadline";
  const n = daysUntil(dateISO, today) as number;
  const [y, m, d] = dateISO.split("-").map(Number);
  const pretty = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  if (n < 0) return `Bid closed ${pretty}`;
  if (n === 0) return `Bids due today (${pretty})`;
  if (n === 1) return `Bids due tomorrow (${pretty})`;
  return `Bids due ${pretty} · ${n} days`;
}

/* ---------- Export ---------- */

function csvCell(v: unknown): string {
  if (v == null) return "";
  let s = String(v);
  // Neutralize spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per bid route; project columns repeat but revenue is flagged as per-project. */
export function toCSV(projects: Project[]): string {
  const header = [
    "project", "city", "kind", "deadline", "verdict", "confirmed_project_value", "contractor",
    "trade_scope", "stage", "original_ad_url", "source_url", "link_status", "date_posted",
    "date_checked", "how_to_reply", "contact_name", "phone", "email", "verification_note", "bid_status",
  ];
  const rows = [header.join(",")];
  for (const p of projects) {
    const routes = p.routes.length ? p.routes : [null];
    routes.forEach((r, i) => {
      const ls = r ? linkState(r) : { kind: "unverified" as const };
      rows.push(
        [
          p.name, p.city, p.kind, p.deadline, p.verdict,
          i === 0 ? displayValue(p) ?? "" : "(same project)",
          r?.contractor, r?.trade_scope, r?.stage, r?.original_ad_url, r?.source_url,
          ls.kind === "original" ? "original" : "UNVERIFIED",
          r?.date_posted, r?.date_checked, r?.how_to_reply, r?.contact_name, r?.phone, r?.email,
          r?.verification_note, r?.bid_status,
        ].map(csvCell).join(",")
      );
    });
  }
  return rows.join("\n");
}
