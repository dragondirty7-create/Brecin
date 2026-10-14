"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/store";
import { signedInLandingPath } from "../../../lib/workspace-route";
import type { EmailOtpType } from "@supabase/supabase-js";

/*
 * Email sign-in link landing page (token_hash flow).
 *
 * Why this exists: the old link (PKCE) only works in the same browser that
 * asked for it, so tapping it inside the Gmail/Outlook app failed. And mail
 * scanners that "pre-click" links burned the one-time token, which is why the
 * six-digit code then said "expired". This page works in any browser, and it
 * does nothing until a person taps the button, so a scanner can't use it up.
 */
const TYPES: EmailOtpType[] = ["email", "magiclink", "invite", "signup", "recovery", "email_change"];

export default function Confirm() {
  const [state, setState] = useState<"ready" | "busy" | "bad" | "err">("ready");
  const [msg, setMsg] = useState("");
  const [params, setParams] = useState<{ token_hash: string; type: EmailOtpType } | null>(null);

  useEffect(() => {
    const u = new URL(window.location.href);
    const token_hash = u.searchParams.get("token_hash");
    const t = (u.searchParams.get("type") ?? "email") as EmailOtpType;
    if (!token_hash || !TYPES.includes(t)) { setState("bad"); return; }
    setParams({ token_hash, type: t });
  }, []);

  async function finish() {
    const sb = supabase();
    if (!sb || !params) return;
    setState("busy");
    const goToWorkspace = async () => {
      try {
        window.location.replace(await signedInLandingPath(sb));
      } catch {
        setState("err");
        setMsg("Signed in, but the workspace could not be verified. Open Mike's Leads directly.");
      }
    };
    let { error } = await sb.auth.verifyOtp(params);
    if (error && params.type === "email") ({ error } = await sb.auth.verifyOtp({ ...params, type: "magiclink" }));
    if (error) {
      const { data } = await sb.auth.getSession();
      if (data.session) { await goToWorkspace(); return; }
      setState("err");
      setMsg(/expired|invalid/i.test(error.message)
        ? "This link was already used or has expired. Send a new email from the sign-in screen and use the newest one."
        : error.message);
      return;
    }
    try { localStorage.removeItem("presser.signin.pending.v1"); } catch { /* storage blocked */ }
    await goToWorkspace();
  }

  return (
    <main className="login">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-icon" src="/icon.svg" alt="" width={132} height={132} />
      <h1 className="title">Project Presser</h1>
      {state === "bad" ? (
        <p className="banner" role="alert">This sign-in link is incomplete. Send a new email from the sign-in screen.</p>
      ) : (
        <button className="primary" type="button" disabled={!params || state === "busy"} onClick={() => void finish()}>
          {state === "busy" ? "Signing in…" : "Tap to finish signing in"}
        </button>
      )}
      {state === "err" && <p className="banner" role="alert">{msg}</p>}
      <a className="link-btn" href="/login">Back to sign in</a>
    </main>
  );
}
