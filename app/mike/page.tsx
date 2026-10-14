"use client";

import Link from "next/link";
import SetPassword from "../../components/SetPassword";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/store";
import {
  MIKE_STAGES, safeSourceUrl, stageLabel, verificationLabel, visibleMikeLeads,
  type MikeLead, type MikeLeadStatus,
} from "../../lib/mike-leads";

export default function MikeLeadsPage() {
  const [leads, setLeads] = useState<MikeLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signedOut, setSignedOut] = useState(false);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<MikeLeadStatus | "all">("all");

  const reload = useCallback(async () => {
    const sb = supabase();
    if (!sb) {
      setError("This preview is not connected to Supabase. No private leads are available.");
      setLoading(false);
      return;
    }
    try {
      // getUser validates the current identity with the Auth server. Never use
      // a role label, display name, query parameter or user_metadata for access.
      const { data: identity, error: authError } = await sb.auth.getUser();
      if (authError || !identity.user) {
        setSignedOut(true);
        setLeads([]);
        setLoading(false);
        return;
      }
      setSignedOut(false);
      const { data, error: readError } = await sb.from("michael_revenue_leads")
        .select("id,owner_id,title,category,source_platform,source_url,posted_budget,proposed_price,lead_status,verification_status,verified_on,contact_route,research_notes,created_at,updated_at")
        .eq("owner_id", identity.user.id)
        .order("updated_at", { ascending: false });
      if (readError) throw readError;
      setLeads((data ?? []) as MikeLead[]);
      setError("");
    } catch {
      setLeads([]);
      setError("Couldn't load your leads. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const onVisible = () => { if (document.visibilityState === "visible") void reload(); };
    const onOnline = () => { void reload(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [reload]);

  const filtered = useMemo(() => visibleMikeLeads(leads, query, stage), [leads, query, stage]);

  return (
    <main className="wrap mike-board">
      <header className="top">
        <nav aria-label="Board navigation" className="mike-nav">
          <span>Project Presser</span>
          <span aria-current="page">Mike's Leads</span>
        </nav>
        <h1 className="title">Mike's Leads</h1>
        <p className="motto">Back to the fun</p>
        <p className="meta">Private creative gigs and client projects. Research is not outreach.</p>
        {!loading && !signedOut && !error && (
          <div className="who">
            <SetPassword />
            <button type="button" className="link-btn" onClick={async () => {
              const sb = supabase();
              if (sb) await sb.auth.signOut();
              window.location.replace("/login");
            }}>Sign out</button>
          </div>
        )}
      </header>

      {signedOut ? (
        <section className="empty" role="status">
          Sign in to see your private revenue leads. <Link href="/login">Sign in</Link>
        </section>
      ) : (
        <>
          {error && (
            <p className="banner" role="alert">{error} <button type="button" className="link-btn" onClick={() => { setLoading(true); void reload(); }}>Try again</button></p>
          )}
          {!error && (
            <>
              <p className="stats" aria-live="polite">
                {loading ? "Loading…" : `${leads.length} saved leads · ${leads.filter((x) => x.lead_status === "research").length} in research`}
              </p>
              <div className="tools">
                <label htmlFor="mike-search">Find a gig</label>
                <input id="mike-search" className="search" type="search" placeholder="Music, websites, camera setup…" value={query} onChange={(e) => setQuery(e.target.value)} />
                <label htmlFor="mike-stage">Pipeline stage</label>
                <select id="mike-stage" className="select" value={stage} onChange={(e) => setStage(e.target.value as MikeLeadStatus | "all")}>
                  <option value="all">All stages</option>
                  {MIKE_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              {loading ? <p className="empty" role="status">Loading your leads…</p> :
                filtered.length === 0 ? <p className="empty">No accessible leads match. Check your account or adjust the filters.</p> :
                <div className="list">
                  {filtered.map((lead) => {
                    const source = safeSourceUrl(lead.source_url);
                    return (
                      <article className="card mike-card" key={lead.id}>
                        <div className="mike-badges">
                          <span className="badge">{stageLabel(lead.lead_status)}</span>
                          <span className="badge">{lead.category}</span>
                        </div>
                        <h2>{lead.title}</h2>
                        <p className="meta">{lead.source_platform} · Saved {lead.created_at.slice(0, 10)}</p>
                        <p className="caveat">{verificationLabel(lead.verification_status)}{lead.verified_on ? ` · Checked ${lead.verified_on}` : ""}</p>
                        <dl className="mike-facts">
                          <div><dt>Buyer budget</dt><dd>{lead.posted_budget || "Not stated"}</dd></div>
                          <div><dt>Our proposed price</dt><dd>{lead.proposed_price || "Not proposed"}</dd></div>
                          <div><dt>Contact route</dt><dd>{lead.contact_route || "Not verified"}</dd></div>
                        </dl>
                        {lead.research_notes && <details className="more"><summary>Evidence and next steps</summary><p className="mike-notes">{lead.research_notes}</p></details>}
                        {source && <a className="act mike-source" href={source} target="_blank" rel="noopener noreferrer">Open original source <span aria-hidden="true">↗</span></a>}
                        {!source && <p className="meta">No safe source link saved.</p>}
                      </article>
                    );
                  })}
                </div>
              }
              <p className="meta mike-footer">Read-only pilot. No bids, messages, payments or statuses change here. Current listings must be rechecked before contacting buyers.</p>
            </>
          )}
        </>
      )}
    </main>
  );
}
