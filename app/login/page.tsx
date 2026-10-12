"use client";
import { useState } from "react";
import { supabase } from "../../lib/store";

export default function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState("");
  const sb = supabase();

  return (
    <main className="login">
      <h1 className="title">Brendan&apos;s Lead Board</h1>
      <p className="motto">Back to the fun</p>
      {!sb ? (
        <p className="banner">Not connected to a database yet. Open the home page to see the preview.</p>
      ) : state === "sent" ? (
        <p className="banner" role="status">
          Check {email} for a sign-in link. Open it on this phone.
        </p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setState("sending");
            const { error } = await sb.auth.signInWithOtp({
              email: email.trim(),
              options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: false },
            });
            if (error) {
              setErr(/not allowed|signups not allowed|not found/i.test(error.message) ? "That email isn't on this board. Ask Michael." : error.message);
              setState("error");
            } else setState("sent");
          }}
        >
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="primary" type="submit" disabled={state === "sending"}>
            {state === "sending" ? "Sending…" : "Email me a sign-in link"}
          </button>
          {state === "error" && <p className="banner" role="alert">{err}</p>}
        </form>
      )}
    </main>
  );
}
