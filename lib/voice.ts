/** Voice-note helpers that don't touch the browser, so they can be tested. */

export const MAX_SECONDS = { note: 180, debrief: 180, test: 1800 } as const;

/** First format this browser can record. iPhone Safari records audio/mp4; Chrome and Android record webm. */
export function pickMimeType(isSupported: (t: string) => boolean): string | null {
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/aac", "audio/ogg;codecs=opus"]) {
    try {
      if (isSupported(t)) return t;
    } catch {
      /* some browsers throw on unknown types */
    }
  }
  return null;
}

/** "audio/webm;codecs=opus" → "audio/webm" (what the bucket allows). */
export function baseMime(t: string): string {
  return t.split(";")[0]!.trim().toLowerCase();
}

export function extFor(t: string): string {
  const b = baseMime(t);
  return b === "audio/mp4" ? "m4a" : b === "audio/aac" ? "aac" : b === "audio/ogg" ? "ogg" : b === "audio/mpeg" ? "mp3" : b === "audio/wav" ? "wav" : "webm";
}

export function voicePath(userId: string, kind: string, mime: string, now = new Date(), rand = Math.random()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `${userId}/${kind}-${stamp}-${Math.floor(rand * 1e6).toString(36)}.${extFor(mime)}`;
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Plain-English message for a microphone error. */
export function micError(e: unknown): string {
  const name = (e as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "The microphone is blocked. Allow it for this site in your browser settings, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone found on this device.";
  if (name === "NotReadableError") return "Another app is using the microphone. Close it and try again.";
  return "Couldn't start recording on this device.";
}
