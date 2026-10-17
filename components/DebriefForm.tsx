"use client";
import { useState } from "react";
import { ACCURACY, emptyDebrief, MORE, parseMoney, REASONS, validateDebrief } from "../lib/debrief";
import type { Debrief, DebriefInput, Outcome, Project, Reason, Route } from "../lib/types";
import VoiceRecorder from "./VoiceRecorder";

interface Props {
  project: Project;
  route: Route;
  outcome: Outcome;
  existing?: Debrief | null;
  onSave: (d: DebriefInput) => Promise<boolean>;
  /** Optional spoken answer instead of (or as well as) typing. */
  onVoice?: (clip: { blob: Blob; mime: string; duration_s: number; consent: boolean }) => Promise<boolean>;
  onCancel?: () => void;
}

/**
 * The 30-second interview after a job ends. Every question is optional, but at
 * least one has to be answered. Taps first, typing last.
 */
export default function DebriefForm({ project: p, route: r, outcome, existing, onSave, onVoice, onCancel }: Props) {
  const [d, setD] = useState<DebriefInput>(() =>
    existing
      ? {
          outcome,
          lead_accuracy: existing.lead_accuracy,
          reasons: existing.reasons,
          more_like_this: existing.more_like_this,
          real_value: existing.real_value,
          for_agents: existing.for_agents,
        }
      : emptyDebrief(outcome)
  );
  const [money, setMoney] = useState(existing?.real_value != null ? String(existing.real_value) : "");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const id = `db-${r.id}`;

  const toggleReason = (x: Reason) =>
    setD((s) => ({ ...s, reasons: s.reasons.includes(x) ? s.reasons.filter((y) => y !== x) : [...s.reasons, x] }));

  return (
    <form
      className="debrief"
      aria-labelledby={`${id}-h`}
      onSubmit={async (e) => {
        e.preventDefault();
        const value = parseMoney(money);
        const next = { ...d, outcome, real_value: value };
        const problem = validateDebrief(next);
        if (problem) {
          setErr(problem);
          return;
        }
        setErr(null);
        setSaving(true);
        const ok = await onSave(next);
        setSaving(false);
        if (!ok) setErr("Not saved yet. Your answers are still here; try again.");
      }}
    >
      <h3 id={`${id}-h`}>
        {outcome === "won" ? "🎉 Won" : "Lost"}: how did it go with {r.contractor}?
      </h3>
      <p className="meta">30 seconds. It teaches the agents which leads are worth chasing. Skip anything.</p>

      <fieldset>
        <legend>Was our lead info right?</legend>
        <div className="segmented">
          {ACCURACY.map((a) => (
            <button key={a.id} type="button" aria-pressed={d.lead_accuracy === a.id} onClick={() => setD((s) => ({ ...s, lead_accuracy: s.lead_accuracy === a.id ? null : a.id }))}>
              {a.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>{outcome === "won" ? "Why did we get it?" : "Why didn't we get it?"} (tap all that fit)</legend>
        <div className="chips">
          {REASONS.map((x) => (
            <button key={x.id} type="button" className="chip" aria-pressed={d.reasons.includes(x.id)} onClick={() => toggleReason(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Want more jobs like this?</legend>
        <div className="segmented">
          {MORE.map((m) => (
            <button key={m.id} type="button" aria-pressed={d.more_like_this === m.id} onClick={() => setD((s) => ({ ...s, more_like_this: s.more_like_this === m.id ? null : m.id }))}>
              {m.label}
            </button>
          ))}
        </div>
      </fieldset>

      {outcome === "won" && (
        <>
          <label htmlFor={`${id}-v`}>What was the job really worth? (optional)</label>
          <input id={`${id}-v`} className="search" inputMode="decimal" placeholder={p.est_value ? `We estimated $${p.est_value.toLocaleString("en-US")}` : "$"} value={money} onChange={(e) => setMoney(e.target.value)} />
        </>
      )}

      <label htmlFor={`${id}-t`}>Anything the agents should know?</label>
      <textarea
        id={`${id}-t`}
        maxLength={2000}
        placeholder="e.g. This GC always wants a site walk first. Skip bids under 2,000 sq ft."
        value={d.for_agents ?? ""}
        onChange={(e) => setD((s) => ({ ...s, for_agents: e.target.value }))}
      />

      {onVoice && (
        <details className="voice-answer">
          <summary>Rather say it out loud?</summary>
          <VoiceRecorder kind="debrief" startLabel="Record your answer" onSave={(c) => onVoice(c)} />
        </details>
      )}

      {err && (
        <p className="err-note" role="alert">
          {err}
        </p>
      )}
      <div className="row">
        <button className="primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : existing ? "Update debrief" : "Save debrief"}
        </button>
        {onCancel && (
          <button className="ghost" type="button" onClick={onCancel} disabled={saving}>
            Later
          </button>
        )}
      </div>
    </form>
  );
}
