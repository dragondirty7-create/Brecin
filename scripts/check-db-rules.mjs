// Checks the database access rules in a real Postgres (PGlite, in-process, no account needed).
// Run: npm run test:db   — loads schema.sql + the debriefs migration with Supabase-like
// auth/storage stand-ins, then signs in as different people and checks what each can do.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const repo = process.argv[2] ?? new URL("..", import.meta.url).pathname;
const schema = readFileSync(`${repo}/supabase/schema.sql`, "utf8").replace("create extension if not exists pgcrypto;", ""); // gen_random_uuid is built in
const migration = readFileSync(`${repo}/supabase/migrations/2026-10-17_debriefs_and_voice_notes.sql`, "utf8");
const rollback = readFileSync(`${repo}/supabase/migrations/2026-10-17_debriefs_and_voice_notes.rollback.sql`, "utf8");

const db = new PGlite();
const U = {
  michael: "11111111-1111-1111-1111-111111111111",
  brendan: "22222222-2222-2222-2222-222222222222",
  chris: "33333333-3333-3333-3333-333333333333", // a second reviewer
  stranger: "44444444-4444-4444-4444-444444444444", // signed in, not on the board
};

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id), name text, owner uuid default auth.uid());
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  create publication supabase_realtime;
`);
await db.exec(schema);
await db.exec(migration);
await db.exec(migration); // must be safe to run twice
await db.exec(`
  grant usage on schema public, storage, auth to anon, authenticated;
  grant all on all tables in schema public to authenticated;
  grant select on all tables in schema public to anon;
  grant all on storage.objects to authenticated; grant select on storage.buckets to authenticated;
  insert into auth.users values ('${U.michael}','m@x'),('${U.brendan}','b@x'),('${U.chris}','c@x'),('${U.stranger}','s@x');
  insert into public.profiles values ('${U.michael}','Michael','admin'),('${U.brendan}','Brendan','reviewer'),('${U.chris}','Chris','reviewer');
  insert into public.projects (id, name) values ('p1','Magnolia'),('p2','Secret lead');
  insert into public.routes (id, project_id, contractor) values ('r1','p1','GC One'),('r2','p2','GC Two');
