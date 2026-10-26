"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/store";

const PREFS = "presser.signin.prefs.v1";
const PENDING = "presser.signin.pending.v1";

function friendlyError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Email or password not recognized. Try again or reset your password.";
  if (/rate|too many|seconds|security purposes/i.test(message)) return "Too many attempts. Try again in a few minutes.";
  if (/fetch|network|failed to fetch/i.test(message)) return "Can't connect right now. Check your signal and try again.";
  return "We couldn't finish that request. Please try again.";
}

export default function Login() {
  const sb = supabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"sign-in" | "reset">("sign-in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    try {
      const prefs = JSON.parse(localStorage.getItem(PREFS) || "{}");
      if (typeof prefs.email === "string") setEmail(prefs.email);
      localStorage.removeItem(PENDING);
    } catch { /* Browser storage is optional. */ }
  }, []);

  function switchMode(next: "sign-in" | "reset") {
    setMode(next);
    setError("");
    setResetSent(false);
  }

  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sb || busy) return;
    const addr = email.trim().toLowerCase();
    setBusy(true);
    setError("");
    try {
      const { data, error: authError } = await sb.auth.signInWithPassword({ email: addr, password });
      if (authError || !data.session) {
        setError(friendlyError(authError?.message || "Invalid login credentials"));
        return;
      }
      try { localStorage.setItem(PREFS, JSON.stringify({ email: addr, method: "password" })); }
      catch { /* Not required for sign-in. */ }
      window.location.replace("/");
    } catch {
      setError("Can't connect right now. Check your signal and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function requestReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sb || busy) return;
    setBusy(true);
    setError("");
    setResetSent(false);
    try {
      const addr = email.trim().toLowerCase();
      const { error: authError } = await sb.auth.resetPasswordForEmail(addr, {
        redirectTo: window.location.origin + "/auth/reset-password",
      });
      if (authError) {
        setError(friendlyError(authError.message));
        return;
      }
      setResetSent(true); // Keep identical wording regardless of whether this address exists.
    } catch {
      setError("Can't connect right now. Check your signal and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-icon" src="/icon.svg" alt="" width={112} height={112} />
      <h1 className="title">Project Presser</h1>
      <p className="motto">Back to the fun</p>
      {!sb ? (
        <p className="banner" role="status">The private board is unavailable. You can still explore the demonstration.</p>
      ) : mode === "sign-in" ? (
        <>
          <p>Welcome back. Sign in to your workspace.</p>
          <form onSubmit={signIn} aria-label="Sign in">
            <label htmlFor="email">Email address</label>
            <input id="email" name="email" type="email" autoComplete="username" inputMode="email"
              placeholder="you@example.com" required value={email} onChange={e => setEmail(e.target.value)} />
            <label htmlFor="password">Password</label>
            <div className="password-field">
              <input id="password" name="password" type={showPassword ? "text" : "password"}
                autoComplete="current-password" required value={password}
                onChange={e => setPassword(e.target.value)} />
              <button type="button" className="ghost" aria-pressed={showPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword(v => !v)}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {error && <p role="alert" className="banner">{error}</p>}
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <button className="link-btn" type="button" onClick={() => switchMode("reset")}>
              Forgot your password?
            </button>
          </form>
          <p className="hint">First visit? Use the temporary password provided by the board owner, then choose your own inside Presser.</p>
        </>
      ) : (
        <>
          <h2>Reset your password</h2>
          <p>Enter your account email. If it has access, we'll send a private reset link.</p>
          <form onSubmit={requestReset} aria-label="Reset password">
            <label htmlFor="reset-email">Email address</label>
            <input id="reset-email" name="email" type="email" autoComplete="email" inputMode="email"
              placeholder="you@example.com" required value={email} onChange={e => setEmail(e.target.value)} />
            {error && <p role="alert" className="banner">{error}</p>}
            {resetSent && <p role="status" className="banner">If this email has access to Presser, a reset link is on its way. Check your inbox and spam folder.</p>}
            <button className="primary" type="submit" disabled={busy || resetSent}>
              {busy ? "Sending…" : resetSent ? "Request sent" : "Send reset link"}
            </button>
            <button type="button" className="link-btn" onClick={() => switchMode("sign-in")}>
              Back to sign in
            </button>
          </form>
        </>
      )}
      <p className="login-demo"><a href="/demo">Explore the demo without signing in</a></p>
    </main>
  );
}
