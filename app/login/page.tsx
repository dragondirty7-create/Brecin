"use client";
import { useState } from "react";
import { supabase } from "../../lib/store";

export default function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "verifying" | "error">("idle");
  const [err, setErr] = useState("");
  const sb = supabase();

  return (
    <main className="login">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-mark" src="/brand/presser-mark.svg" alt="" width={84} height={192} />
      <h1 className="title">Project Presser</h1>
      <p className="motto">Back to the fun</p>
      {!sb ? (
        <p className="banner">Not connected to a database yet. Open the home page to see the preview.</p>
      ) : state === "sent" || state === "verifying" ? (
        <>
          <p className="banner" role="status">
            Check {email} for your sign-in email. If it includes a six-digit code, enter it here.
            This works even if your email opens in another browser.
          </p>
          <form onSubmit={async (e) => {
            e.preventDefault();
            setErr("");
            setState("verifying");
            const { data, error } = await sb.auth.verifyOtp({
              email: email.trim(), token: code.trim(), type: "email",
            });
            if (error || !data.session) {
              setErr("Code not accepted. Use the newest six-digit code or request a fresh email.");
              setState("sent");
              return;
            }
            window.location.replace("/");
          }}>
            <label htmlFor="code">Six-digit email code</label>
            <input id="code" type="text" inputMode="numeric" autoComplete="one-time-code"
              maxLength={6} pattern="[0-9]{6}" required value={code}
              onChange={(e) => setCode(e.target.value)} />
            <button className="primary" type="submit" disabled={state === "verifying"}>
              {state === "verifying" ? "Checking..." : "Sign in with code"}
            </button>
            {err && <p className="banner" role="alert">{err}</p>}
          </form>
          <p>If the email has only a link, open it in the same browser you used to request it.</p>
          <a className="act" href="/login">Request a fresh email</a>
        </>
      ) : (
        <form onSubmit={async (e) => {
          e.preventDefault();
          setState("sending");
          setErr("");
          const { error } = await sb.auth.signInWithOtp({
            email: email.trim(),
            options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: false },
          });
          if (error) {
            setErr(/not allowed|signups not allowed|not found/i.test(error.message)
              ? "That email isn't on this board. Ask Michael." : error.message);
            setState("error");
          } else {
            setState("sent");
          }
        }}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" inputMode="email"
            required value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="primary" type="submit" disabled={state === "sending"}>
            {state === "sending" ? "Sending..." : "Email me a sign-in link or code"}
          </button>
          {state === "error" && <p className="banner" role="alert">{err}</p>}
        </form>
      )}
    </main>
  );
}