`);

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + detail}`);
  if (!ok) failures++;
};
async function as(who, fn) {
  await db.exec(`set role ${who === "anon" ? "anon" : "authenticated"}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who === "anon" ? "" : U[who]]);
  try { return await fn(); } finally { await db.exec("reset role"); }
}
const rows = async (who, sql, p = []) => as(who, async () => (await db.query(sql, p)).rows);
async function fails(who, sql, p = []) {
  try { await as(who, () => db.query(sql, p)); return false; } catch { return true; }
}

// --- Writing ---
check("Brendan can file his own debrief",
  !(await fails("brendan", `insert into debriefs (project_id, route_id, outcome) values ('p1','r1','won')`)));
check("Michael can file a debrief on the second lead",
  !(await fails("michael", `insert into debriefs (project_id, route_id, outcome) values ('p2','r2','lost')`)));
check("Debrief with a route from a different lead is refused",
  await fails("chris", `insert into debriefs (project_id, route_id, outcome) values ('p1','r2','won')`));
check("Can't file a debrief in someone else's name",
  await fails("chris", `insert into debriefs (project_id, route_id, outcome, author) values ('p1','r1','won','${U.brendan}')`));
check("Non-member can't file a debrief",
  await fails("stranger", `insert into debriefs (project_id, route_id, outcome) values ('p1','r1','won')`));

const voice = (kind, project, route, path) =>
  `insert into voice_notes (kind, project_id, route_id, path, mime, duration_s, consent)
   values ('${kind}', ${project ? `'${project}'` : "null"}, ${route ? `'${route}'` : "null"}, '${path}', 'audio/webm', 5, true)`;
check("Brendan saves a lead voice note in his folder",
  !(await fails("brendan", voice("note", "p1", "r1", `${U.brendan}/note-1.webm`))));
check("Brendan saves an app-test recording",
  !(await fails("brendan", voice("test", null, null, `${U.brendan}/test-1.webm`))));
check("Voice note pointing into someone else's folder is refused",
  await fails("chris", voice("note", "p1", null, `${U.brendan}/sneaky.webm`)));
check("Voice note with mismatched route is refused",
  await fails("chris", voice("note", "p1", "r2", `${U.chris}/x.webm`)));
check("Recording without consent is refused",
  await fails("brendan", `insert into voice_notes (kind, project_id, path, mime, duration_s, consent)
                          values ('note','p1','${U.brendan}/nc.webm','audio/webm',5,false)`));

await db.exec(`insert into storage.objects (bucket_id, name, owner) values
  ('voice-notes','${U.brendan}/note-1.webm','${U.brendan}'),
  ('voice-notes','${U.brendan}/test-1.webm','${U.brendan}'),
  ('voice-notes','${U.chris}/orphan.webm','${U.chris}')`);

// --- Reading ---
const n = async (who, sql) => (await rows(who, sql)).length;
check("Brendan sees both debriefs", (await n("brendan", "select * from debriefs")) === 2);
check("Signed-in non-member sees no debriefs", (await n("stranger", "select * from debriefs")) === 0);
check("Signed-out sees no debriefs", (await n("anon", "select * from debriefs")) === 0);
check("Signed-out sees no voice notes", (await n("anon", "select * from voice_notes")) === 0);
check("Chris sees Brendan's lead note", (await n("chris", "select * from voice_notes where kind='note'")) === 1);
check("Chris can't see Brendan's app-test recording", (await n("chris", "select * from voice_notes where kind='test'")) === 0);
check("Brendan sees his own app-test recording", (await n("brendan", "select * from voice_notes where kind='test'")) === 1);
check("Michael sees Brendan's app-test recording", (await n("michael", "select * from voice_notes where kind='test'")) === 1);
check("Chris can't open the app-test audio file",
  (await n("chris", `select * from storage.objects where name='${U.brendan}/test-1.webm'`)) === 0);
check("Chris can open the lead-note audio file",
  (await n("chris", `select * from storage.objects where name='${U.brendan}/note-1.webm'`)) === 1);
check("Michael can open the app-test audio file",
  (await n("michael", `select * from storage.objects where name='${U.brendan}/test-1.webm'`)) === 1);
check("Uploader can read own file before its row exists",
  (await n("chris", `select * from storage.objects where name='${U.chris}/orphan.webm'`)) === 1);
check("Others can't read a file with no row",
  (await n("brendan", `select * from storage.objects where name='${U.chris}/orphan.webm'`)) === 0);
check("Stranger can't read any audio file", (await n("stranger", "select * from storage.objects")) === 0);
check("Agent briefing shows finished jobs to members", (await n("brendan", "select * from agent_briefing")) === 2);
check("Agent briefing is empty for non-members", (await n("stranger", "select * from agent_briefing")) === 0);

// --- Editing / deleting ---
const upd = await rows("chris", `update debriefs set for_agents='hijack' where author='${U.brendan}' returning id`);
check("Chris can't edit Brendan's debrief", upd.length === 0);
const own = await rows("brendan", `update debriefs set for_agents='GC paid on time' where author='${U.brendan}' returning id`);
check("Brendan can edit his own debrief", own.length === 1);
check("Nobody can delete a debrief",
  (await rows("michael", "delete from debriefs returning id")).length === 0);
check("Chris can't delete Brendan's recording",
  (await rows("chris", "delete from voice_notes where kind='note' returning id")).length === 0);
check("Chris can't delete Brendan's audio file",
  (await rows("chris", `delete from storage.objects where name='${U.brendan}/note-1.webm' returning id`)).length === 0);

// --- If a lead becomes private, its debriefs and audio follow ---
await db.exec(`drop policy projects_read on public.projects;
  create policy projects_read on public.projects for select to authenticated
    using (public.my_role() = 'admin' or (public.my_role() is not null and id <> 'p2'));`);
check("Hidden lead: Brendan no longer sees its debrief", (await n("brendan", "select * from debriefs where project_id='p2'")) === 0);
check("Hidden lead: Michael still sees it", (await n("michael", "select * from debriefs where project_id='p2'")) === 1);
check("Hidden lead: Brendan can't file a voice note on it",
  await fails("brendan", voice("note", "p2", null, `${U.brendan}/hidden.webm`)));

// --- Someone removed from the board ---
await db.exec(`delete from public.profiles where id='${U.brendan}'`);
check("Removed member can't edit their old debrief",
  (await rows("brendan", "update debriefs set for_agents='x' returning id")).length === 0);
check("Removed member sees nothing", (await n("brendan", "select * from voice_notes")) === 0);

// --- Undo file ---
await db.exec(rollback);
const left = (await db.query(`select to_regclass('public.debriefs') d, to_regclass('public.voice_notes') v,
  (select count(*) from pg_policies where policyname like 'voice_obj%') pol`)).rows[0];
check("Undo removes tables and storage rules", left.d === null && left.v === null && Number(left.pol) === 0, JSON.stringify(left));
await db.exec(migration);
check("Migration re-applies cleanly after undo", true);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
