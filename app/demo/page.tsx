"use client";

import { useEffect, useMemo, useState } from "react";
import LeadCard, { type Clip } from "../../components/LeadCard";
import VoiceList from "../../components/VoiceList";
import VoiceRecorder from "../../components/VoiceRecorder";
import seed from "../../data/seed.json";
import { counts, filterProjects, sortProjects, type VerdictFilter } from "../../lib/leads";
import type { Debrief, DebriefInput, Note, Profile, Project, Route, Stage, Verdict, VoiceKind, VoiceNote } from "../../lib/types";

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

type DemoState = { projects: Project[]; notes: Note[]; debriefs?: Debrief[] };
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
  const [debriefs, setDebriefs] = useState<Debrief[]>([]);
  // Demo recordings stay in this tab's memory only and vanish on reload.
  const [voice, setVoice] = useState<VoiceNote[]>([]);
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
          if (Array.isArray(saved.debriefs)) setDebriefs(saved.debriefs);
        }
      }
    } catch { /* storage disabled or corrupt; fresh demo is fine */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects, notes, debriefs })); }
    catch { /* private browsing might block local storage */ }
  }, [ready, projects, notes, debriefs]);

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

  async function saveDebrief(p: Project, r: Route, d: DebriefInput): Promise<boolean> {
    const when = new Date().toISOString();
    setDebriefs((all) => {
      const old = all.find((x) => x.route_id === r.id && x.author === DEMO_USER.id);
      const next: Debrief = { id: old?.id ?? "demo-d-" + Date.now(), project_id: p.id, route_id: r.id, author: DEMO_USER.id, ...d, for_agents: d.for_agents?.trim() || null, created_at: old?.created_at ?? when, updated_at: when };
      return [...all.filter((x) => x !== old), next];
    });
    message("Debrief saved on this phone only.");
    return true;
  }

  async function saveVoice(p: Project | null, r: Route | null, kind: VoiceKind, c: Clip): Promise<boolean> {
    if (!c.consent) return false;
    const url = URL.createObjectURL(c.blob);
    setVoice((all) => [...all, {
      id: "demo-v-" + Date.now(), project_id: p?.id ?? null, route_id: r?.id ?? null, kind,
      label: c.label?.trim() || null, path: url, mime: c.mime, duration_s: c.duration_s, consent: true,
      author: DEMO_USER.id, created_at: new Date().toISOString(),
    }]);
    message("Recording kept in this tab only. It disappears when you reload.");
    return true;
  }
  const demoUrl = async (path: string) => path;
  const deleteVoice = (v: VoiceNote) => { URL.revokeObjectURL(v.path); setVoice((all) => all.filter((x) => x.id !== v.id)); };

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
      <p>Brendan: try the familiar leads. Tap GOOD / MAYBE / BAD, change a stage, and add a note. Set a stage to Won or Lost to see the 30-second debrief.</p>
      <details className="test-session">
        <summary>🎙 Record a test session</summary>
        <p className="meta">Practice recorder: the recording stays in this tab and is never uploaded.</p>
        <VoiceRecorder kind="test" startLabel="Start recording" askLabel onSave={(c) => saveVoice(null, null, "test", c)} />
        <VoiceList items={voice.filter((v) => v.kind === "test")} people={people} me={DEMO_USER} getUrl={demoUrl} onDelete={deleteVoice} />
      </details>
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
          setProjects(SAMPLE_PROJECTS); setNotes([]); setDebriefs([]); setQuery(""); setFilter("all");
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
                onArchive={() => { /* Reviewer cannot archive, matching live permissions. */ }}
                me={DEMO_USER}
                debriefs={debriefs.filter((d) => d.project_id === p.id)}
                voice={voice.filter((v) => v.project_id === p.id)}
                onDebrief={saveDebrief}
                onVoice={saveVoice}
                voiceUrl={demoUrl}
                onDeleteVoice={deleteVoice} />
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
