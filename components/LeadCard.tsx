"use client";
import { useState } from "react";
import type { Debrief, DebriefInput, LeadEvent, Note, Profile, Project, Route, Stage, Verdict, VoiceKind, VoiceNote } from "../lib/types";
import { STAGES } from "../lib/types";
import { can, daysUntil, deadlineLabel, displayValue, linkState, mailHref, telHref } from "../lib/leads";
import { ACCURACY, isDone, MORE, needsDebrief } from "../lib/debrief";
import DebriefForm from "./DebriefForm";
import VoiceList from "./VoiceList";
import VoiceRecorder from "./VoiceRecorder";

export type Clip = { blob: Blob; mime: string; duration_s: number; consent: boolean; label?: string | null };

const VERDICTS: { id: Verdict; label: string }[] = [
  { id: "good", label: "GOOD" },
  { id: "maybe", label: "MAYBE" },
  { id: "bad", label: "BAD" },
];

const KIND_BADGE: Record<string, string | null> = {
  bid: null,
  residential_research: "RESEARCH · UNVERIFIED",
  partner: "POTENTIAL PARTNER · NOT A JOB",
};

function when(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

interface Props {
  project: Project;
  notes: Note[];
  events: LeadEvent[];
  people: Record<string, Profile>;
  role: Profile["role"] | null;
  busy: string | null;
  onVerdict: (p: Project, v: Verdict | null) => void;
  onStage: (r: Route, s: Stage) => void;
  onNote: (p: Project, body: string) => Promise<boolean>;
  onArchive: (p: Project, archived: boolean) => void;
  /* Debriefs and voice notes (optional so the demo page can leave them out). */
  me?: Profile | null;
  debriefs?: Debrief[];
  voice?: VoiceNote[];
  onDebrief?: (p: Project, r: Route, d: DebriefInput) => Promise<boolean>;
  onVoice?: (p: Project, r: Route | null, kind: VoiceKind, clip: Clip) => Promise<boolean>;
  voiceUrl?: (path: string) => Promise<string>;
  onDeleteVoice?: (v: VoiceNote) => void;
}

export default function LeadCard({
  project: p,
  notes,
  events,
  people,
  role,
  busy,
  onVerdict,
  onStage,
  onNote,
  onArchive,
  me = null,
  debriefs = [],
  voice = [],
  onDebrief,
  onVoice,
  voiceUrl,
  onDeleteVoice,
}: Props) {
  const [draft, setDraft] = useState("");
  const [later, setLater] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const due = onDebrief ? needsDebrief(p, debriefs, me?.id ?? null).filter((r) => !later.includes(r.id)) : [];
  const done = p.routes.filter((r) => isDone(r.stage) && debriefs.some((d) => d.route_id === r.id));
  const name = (id: string | null) => (id && people[id]?.display_name) || "Someone";
  const days = daysUntil(p.deadline);
  const value = displayValue(p);
  const badge = KIND_BADGE[p.kind];
  const verdictBusy = busy === `verdict:${p.id}`;

  return (
    <article className={`card ${p.verdict ? "v-" + p.verdict : ""}`} aria-labelledby={`h-${p.id}`}>
      {badge && <span className="badge">{badge}</span>}
      <h2 id={`h-${p.id}`}>{p.name}</h2>
      <p className="meta">
        {p.city ?? "City unknown"}
        {p.deadline && (
          <>
            {" · "}
            <span className={`due ${days !== null && days <= 3 ? "soon" : ""}`}>{deadlineLabel(p.deadline)}</span>
          </>
        )}
      </p>
      {p.scope && <p className="scope">{p.scope}</p>}
      {value && <p className="value">Confirmed value: {value}</p>}
      {p.value_note && <p className="caveat">{p.value_note}</p>}
      {p.routes.length > 1 && (
        <p className="fresh">
          One project, {p.routes.length} ways to bid it. Value counts once.
        </p>
      )}

      <div className="verdict" role="group" aria-label={`Rate ${p.name}`}>
        {VERDICTS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`vbtn ${v.id}`}
            aria-pressed={p.verdict === v.id}
            disabled={!can.setVerdict(role) || verdictBusy}
            onClick={() => onVerdict(p, p.verdict === v.id ? null : v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
      {p.verdict && p.verdict_at && (
        <p className="byline">
          Marked {p.verdict.toUpperCase()} by {name(p.verdict_by)} · {when(p.verdict_at)}
        </p>
      )}

      {p.routes.length > 0 && (
        <>
          <p className="routes-h">{p.routes.length > 1 ? "Bid routes" : p.kind === "partner" ? "Contact" : "Bid route"}</p>
          <div className="routes">
            {p.routes.map((r) => (
              <RouteBlock key={r.id} project={p} route={r} role={role} busy={busy === `stage:${r.id}`} onStage={onStage} />
            ))}
          </div>
        </>
      )}
      {p.kind === "bid" && <p className="fresh">Confirm it&apos;s still open before calling.</p>}

      {onDebrief &&
        due.map((r) => (
          <DebriefForm
            key={r.id}
            project={p}
            route={r}
            outcome={r.stage as "won" | "lost"}
            onSave={(d) => onDebrief(p, r, d)}
            onVoice={onVoice ? (c) => onVoice(p, r, "debrief", c) : undefined}
            onCancel={() => setLater((l) => [...l, r.id])}
          />
        ))}

      {done.map((r) => {
        const mine = debriefs.find((d) => d.route_id === r.id && d.author === me?.id);
        return (
          <div className="debrief-done" key={r.id}>
            {debriefs
              .filter((d) => d.route_id === r.id)
              .map((d) => (
                <p key={d.id} className="byline">
                  ✓ Debrief: {r.contractor} {d.outcome.toUpperCase()} · {name(d.author)} · lead info {ACCURACY.find((a) => a.id === d.lead_accuracy)?.label.toLowerCase() ?? "not rated"}
                  {d.more_like_this ? ` · ${MORE.find((m) => m.id === d.more_like_this)?.label.toLowerCase()}` : ""}
                  {d.for_agents ? ` · “${d.for_agents.length > 90 ? d.for_agents.slice(0, 89) + "…" : d.for_agents}”` : ""}
                </p>
              ))}
            {mine && onDebrief && isDone(r.stage) && (
              editing === r.id ? (
                <DebriefForm
                  project={p}
                  route={r}
                  outcome={r.stage as "won" | "lost"}
                  existing={mine}
                  onSave={async (d) => {
                    const ok = await onDebrief(p, r, d);
                    if (ok) setEditing(null);
                    return ok;
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <button type="button" className="link-btn" onClick={() => setEditing(r.id)}>
                  Edit my debrief
                </button>
              )
            )}
          </div>
        );
      })}

      <details className="more">
        <summary>
          Details &amp; notes{notes.length + voice.length ? ` (${notes.length + voice.length})` : ""}
        </summary>

        {p.routes.map((r) => (
          <dl className="facts" key={r.id}>
            {p.routes.length > 1 && (
              <>
                <dt>Route</dt>
                <dd>{r.contractor}</dd>
              </>
            )}
            <dt>How to reply</dt>
            <dd>{r.how_to_reply ?? "Unknown"}</dd>
            <dt>Original ad</dt>
            <dd>{r.original_ad_url ?? "UNVERIFIED"}</dd>
            {r.source_url && r.source_url !== r.original_ad_url && (
              <>
                <dt>Found at</dt>
                <dd>{r.source_url}</dd>
              </>
            )}
            <dt>Posted / checked</dt>
            <dd>
              {r.date_posted ?? "Posted date unknown"} / {r.date_checked ?? "never checked"}
            </dd>
            <dt>Bid status</dt>
            <dd>{r.bid_status ?? "Unknown"}</dd>
            {r.updated_at && (
              <>
                <dt>Stage last changed</dt>
                <dd>
                  {name(r.updated_by)} · {when(r.updated_at)}
                </dd>
              </>
            )}
          </dl>
        ))}
        {p.size && (
          <dl className="facts">
            <dt>Size</dt>
            <dd>{p.size}</dd>
          </dl>
        )}

        <ul className="notes" aria-label="Notes and history">
          {[...notes.map((n) => ({ t: n.created_at, k: "n" as const, n })), ...events.map((e) => ({ t: e.created_at, k: "e" as const, e }))]
            .sort((a, b) => a.t.localeCompare(b.t))
            .map((item) =>
              item.k === "n" ? (
                <li key={item.n.id}>
                  <span className="who-when">
                    {name(item.n.author)} · {when(item.n.created_at)}
                  </span>
                  {item.n.body}
                </li>
              ) : (
                <li key={item.e.id}>
                  <span className="who-when">
                    {name(item.e.author)} · {when(item.e.created_at)}
                  </span>
                  {describeEvent(item.e, p)}
                </li>
              )
            )}
        </ul>

        {voiceUrl && <VoiceList items={voice} people={people} me={me} getUrl={voiceUrl} onDelete={onDeleteVoice} />}

        {can.addNote(role) && onVoice && (
          <VoiceRecorder kind="note" onSave={(c) => onVoice(p, null, "note", c)} />
        )}

        {can.addNote(role) && (
          <form
            className="compose"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              const ok = await onNote(p, draft);
              if (ok) setDraft("");
            }}
          >
            <label className="sr" htmlFor={`note-${p.id}`}>
              Add a note to {p.name}
            </label>
            <textarea
              id={`note-${p.id}`}
              value={draft}
              maxLength={4000}
              placeholder="Add a note (who you talked to, what's next)"
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="primary" type="submit" disabled={!draft.trim() || busy === `note:${p.id}`}>
              {busy === `note:${p.id}` ? "Saving…" : "Save note"}
            </button>
          </form>
        )}

        {can.archive(role) && (
          <button type="button" className="ghost" style={{ marginTop: 10 }} onClick={() => onArchive(p, !p.archived)}>
            {p.archived ? "Restore lead" : "Archive lead"}
          </button>
        )}
      </details>
    </article>
  );
}

function describeEvent(e: LeadEvent, p: Project) {
  if (e.kind === "verdict") return e.to_value ? `Marked ${e.to_value.toUpperCase()}` : "Cleared rating";
  if (e.kind === "stage") {
    const route = p.routes.find((r) => r.id === e.route_id);
    const label = STAGES.find((s) => s.id === e.to_value)?.label ?? e.to_value;
    return `${route ? route.contractor + ": " : ""}stage → ${label}`;
  }
  if (e.kind === "archive") return e.to_value === "archived" ? "Archived" : "Restored";
  return "Edited";
}

function RouteBlock({
  project: p,
  route: r,
  role,
  busy,
  onStage,
}: {
  project: Project;
  route: Route;
  role: Profile["role"] | null;
  busy: boolean;
  onStage: (r: Route, s: Stage) => void;
}) {
  const ls = linkState(r);
  const contactOk = p.kind !== "residential_research";
  const tel = contactOk ? telHref(r.phone) : null;
  const mail = contactOk ? mailHref(r.email) : null;
  return (
    <section className="route" aria-label={r.contractor}>
      <h3>{r.contractor}</h3>
      {(r.trade_scope || r.contact_name) && (
        <p className="meta">{[r.trade_scope, r.contact_name && `Contact: ${r.contact_name}`].filter(Boolean).join(" · ")}</p>
      )}
      {r.verification_note && <p className="caveat">{r.verification_note}</p>}

      {ls.kind === "unverified" ? (
        <p className="unverified" role="note">
          ⚠ {ls.warning}
        </p>
      ) : ls.kind === "source_only" ? (
        <p className="unverified" role="note">
          ⚠ {ls.warning}
        </p>
      ) : null}

      <div className="actions">
        {ls.kind !== "unverified" && (
          <a className={`act ${ls.kind === "source_only" ? "secondary" : ""}`} href={ls.url} target="_blank" rel="noopener noreferrer">
            {ls.label}
          </a>
        )}
        {tel && (
          <a className="act secondary" href={tel}>
            Call {r.phone}
          </a>
        )}
        {mail && (
          <a className="act secondary" href={mail}>
            Email
          </a>
        )}
      </div>

      {p.kind !== "partner" && (
        <div className="stage">
          <label htmlFor={`stage-${r.id}`}>Follow-up stage{busy ? " (saving…)" : ""}</label>
          <select
            id={`stage-${r.id}`}
            className="select"
            value={r.stage}
            disabled={!can.setStage(role) || busy}
            onChange={(e) => onStage(r, e.target.value as Stage)}
          >
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </section>
  );
}
