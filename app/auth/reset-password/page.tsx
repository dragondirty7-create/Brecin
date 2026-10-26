"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/store";

type Phase = "checking" | "confirm-link" | "edit" | "saving" | "done" | "error";
type Link = { kind: "hash" | "code"; token: string } | null;

export default function ResetPassword() {
  const sb = supabase();
  const [phase, setPhase] = useState<Phase>("checking");
  const [link, setLink] = useState<Link>(null);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!sb) { setError("Sign-in is unavailable right now."); setPhase("error"); return; }
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type");
    const code = url.searchParams.get("code");
    if (token && type === "recovery") {
      setLink({ kind: "hash", token });
      setPhase("confirm-link"); // No token is consumed until an actual user clicks.
      return;
    }
    if (code) {
      setLink({ kind: "code", token: code });
      setPhase("confirm-link");
      return;
    }
    if (url.searchParams.has("error")) {
      setError("This reset link could not be opened. Request a new one.");
      setPhase("error");
      return;
    }
    // Supabase may have already redeemed an implicit-flow token from the URL fragment.
    void sb.auth.getUser().then(({ data }) => {
      if (data.user) setPhase("edit");
      else { setError("Open the reset link from your email, or request a fresh link."); setPhase("error"); }
    }).catch(() => { setError("Couldn't verify your sign-in. Try again."); setPhase("error"); });
  }, [sb]);

  async function confirmLink() {
    if (!sb || !link || phase !== "confirm-link") return;
    setPhase("checking");
    setError("");
    try {
      const result = link.kind === "hash"
        ? await sb.auth.verifyOtp({ token_hash: link.token, type: "recovery" })
        : await sb.auth.exchangeCodeForSession(link.token);
      if (result.error) throw result.error;
      // Never keep a one-time recovery credential in browser history after use.
      window.history.replaceState(null, "", window.location.pathname);
      setLink(null);
      setPhase("edit");
    } catch {
      setError("This link may be expired or already used. Request a new reset link.");
      setPhase("error");
    }
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sb || phase !== "edit") return;
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    if (password !== confirmation) { setError("Those passwords don't match."); return; }
    setPhase("saving");
    setError("");
    try {
      const { error: authError } = await sb.auth.updateUser({ password });
      if (authError) { setError(authError.message || "Password not saved. Try again."); setPhase("edit"); return; }
      setPassword("");
      setConfirmation("");
      setPhase("done");
    } catch {
      setError("Can't connect. Nothing was changed. Try again.");
      setPhase("edit");
    }
  }

  return (
    <main className="login">
      <h1 className="title">Project Presser</h1>
      <h2>Reset password</h2>
      {phase === "checking" && <p role="status">Checking your reset link…</p>}
      {phase === "confirm-link" && (
        <>
          <p>Tap below to verify your email link. It works even when an email app opens the link in a different browser.</p>
          <button className="primary" type="button" onClick={() => void confirmLink()}>
            Continue password reset
          </button>
        </>
      )}
      {(phase === "edit" || phase === "saving") && (
        <form onSubmit={save} aria-label="Choose a new password">
          <label htmlFor="new-password">New password</label>
          <div className="password-field">
            <input id="new-password" type={showPassword ? "text" : "password"}
              autoComplete="new-password" minLength={8} required value={password}
              onChange={e => setPassword(e.target.value)} />
            <button className="ghost" type="button" aria-pressed={showPassword}
              onClick={() => setShowPassword(v => !v)}>{showPassword ? "Hide" : "Show"}</button>
          </div>
          <label htmlFor="repeat-password">Confirm new password</label>
          <input id="repeat-password" type={showPassword ? "text" : "password"}
            autoComplete="new-password" minLength={8} required value={confirmation}
            onChange={e => setConfirmation(e.target.value)} />
          {error && <p className="banner" role="alert">{error}</p>}
          <button className="primary" type="submit" disabled={phase === "saving"}>
            {phase === "saving" ? "Saving…" : "Save new password"}
          </button>
        </form>
      )}
      {phase === "done" && (
        <>
          <p role="status">Your password has been updated. You can return to Presser.</p>
          <a className="act" href="/">Open my workspace</a>
        </>
      )}
      {phase === "error" && <p className="banner" role="alert">{error}</p>}
      <p><a className="link-btn" href="/login">Back to sign in</a></p>
    </main>
  );
}
