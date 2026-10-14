"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/store";

const PREFS = "presser.signin.prefs.v1";
const PENDING = "presser.signin.pending.v1";

function explain(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Email or password doesn't match. Check the temporary password Michael gave you.";
  if (/rate|too many|seconds|security purposes/i.test(message)) return "Too many tries. Wait a minute, then try again.";
  if (/not allowed|signups not allowed|not found|user not found/i.test(message)) return "That email isn't on this board. Ask Michael to add you.";
  if (/fetch|network/i.test(message)) return "No connection. Check your signal and try again.";
  return "Couldn't sign in. Please try again.";
}

export default function Login() {
  const sb = supabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    try {
      const prefs = JSON.parse(localStorage.getItem(PREFS) || "{}");
      if (typeof prefs.email === "string") setEmail(prefs.email);
      localStorage.removeItem(PENDING);
    } catch { /* Storage is optional. */ }
  }, []);

  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sb || busy) return;
    const addr = email.trim().toLowerCase();
    setBusy(true);
    setErr("");
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email: addr, password });
      if (error || !data.session) { setErr(explain(error?.message || "Invalid login credentials")); return; }
      try { localStorage.setItem(PREFS, JSON.stringify({ email: addr, method: "password" })); } catch { /* Optional. */ }
      window.location.replace("/");
    } catch { setErr("No connection. Check your signal and try again."); }
    finally { setBusy(false); }
  }

  return (
    <main className="login">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-icon" src="/icon.svg" alt="" width={132} height={132} />
      <h1 className="title">Project Presser</h1>
      <p className="motto">Back to the fun</p>
      {!sb ? (
        <p className="banner">Not connected to a database yet. Open the home page to see the preview.</p>
      ) : (
        <form onSubmit={signIn}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" inputMode="email" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="password">Temporary password</label>
          <input id="password" type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          {err && <p className="banner" role="alert">{err}</p>}
          <p className="hint">After signing in, use <strong>Set password</strong> on the board to choose your own password.</p>
        </form>
      )}
    </main>
  );
}
