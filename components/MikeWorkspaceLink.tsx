"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/store";

/** Only show Mike's workspace entry to the owner of Mike's saved leads. */
export default function MikeWorkspaceLink() {
  const [hasLeads, setHasLeads] = useState(false);
  useEffect(() => {
    const client = supabase();
    if (!client) return;
    let mounted = true;
    (async () => {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (!mounted || authError || !auth.user) return;
      const { data, error } = await client.from("michael_revenue_leads")
        .select("id")
        .eq("owner_id", auth.user.id)
        .limit(1);
      if (mounted && !error) setHasLeads((data?.length ?? 0) > 0);
    })();
    return () => { mounted = false; };
  }, []);
  if (!hasLeads) return null;
  return <nav aria-label="Your Presser workspace" className="mike-nav">
    <Link className="act secondary" href="/mike">Open Mike's Leads →</Link>
  </nav>;
}
