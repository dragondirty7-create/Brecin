"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import seed from "../data/seed.json";
import type { Debrief, DebriefInput, LeadEvent, Note, Profile, Project, Route, Stage, Verdict, VoiceKind, VoiceNote } from "./types";
import { baseMime, voicePath } from "./voice";

/**
 * Data access. Two backends:
 *  - Supabase (real): shared, server-enforced permissions.
 *  - Preview: only when no Supabase keys are configured. Shows the seed data
 *    read-only so the layout can be reviewed. Every write FAILS with a clear
 *    message. It never pretends to save.
 */

export interface Store {
  mode: "live" | "preview";
  me(): Promise<Profile | null>;
  people(): Promise<Record<string, Profile>>;
  load(): Promise<{ projects: Project[]; notes: Note[]; events: LeadEvent[]; debriefs: Debrief[]; voice: VoiceNote[] }>;
  setVerdict(projectId: string, v: Verdict | null): Promise<void>;
  setStage(routeId: string, s: Stage): Promise<void>;
  setArchived(projectId: string, archived: boolean): Promise<void>;
  addNote(projectId: string, body: string, routeId?: string | null): Promise<void>;
  saveDebrief(projectId: string, routeId: string, d: DebriefInput): Promise<void>;
  saveVoice(v: { blob: Blob; mime: string; duration_s: number; kind: VoiceKind; project_id: string | null; route_id: string | null; label: string | null; consent: boolean }): Promise<void>;
  voiceUrl(path: string): Promise<string>;
  deleteVoice(v: VoiceNote): Promise<void>;
  subscribe(onChange: () => void): () => void;
  signOut(): Promise<void>;
}

export class SaveError extends Error {}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient | null {
  if (!URL_ || !KEY) return null;
  if (!client) client = createBrowserClient(URL_, KEY);
  return client;
}

export function getStore(): Store {
  const sb = supabase();
  return sb ? liveStore(sb) : previewStore();
}

function friendly(err: { message?: string; code?: string } | null, fallback: string): SaveError {
  if (!err) return new SaveError(fallback);
  if (err.code === "42501" || /permission|not a board member|only Michael/i.test(err.message ?? ""))
    return new SaveError("You don't have permission to do that.");
  if (/fetch|network|Failed to fetch/i.test(err.message ?? ""))
    return new SaveError("No connection. Nothing was saved. Try again when you have signal.");
  return new SaveError(`${fallback} (${err.message ?? "unknown error"})`);
}

