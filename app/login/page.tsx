"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/store";

/*
 * Sign-in, built for phones:
 *  - Password (once you've set one) or a code by email.
 *  - "Waiting for a code" survives the app reloading while you check your mail
 *    (iPhone home-screen apps often reload when you switch away).
 *  - Send is held for a minute, so a second tap can't replace the code you're copying.
 *  - The code box takes 6 to 10 digits, pasted with or without spaces.
 *  - Errors say what actually went wrong.
 */
const PENDING = "presser.signin.pending.v1";   // { email, sentAt }
const PREFS = "presser.signin.prefs.v1";       // { email, method }
const CODE_TTL_MS = 60 * 60 * 1000;
const RESEND_MS = 60 * 1000;

type Method = "code" | "password";
type Pending = { email: string; sentAt: number };

function read<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
function write(key: string, value: unknown) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
}

function explain(message: string): string {
  // Most specific first: "Invalid login credentials" also contains "invalid".
  if (/invalid login credentials/i.test(message))
    return "Email or password doesn't match. If you haven't set a password yet, sign in with a code first, then tap Set password.";
  if (/expired|invalid|otp/i.test(message))
    return "That code didn't work. It may have expired, or a newer email replaced it. Use the code from the newest email, or send a new one.";
  if (/rate|too many|seconds|security purposes/i.test(message))
    return "Too many tries in a row. Wait a minute, then try again.";
  if (/not allowed|signups not allowed|not found|user not found/i.test(message))
    return "That email isn't on this board. Ask Michael to add you.";
  if (/fetch|network/i.test(message)) return "No connection. Check your signal and try again.";
  return message;
}

export default function Login() {
  const sb = supabase();
  const [method, setMethod] = useState<Method>("code");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(() => Date.now());

  // Restore where you were after a reload, and the method you used last time.
  useEffect(() => {
    const prefs = read<{ email?: string; method?: Method }>(PREFS);
    if (prefs?.email) setEmail(prefs.email);
    if (prefs?.method) setMethod(prefs.method);
    const p = read<Pending>(PENDING);
    if (p && Date.now() - p.sentAt < CODE_TTL_MS) { setPending(p); setEmail(p.email); setMethod("code"); }
    else write(PENDING, null);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pending]);

  const done = (m: Method) => {
    write(PENDING, null);
    write(PREFS, { email: email.trim().toLowerCase(), method: m });
    window.location.replace("/");
  };

  async function sendCode() {
    if (!sb) return;
    const addr = email.trim().toLowerCase();
    if (pending && pending.email === addr && Date.now() - pending.sentAt < RESEND_MS) return;
    setBusy(true); setErr("");
    const { error } = await sb.auth.signInWithOtp({
      email: addr,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm`, shouldCreateUser: false },
    });
    setBusy(false);
    if (error) { setErr(explain(error.message)); return; }
    const p = { email: addr, sentAt: Date.now() };
    write(PENDING, p); setPending(p); setCode(""); setNow(Date.now());
  }

  async function verifyCode() {
    if (!sb || !pending) return;
    const token = code.replace(/\D/g, "");
    if (token.length < 6) { setErr("Enter all the digits from the email."); return; }
    setBusy(true); setErr("");
    let { data, error } = await sb.auth.verifyOtp({ email: pending.email, token, type: "email" });
    if (error && /invalid|expired|otp/i.test(error.message)) {
      // Older auth servers file this code under "magiclink" for existing users.
      ({ data, error } = await sb.auth.verifyOtp({ email: pending.email, token, type: "magiclink" }));
    }
    setBusy(false);
    if (error || !data.session) { setErr(explain(error?.message ?? "invalid")); return; }
    done("code");
  }

  async function signInWithPassword() {
    if (!sb) return;
    setBusy(true); setErr("");
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (error || !data.session) { setErr(explain(error?.message ?? "Invalid login credentials")); return; }
    done("password");
  }

  const wait = pending ? Math.max(0, Math.ceil((RESEND_MS - (now - pending.sentAt)) / 1000)) : 0;

  return (
    <main className="login">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-icon" src="/icon.svg" alt="" width={132} height={132} />
      <h1 className="title">Project Presser</h1>
      <p className="motto">Back to the fun</p>

      {!sb ? (
        <p className="banner">Not connected to a database yet. Open the home page to see the preview.</p>
      ) : pending ? (
        <form onSubmit={(e) => { e.preventDefault(); void verifyCode(); }}>
          <p className="banner" role="status">
            We emailed <strong>{pending.email}</strong>. Easiest: tap the sign-in link in the newest email.
            Or paste the code from it here. It&apos;s fine if this screen reloads while you check your mail.
          </p>
          <label htmlFor="code">Code from the email</label>
          <input id="code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={14}
            autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="primary" type="submit" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
          {err && <p className="banner" role="alert">{err}</p>}
          <div className="login-row">
            <button type="button" className="link-btn" disabled={wait > 0 || busy} onClick={() => void sendCode()}>
              {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
            </button>
            <button type="button" className="link-btn" onClick={() => { write(PENDING, null); setPending(null); setErr(""); }}>
              Use a different email
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="segmented" role="tablist" aria-label="How to sign in">
            <button type="button" role="tab" aria-selected={method === "code"} onClick={() => { setMethod("code"); setErr(""); }}>Email me a code</button>
            <button type="button" role="tab" aria-selected={method === "password"} onClick={() => { setMethod("password"); setErr(""); }}>Password</button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void (method === "code" ? sendCode() : signInWithPassword()); }}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" inputMode="email" required
              value={email} onChange={(e) => setEmail(e.target.value)} />
            {method === "password" && (
              <>
                <label htmlFor="password">Password</label>
                <input id="password" type="password" autoComplete="current-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)} />
              </>
            )}
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "One moment…" : method === "code" ? "Email me a code" : "Sign in"}
            </button>
            {err && <p className="banner" role="alert">{err}</p>}
            {method === "password" && (
              <p className="hint">No password yet? Sign in with a code once, then tap <strong>Set password</strong> at the top of the board.</p>
            )}
          </form>
        </>
      )}
    </main>
  );
}
