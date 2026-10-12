"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/store";

export default function Callback() {
  const [msg, setMsg] = useState("Signing you in…");
  useEffect(() => {
    const sb = supabase();
    const code = new URLSearchParams(window.location.search).get("code");
    if (!sb || !code) {
      setMsg("That sign-in link is incomplete. Request a new one.");
      return;
    }
    sb.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) setMsg("That link expired or was already used. Request a new one.");
      else window.location.replace("/");
    });
  }, []);
  return (
    <main className="login">
      <p className="banner" role="status">{msg}</p>
      <a className="act" href="/login">Back to sign in</a>
    </main>
  );
}
