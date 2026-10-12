"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/store";

export default function Callback() {
  const [msg, setMsg] = useState("Signing you in...");
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const sb = supabase();
    if (!sb) { setMsg("Sign-in is not configured."); return; }
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (url.searchParams.has("error")) {
      setMsg("Supabase could not verify that link. Request a new email.");
      return;
    }
    void (async () => {
      try {
        // The Supabase browser client may have already processed the URL.
        const existing = await sb.auth.getSession();
        if (existing.data.session) { window.location.replace("/"); return; }
        if (!code) {
          setMsg("No sign-in code found. Request a fresh email or use the six-digit code.");
          return;
        }
        const { error } = await sb.auth.exchangeCodeForSession(code);
        if (error) {
          const after = await sb.auth.getSession();
          if (after.data.session) { window.location.replace("/"); return; }
          setMsg("Could not complete this sign-in link. Open it in the same browser or use the email code.");
          return;
        }
        window.location.replace("/");
      } catch {
        setMsg("Could not complete sign-in. Try the six-digit code on the login page.");
      }
    })();
  }, []);
  return (
    <main className="login">
      <p className="banner" role="status">{msg}</p>
      <a className="act" href="/login">Back to sign in</a>
    </main>
  );
}
