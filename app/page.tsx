"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LeadCard from "../components/LeadCard";
import { counts, filterProjects, sortProjects, toCSV, type SortKey, type VerdictFilter } from "../lib/leads";
import { getStore, SaveError, supabase, type Store } from "../lib/store";
import type { LeadEvent, Note, Profile, Project, Route, Stage, Verdict } from "../lib/types";
import { STAGES } from "../lib/types";

type Toast = { kind: "ok" | "err" | "busy"; text: string } | null;

const FILTERS: { id: VerdictFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unrated", label: "Unrated" },
  { id: "good", label: "Good" },
  { id: "maybe", label: "Maybe" },
  { id: "bad", label: "Bad" },
];

export default function Board() {
  const storeRef = useRef<Store | null>(null);
  const [me, setMe] = useState<Profile | null | undefined>(undefined);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [q, setQ] = useState("");
  const [verdict, setVerdict] = useState<VerdictFilter>("all");
  const [stage, setStage] = useState<Stage | "all">("all");
  const [sort, setSort] = useState<SortKey>("deadline");
  const [archived, setArchived] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (t: Toast, ms = 2600) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    if (t && t.kind !== "busy") toastTimer.current = setTimeout(() => setToast(null), t.kind === "err" ? 6000 : ms);
  };

  const reload = useCallback(async () => {
    const store = storeRef.current!;
    try {
      const data = await store.load();
      setProjects(data.projects);
      setNotes(data.notes);
      setEvents(data.events);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Couldn't load leads.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const store = getStore();
    storeRef.current = store;
    let unsub = () => {};
    (async () => {
      if (store.mode === "live") {
        const { data } = await supabase()!.auth.getSession();
        if (!data.session) {
          window.location.replace("/login");
          return;
        }
      }
      const profile = await store.me();
      setMe(profile);
      if (!profile) {
        setLoading(false);
        return;
      }
      setPeople(await store.people());
      await reload();

      // Coalesce bursts: one rating fires two change events (lead + history),
      // and wake-ups can overlap with live events. Run at most one reload at a
      // time, plus one follow-up so the final state is always fresh.
      let inFlight = false;
      let pending = false;
      const refresh = async () => {
        if (inFlight) { pending = true; return; }
        inFlight = true;
        try {
          do { pending = false; await reload(); } while (pending);
        } finally {
          inFlight = false;
        }
      };

      // Catch up when the phone is unlocked, the app is brought back, or the
      // network returns. Live events missed while asleep are not replayed.
      const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
      const onShow = (e: PageTransitionEvent) => { if (e.persisted) refresh(); };
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("pageshow", onShow);
      window.addEventListener("online", refresh);

      const unsubLive = store.subscribe(() => { refresh(); });
      unsub = () => {
        unsubLive();
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("pageshow", onShow);
        window.removeEventListener("online", refresh);
      };
    })();
    return () => unsub();
  }, [reload]);

  /** Every write waits for the server. Success is shown only after it's saved. */
  async function save(key: string, label: string, fn: () => Promise<void>, celebrate = false) {
    setBusy(key);
    showToast({ kind: "busy", text: "Saving…" });
    try {
      await fn();
      await reload();
      showToast({ kind: "ok", text: celebrate ? `${label} Back to the fun!` : label });
      return true;
    } catch (e) {
      showToast({ kind: "err", text: e instanceof SaveError ? e.message : "Not saved. Something went wrong." });
      return false;
    } finally {
      setBusy(null);
    }
  }

  const onVerdict = (p: Project, v: Verdict | null) => {
    // Celebrate only when this rating clears the last unrated bid lead.
    const unratedBid = projects.filter((x) => x.kind === "bid" && !x.archived && !x.verdict);
    const finishesAll = v !== null && p.kind === "bid" && !p.verdict && unratedBid.length === 1;
    save(
      `verdict:${p.id}`,
      v ? `Saved: ${v.toUpperCase()}.` : "Rating cleared.",
      () => storeRef.current!.setVerdict(p.id, v),
      finishesAll
    );
  };
  const onStage = (r: Route, s: Stage) =>
    save(`stage:${r.id}`, `Stage saved: ${STAGES.find((x) => x.id === s)?.label}.`, () => storeRef.current!.setStage(r.id, s), s === "won");
  const onNote = (p: Project, body: string) => save(`note:${p.id}`, "Note saved.", () => storeRef.current!.addNote(p.id, body));
  const onArchive = (p: Project, a: boolean) =>
    save(`archive:${p.id}`, a ? "Archived." : "Restored.", () => storeRef.current!.setArchived(p.id, a));

  const visible = useMemo(
    () => sortProjects(filterProjects(projects, { q, verdict, stage, showArchived: archived }), sort),
    [projects, q, verdict, stage, archived, sort]
  );
  const c = counts(projects);

  function exportCSV() {
    const blob = new Blob([toCSV(visible)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `project-presser-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const mode = storeRef.current?.mode;

  return (
    <main className="wrap">
      <header className="top">
        <h1 className="title">Project Presser</h1>
        <p className="motto">Back to the fun</p>
        {me && (
          <p className="stats">
            {c.projects} projects · {c.routes} bid routes · {c.unrated} to rate
          </p>
        )}
        {me && mode === "live" && (
          <div className="who">
            Signed in as {me.display_name} ({me.role === "admin" ? "can edit" : "reviewer"})
            <button className="link-btn" onClick={async () => { await storeRef.current!.signOut(); window.location.replace("/login"); }}>
              Sign out
            </button>
          </div>
        )}
      </header>

      {mode === "preview" && (
        <p className="banner" role="status">
          Preview mode. Not connected to the database, so nothing you tap is saved. See README to connect Supabase.
        </p>
      )}

      {me === null && !loading && (
        <p className="banner" role="alert">
          You&apos;re signed in, but not on this board yet. Ask Michael to add you.
        </p>
      )}

      {loadErr && (
        <p className="banner" role="alert">
          {loadErr}{" "}
          <button className="link-btn" onClick={() => reload()}>
            Try again
          </button>
        </p>
      )}

      {me && (
        <>
          <div className="tools">
            <label className="sr" htmlFor="search">Search leads</label>
            <input id="search" className="search" type="search" placeholder="Search project, city, GC…" value={q} onChange={(e) => setQ(e.target.value)} />
            <details className="filters">
              <summary>
                Sort &amp; filter
                {(verdict !== "all" || stage !== "all" || archived || sort !== "deadline") && <span className="dot"> · on</span>}
              </summary>
            <div className="chips" role="group" aria-label="Filter by rating">
              {FILTERS.map((f) => (
                <button key={f.id} className="chip" aria-pressed={verdict === f.id} onClick={() => setVerdict(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="row">
              <label className="sr" htmlFor="sort">Sort</label>
              <select id="sort" className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="deadline">Soonest deadline</option>
                <option value="newest">Newest added</option>
              </select>
              <label className="sr" htmlFor="stagef">Stage</label>
              <select id="stagef" className="select" value={stage} onChange={(e) => setStage(e.target.value as Stage | "all")}>
                <option value="all">Any stage</option>
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              <button className="ghost" aria-pressed={archived} onClick={() => setArchived((a) => !a)}>
                {archived ? "Show active" : "Archived"}
              </button>
              {me.role === "admin" && (
                <button className="ghost" onClick={exportCSV}>Export CSV</button>
              )}
            </div>
            </details>
          </div>

          {loading ? (
            <p className="empty">Loading leads…</p>
          ) : visible.length === 0 ? (
            <p className="empty">{archived ? "No archived leads." : "No leads match. Clear the search or filter."}</p>
          ) : (
            <div className="list">
              {visible.map((p) => (
                <LeadCard
                  key={p.id}
                  project={p}
                  notes={notes.filter((n) => n.project_id === p.id)}
                  events={events.filter((e) => e.project_id === p.id)}
                  people={people}
                  role={me.role}
                  busy={busy}
                  onVerdict={onVerdict}
                  onStage={onStage}
                  onNote={onNote}
                  onArchive={onArchive}
                />
              ))}
            </div>
          )}
        </>
      )}

      <div aria-live="polite" aria-atomic="true">
        {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
      </div>
    </main>
  );
}