function liveStore(sb: SupabaseClient): Store {
  return {
    mode: "live",
    async me() {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return null;
      const { data } = await sb.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      return (data as Profile) ?? null;
    },
    async people() {
      const { data } = await sb.from("profiles").select("*");
      return Object.fromEntries(((data as Profile[]) ?? []).map((p) => [p.id, p]));
    },
    async load() {
      const [pr, rt, nt, ev, db, vn] = await Promise.all([
        sb.from("projects").select("*"),
        sb.from("routes").select("*"),
        sb.from("notes").select("*").order("created_at", { ascending: true }),
        sb.from("events").select("*").order("created_at", { ascending: true }),
        sb.from("debriefs").select("*").order("created_at", { ascending: true }),
        sb.from("voice_notes").select("*").order("created_at", { ascending: true }),
      ]);
      const err = pr.error || rt.error || nt.error || ev.error;
      // Debriefs and voice notes arrive with the 2026-10-17 migration. Until it
      // has been run, the board keeps working without them.
      const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));
      if (db.error && !missing(db.error)) throw friendly(db.error, "Couldn't load debriefs");
      if (vn.error && !missing(vn.error)) throw friendly(vn.error, "Couldn't load voice notes");
      if (err) throw friendly(err, "Couldn't load leads");
      const routes = (rt.data as Route[]) ?? [];
      const projects = ((pr.data as Omit<Project, "routes">[]) ?? []).map((p) => ({
        ...p,
        routes: routes.filter((r) => r.project_id === p.id).sort((a, b) => a.contractor.localeCompare(b.contractor)),
      }));
      return {
        projects,
        notes: (nt.data as Note[]) ?? [],
        events: (ev.data as LeadEvent[]) ?? [],
        debriefs: (db.data as Debrief[]) ?? [],
        voice: (vn.data as VoiceNote[]) ?? [],
      };
    },
    async setVerdict(projectId, v) {
      const { error } = await sb.rpc("set_verdict", { p_project: projectId, p_verdict: v });
      if (error) throw friendly(error, "Verdict not saved");
    },
    async setStage(routeId, s) {
      const { error } = await sb.rpc("set_stage", { p_route: routeId, p_stage: s });
      if (error) throw friendly(error, "Stage not saved");
    },
    async setArchived(projectId, archived) {
      const { error } = await sb.rpc("set_archived", { p_project: projectId, p_archived: archived });
      if (error) throw friendly(error, "Archive not saved");
    },
    async addNote(projectId, body, routeId = null) {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) throw new SaveError("Signed out. Sign in again; nothing was saved.");
      const { error } = await sb
        .from("notes")
        .insert({ project_id: projectId, route_id: routeId, body: body.trim(), author: u.user.id });
      if (error) throw friendly(error, "Note not saved");
    },
    async saveDebrief(projectId, routeId, d) {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) throw new SaveError("Signed out. Sign in again; nothing was saved.");
      const { error } = await sb.from("debriefs").upsert(
        {
          project_id: projectId,
          route_id: routeId,
          author: u.user.id,
          ...d,
          for_agents: d.for_agents?.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "route_id,author" }
      );
      if (error) throw friendly(error, "Debrief not saved");
    },
    async saveVoice(v) {
      if (!v.consent) throw new SaveError("Not saved: confirm everyone on the recording agreed to it.");
      const { data: u } = await sb.auth.getUser();
      if (!u.user) throw new SaveError("Signed out. Sign in again; the recording was not saved.");
      const mime = baseMime(v.mime);
      const path = voicePath(u.user.id, v.kind, mime);
      const up = await sb.storage.from("voice-notes").upload(path, v.blob, { contentType: mime, upsert: false });
      if (up.error) throw friendly(up.error, "Recording not uploaded");
      const { error } = await sb.from("voice_notes").insert({
        project_id: v.project_id,
        route_id: v.route_id,
        kind: v.kind,
        label: v.label?.trim() || null,
        path,
        mime,
        duration_s: Math.max(1, Math.round(v.duration_s)),
        consent: true,
        author: u.user.id,
      });
      if (error) {
        // Don't leave an orphaned file behind.
        await sb.storage.from("voice-notes").remove([path]);
        throw friendly(error, "Recording not saved");
      }
    },
    async voiceUrl(path) {
      const { data, error } = await sb.storage.from("voice-notes").createSignedUrl(path, 60 * 60);
      if (error || !data) throw friendly(error, "Couldn't open the recording");
      return data.signedUrl;
    },
    async deleteVoice(v) {
      const { error } = await sb.from("voice_notes").delete().eq("id", v.id);
      if (error) throw friendly(error, "Recording not deleted");
      await sb.storage.from("voice-notes").remove([v.path]);
    },
    subscribe(onChange) {
      // Phones drop the live socket when locked or backgrounded. Changes made
      // while disconnected are never replayed, so every (re)connect after the
      // first triggers a catch-up reload.
      let connectedOnce = false;
      const ch = sb
        .channel("board")
        .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "routes" }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "events" }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "debriefs" }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "voice_notes" }, onChange)
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          if (connectedOnce) onChange();
          connectedOnce = true;
        });
      return () => {
        sb.removeChannel(ch);
      };
    },
    async signOut() {
      await sb.auth.signOut();
    },
  };
}

const PREVIEW_MSG = "Preview mode: not connected to the database. Nothing was saved.";

function previewStore(): Store {
  const me: Profile = { id: "preview", display_name: "Preview", role: "admin" };
  return {
    mode: "preview",
    async me() {
      return me;
    },
    async people() {
      return { preview: me };
    },
    async load() {
      const projects: Project[] = (seed.projects as unknown as (Omit<Project, "routes" | "verdict" | "verdict_by" | "verdict_at" | "archived"> & { routes: Omit<Route, "project_id" | "stage" | "updated_by" | "updated_at">[] })[]).map(
        (p) => ({
          ...p,
          verdict: null,
          verdict_by: null,
          verdict_at: null,
          archived: false,
          routes: p.routes.map((r) => ({ ...r, project_id: p.id, stage: "new" as Stage, updated_by: null, updated_at: null })),
        })
      );
      return { projects, notes: [], events: [], debriefs: [], voice: [] };
    },
    async setVerdict() {
      throw new SaveError(PREVIEW_MSG);
    },
    async setStage() {
      throw new SaveError(PREVIEW_MSG);
    },
    async setArchived() {
      throw new SaveError(PREVIEW_MSG);
    },
    async addNote() {
      throw new SaveError(PREVIEW_MSG);
    },
    async saveDebrief() {
      throw new SaveError(PREVIEW_MSG);
    },
    async saveVoice() {
      throw new SaveError(PREVIEW_MSG);
    },
    async voiceUrl() {
      throw new SaveError(PREVIEW_MSG);
    },
    async deleteVoice() {
      throw new SaveError(PREVIEW_MSG);
    },
    subscribe() {
      return () => {};
    },
    async signOut() {},
  };
}
