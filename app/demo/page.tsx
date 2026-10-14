"use client";

import { useEffect, useMemo, useState } from "react";
import LeadCard from "../../components/LeadCard";
import seed from "../../data/seed.json";
import { counts, filterProjects, sortProjects, type VerdictFilter } from "../../lib/leads";
import type { Note, Profile, Project, Route, Stage, Verdict } from "../../lib/types";

const STORAGE_KEY = "presser-demo-existing-leads-v2";
const DEMO_USER: Profile = { id: "demo-brendan", display_name: "Brendan (demo)", role: "reviewer" };

// Use the existing lead list as the test fixture, never the live database.
// Remove contact information and outside links from this anonymously accessible demo.
const SAMPLE_PROJECTS: Project[] = seed.projects.map((p) => ({
  ...p,
  verdict: null,
  verdict_by: null,
  verdict_at: null,
  archived: false,
  routes: p.routes.map((r) => ({
    ...r,
    project_id: p.id,
    source_url: null,
    original_ad_url: null,
    how_to_reply: "Sign in to the private board for real contact details.",
    contact_name: null,
    phone: null,
    email: null,
    verification_note: "DEMO — same lead, but private contact details are hidden.",
    stage: "new" as Stage,
    updated_by: null,
    updated_at: null,
  })),
})) as unknown as Project[];

type DemoState = { projects: Project[]; notes: Note[] };
const FILTERS: { id: VerdictFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unrated", label: "Unrated" },
  { id: "good", label: "Good" },
  { id: "maybe", label: "Maybe" },
  { id: "bad", label: "Bad" },
];

export default function NoLoginDemo() {
  const [projects, setProjects] = useState<Project[]>(SAMPLE_PROJECTS);
  const [notes, setNotes] = useState<Note[]>([]);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<VerdictFilter>("all");
  const [toast, setToast] = useState("");

  // Never call Supabase on this route. Demo data lives only in this browser.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved: DemoState = JSON.parse(raw);
        if (Array.isArray(saved.projects) && Array.isArray(saved.notes)) {
          setProjects(saved.projects);
          setNotes(saved.notes);
        }
      }
    } catch { /* storage disabled or corrupt; fresh demo is fine */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects, notes })); }
    catch { /* private browsing might block local storage */ }
  }, [ready, projects, notes]);

  function message(text: string) {
    setToast(text);
  }

  function rate(p: Project, verdict: Verdict | null) {
    const when = new Date().toISOString();
    setProjects((all) => all.map((x) => x.id === p.id
      ? { ...x, verdict, verdict_by: verdict ? DEMO_USER.id : null, verdict_at: verdict ? when : null }
      : x));
    message("Rating saved on this phone only.");
  }

  function setStage(r: Route, stage: Stage) {
    const when = new Date().toISOString();
    setProjects((all) => all.map((p) => ({
      ...p, routes: p.routes.map((x) => x.id === r.id
        ? { ...x, stage, updated_by: DEMO_USER.id, updated_at: when } : x),
    })));
    message("Stage saved on this phone only.");
  }

  async function addNote(p: Project, body: string): Promise<boolean> {
    if (!body.trim()) return false;
    setNotes((all) => [...all, {
      id: "demo-" + Date.now() + "-" + all.length,
      project_id: p.id, route_id: null, author: DEMO_USER.id,
      body: body.trim(), created_at: new Date().toISOString(),
    }]);
    message("Note saved on this phone only.");
    return true;
  }

  const visible = useMemo(
    () => sortProjects(filterProjects(projects, { q: query, verdict: filter }), "deadline"),
    [projects, query, filter]
  );
  const stats = counts(projects);
  const people = { [DEMO_USER.id]: DEMO_USER };

  return (
    <main className="wrap">
      <header className="top">
        <span className="badge">NO-LOGIN DEMO</span>
        <h1 className="title">Project Presser</h1>
        <p className="motto">Back to the fun</p>
        <p className="stats">{stats.projects} existing leads · {stats.unrated} to rate</p>
      </header>
      <p className="banner" role="status">
        <strong>Practice mode — no account needed.</strong> These are the existing Presser starter leads, with private contact details hidden.
        Ratings, stages, and notes save on this phone only. This is not the live shared board
        and changes will not sync to anyone else.
      </p>
      <p>Brendan: try the familiar leads. Tap GOOD / MAYBE / BAD, change a stage, and add a note.</p>
      <div className="tools">
        <label className="sr" htmlFor="demo-search">Search leads</label>
        <input id="demo-search" className="search" type="search"
          placeholder="Search leads…" value={query}
          onChange={(e) => setQuery(e.target.value)} />
        <div className="chips" role="group" aria-label="Filter sample leads by rating">
          {FILTERS.map((f) => (
            <button key={f.id} className="chip" aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        <button type="button" className="ghost" onClick={() => {
          setProjects(SAMPLE_PROJECTS); setNotes([]); setQuery(""); setFilter("all");
          message("Demo ratings and notes reset on this phone.");
        }}>Reset demo</button>
      </div>
      {!ready ? <p className="empty">Loading demo…</p> : visible.length === 0
        ? <p className="empty">No sample leads match this filter.</p>
        : <div className="list">
            {visible.map((p) => (
              <LeadCard key={p.id} project={p}
                notes={notes.filter((n) => n.project_id === p.id)}
                events={[]} people={people} role="reviewer" busy={null}
                onVerdict={rate} onStage={setStage} onNote={addNote}
                onArchive={() => { /* Reviewer cannot archive, matching live permissions. */ }} />
            ))}
          </div>}
      <div aria-live="polite" aria-atomic="true">
        {toast && <div className="toast ok" role="status" onClick={() => setToast("")}>
          {toast} (Tap to dismiss)
        </div>}
      </div>
    </main>
  );
}
