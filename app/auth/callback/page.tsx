"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/store";
import { signedInLandingPath } from "../../../lib/workspace-route";

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
    // Newer email template sends token_hash links; hand those to /auth/confirm.
    if (url.searchParams.has("token_hash")) {
      window.location.replace(`/auth/confirm${url.search}`);
      return;
    }
    if (url.searchParams.has("error")) {
      setMsg("Supabase could not verify that link. Request a new email.");
      return;
    }
    const goToWorkspace = async () => {
      try {
        window.location.replace(await signedInLandingPath(sb));
      } catch {
        setMsg("Sign-in succeeded, but workspace routing could not be verified. Open your private board directly.");
      }
    };
    void (async () => {
      try {
        // The Supabase browser client may have already processed the URL.
        const existing = await sb.auth.getSession();
        if (existing.data.session) { await goToWorkspace(); return; }
        if (!code) {
          setMsg("No sign-in code found. Request a fresh email or use the six-digit code.");
          return;
        }
        const { error } = await sb.auth.exchangeCodeForSession(code);
        if (error) {
          const after = await sb.auth.getSession();
          if (after.data.session) { await goToWorkspace(); return; }
          setMsg("Could not complete this sign-in link. Open it in the same browser or use the email code.");
          return;
        }
        await goToWorkspace();
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
