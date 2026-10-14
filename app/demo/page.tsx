"use client";

import { useEffect, useMemo, useState } from "react";
import LeadCard from "../../components/LeadCard";
import { counts, filterProjects, sortProjects, type VerdictFilter } from "../../lib/leads";
import type { Note, Profile, Project, Route, Stage, Verdict } from "../../lib/types";

const STORAGE_KEY = "presser-demo-only-v1";
const DEMO_USER: Profile = { id: "demo-brendan", display_name: "Brendan (demo)", role: "reviewer" };

function sampleRoute(id: string, projectId: string, contractor: string, tradeScope: string): Route {
  return {
    id, project_id: projectId, contractor, trade_scope: tradeScope,
    source_url: null, original_ad_url: null, date_posted: null, date_checked: null,
    how_to_reply: "Demo only. There is no real solicitation.",
    contact_name: null, phone: null, email: null,
    verification_note: "SAMPLE DATA — not an actual bid or customer.",
    bid_status: null, stage: "new", updated_by: null, updated_at: null,
  };
}

function sampleProject(
  id: string, name: string, city: string, scope: string, deadline: string,
  routes: [string, string][]
): Project {
  return {
    id, name: "SAMPLE — " + name, city, kind: "bid", scope, size: null,
    deadline, est_value: null, value_confirmed: false,
    value_note: "Practice lead — not a real job.", verdict: null,
    verdict_by: null, verdict_at: null, archived: false,
    created_at: "2026-10-14T12:00:00Z",
    routes: routes.map(([contractor, tradeScope], i) =>
      sampleRoute(id + "-route-" + i, id, contractor, tradeScope)),
  };
}

const SAMPLE_PROJECTS: Project[] = [
  sampleProject("sample-a", "Townhome Framing", "San Marcos", "Review framing takeoff and bid route.", "2026-10-23",
    [["Example GC Alpha", "Wood framing"], ["Example GC Beta", "Rough carpentry"]]),
  sampleProject("sample-b", "Retail Buildout", "Vista", "Check schedule, crew capacity, and requirements.", "2026-10-27",
    [["Example GC Gamma", "Interior framing"]]),
  sampleProject("sample-c", "Home Addition", "Oceanside", "Review scope, drawings, and next steps.", "2026-11-02",
    [["Example GC Delta", "Addition and structural framing"]]),
];

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
        <p className="stats">{stats.projects} sample projects · {stats.unrated} to rate</p>
      </header>
      <p className="banner" role="status">
        <strong>Practice mode — no account needed.</strong> All projects and contractors here are invented.
        Ratings, stages, and notes save on this phone only. This is not your real board
        and changes will not sync to anyone else.
      </p>
      <p>Brendan: pick a lead, tap GOOD / MAYBE / BAD, change its stage, and add a note.</p>
      <div className="tools">
        <label className="sr" htmlFor="demo-search">Search sample leads</label>
        <input id="demo-search" className="search" type="search"
          placeholder="Search sample leads…" value={query}
          onChange={(e) => setQuery(e.target.value)} />
        <div className="chips" role="group" aria-label="Filter sample leads by rating">
          {FILTERS.map((f) => (
            <button key={f.id} className="chip" aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        <button type="button" className="ghost" onClick={() => {
          setProjects(SAMPLE_PROJECTS); setNotes([]); setQuery(""); setFilter("all");
          message("Sample leads reset on this phone.");
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
