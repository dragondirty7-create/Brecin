"use client";
import { useState } from "react";
import { supabase } from "../lib/store";

/** Lets a signed-in person set a password, so next time they can skip the email code. */
export default function SetPassword() {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const sb = supabase();
  if (!sb) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { setMsg({ ok: false, text: "Use at least 8 characters." }); return; }
    setBusy(true); setMsg(null);
    const { error } = await sb!.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: `Password not saved. ${error.message}` }); return; }
    try {
      const prefs = JSON.parse(localStorage.getItem("presser.signin.prefs.v1") || "{}");
      localStorage.setItem("presser.signin.prefs.v1", JSON.stringify({ ...prefs, method: "password" }));
    } catch { /* storage blocked */ }
    setPw(""); setOpen(false);
    setMsg({ ok: true, text: "Password saved. Next time, choose Password on the sign-in screen." });
  }

  return (
    <span className="set-password">
      {!open && <button className="link-btn" onClick={() => { setOpen(true); setMsg(null); }}>Set password</button>}
      {open && (
        <form onSubmit={save} className="set-password-form">
          <label htmlFor="new-password" className="sr">New password</label>
          <input id="new-password" type="password" autoComplete="new-password" placeholder="New password (8+ characters)"
            value={pw} onChange={(e) => setPw(e.target.value)} />
          <button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          <button type="button" className="link-btn" onClick={() => setOpen(false)}>Cancel</button>
        </form>
      )}
      {msg && <span role="status" className={msg.ok ? "ok-note" : "err-note"}>{msg.text}</span>}
    </span>
  );
}
