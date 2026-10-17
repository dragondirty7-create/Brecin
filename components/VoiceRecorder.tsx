"use client";
import { useEffect, useRef, useState } from "react";
import { clock, MAX_SECONDS, micError, pickMimeType } from "../lib/voice";
import type { VoiceKind } from "../lib/types";

interface Props {
  kind: VoiceKind;
  /** Button text when idle. */
  startLabel?: string;
  /** Called with the finished clip. Return true once it's saved. */
  onSave: (clip: { blob: Blob; mime: string; duration_s: number; consent: boolean; label: string | null }) => Promise<boolean>;
  /** Ask for a short title (used for test sessions). */
  askLabel?: boolean;
}

type Phase =
  | { k: "idle" }
  | { k: "recording"; started: number }
  | { k: "review"; blob: Blob; mime: string; seconds: number; url: string }
  | { k: "saving"; blob: Blob; mime: string; seconds: number; url: string };

/**
 * Record → listen back → save or throw away. Nothing leaves the phone until
 * "Save recording" is tapped, and it can't be saved without the consent box.
 */
export default function VoiceRecorder({ kind, startLabel = "Record voice note", onSave, askLabel = false }: Props) {
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const [consent, setConsent] = useState(false);
  const [label, setLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const limit = MAX_SECONDS[kind];

  const releaseMic = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  useEffect(() => () => {
    releaseMic();
    if (phase.k === "review" || phase.k === "saving") URL.revokeObjectURL(phase.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Timer and auto-stop at the limit.
  useEffect(() => {
    if (phase.k !== "recording") return;
    const t = setInterval(() => {
      const s = (Date.now() - phase.started) / 1000;
      setNow(s);
      if (s >= limit) stop();
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function start() {
    setErr(null);
    if (!consent) {
      setErr("Tick the box first: everyone who'll be heard has to agree.");
      return;
    }
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErr("This browser can't record audio. Try Safari on iPhone or Chrome on Android.");
      return;
    }
    const mime = pickMimeType((t) => MediaRecorder.isTypeSupported(t));
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      setErr(micError(e));
      return;
    }
    const r = mime ? new MediaRecorder(stream.current, { mimeType: mime }) : new MediaRecorder(stream.current);
    chunks.current = [];
    const started = Date.now();
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    r.onstop = () => {
      releaseMic();
      const type = r.mimeType || mime || "audio/webm";
      const blob = new Blob(chunks.current, { type });
      const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
      if (!blob.size) {
        setErr("Nothing was recorded. Try again.");
        setPhase({ k: "idle" });
        return;
      }
      setPhase({ k: "review", blob, mime: type, seconds, url: URL.createObjectURL(blob) });
    };
    rec.current = r;
    r.start(1000);
    setNow(0);
    setPhase({ k: "recording", started });
  }

  function stop() {
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
  }

  function discard() {
    if (phase.k === "review") URL.revokeObjectURL(phase.url);
    setPhase({ k: "idle" });
    setErr(null);
  }

  async function save() {
    if (phase.k !== "review") return;
    setPhase({ ...phase, k: "saving" });
    const ok = await onSave({ blob: phase.blob, mime: phase.mime, duration_s: phase.seconds, consent, label: askLabel ? label : null });
    if (ok) {
      URL.revokeObjectURL(phase.url);
      setPhase({ k: "idle" });
      setLabel("");
    } else {
      // Keep the clip so nothing is lost; they can try saving again.
      setPhase({ ...phase, k: "review" });
    }
  }

  return (
    <div className="voice" data-phase={phase.k}>
      {phase.k === "idle" && (
        <>
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{kind === "test" ? "Everyone being recorded knows and said OK" : "It's just me, or everyone heard said OK"}</span>
          </label>
          <button type="button" className="rec-btn" onClick={start} aria-label={startLabel}>
            <span className="rec-dot" aria-hidden="true" /> {startLabel}
          </button>
        </>
      )}

      {phase.k === "recording" && (
        <div className="rec-live" role="status" aria-live="polite">
          <span className="rec-dot on" aria-hidden="true" />
          <span className="rec-time">Recording {clock(now)}</span>
          <span className="rec-limit">max {clock(limit)}</span>
          <button type="button" className="primary" onClick={stop}>
            Stop
          </button>
        </div>
      )}

      {(phase.k === "review" || phase.k === "saving") && (
        <div className="rec-review">
          <audio controls src={phase.url} preload="metadata" />
          <p className="meta">{clock(phase.seconds)} recorded. Listen back, then save or throw it away.</p>
          {askLabel && (
            <>
              <label className="sr" htmlFor={`vl-${kind}`}>What was tested</label>
              <input
                id={`vl-${kind}`}
                className="search"
                maxLength={200}
                placeholder="Who tested what (e.g. Brendan, rating 5 leads)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </>
          )}
          <div className="row">
            <button type="button" className="primary" onClick={save} disabled={phase.k === "saving"}>
              {phase.k === "saving" ? "Saving…" : "Save recording"}
            </button>
            <button type="button" className="ghost" onClick={discard} disabled={phase.k === "saving"}>
              Throw away
            </button>
          </div>
        </div>
      )}

      {err && (
        <p className="err-note" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
