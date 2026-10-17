"use client";
import { useState } from "react";
import { clock } from "../lib/voice";
import type { Profile, VoiceNote } from "../lib/types";

const KIND: Record<VoiceNote["kind"], string> = { note: "Voice note", debrief: "Spoken debrief", test: "Test session" };

interface Props {
  items: VoiceNote[];
  people: Record<string, Profile>;
  me: Profile | null;
  /** Gets a short-lived private link to play the file. */
  getUrl: (path: string) => Promise<string>;
  onDelete?: (v: VoiceNote) => void;
}

/** Recordings are private: the play link is fetched only when someone taps Play. */
export default function VoiceList({ items, people, me, getUrl, onDelete }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  if (!items.length) return null;

  return (
    <ul className="voice-list" aria-label="Recordings">
      {items.map((v) => (
        <li key={v.id}>
          <span className="who-when">
            {KIND[v.kind]} · {people[v.author]?.display_name ?? "Someone"} ·{" "}
            {new Date(v.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {clock(v.duration_s)}
          </span>
          {v.label && <span className="voice-label">{v.label}</span>}
          {urls[v.id] ? (
            <audio controls autoPlay src={urls[v.id]} preload="none" />
          ) : (
            <button
              type="button"
              className="ghost"
              onClick={async () => {
                setErr(null);
                try {
                  const u = await getUrl(v.path);
                  setUrls((m) => ({ ...m, [v.id]: u }));
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Couldn't open the recording.");
                }
              }}
            >
              ▶ Play
            </button>
          )}
          {onDelete && me && (me.id === v.author || me.role === "admin") && (
            <button type="button" className="link-btn" onClick={() => onDelete(v)}>
              Delete
            </button>
          )}
        </li>
      ))}
      {err && (
        <li className="err-note" role="alert">
          {err}
        </li>
      )}
    </ul>
  );
}
