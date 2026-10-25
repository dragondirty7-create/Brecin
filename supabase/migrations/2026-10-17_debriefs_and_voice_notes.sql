-- Project Presser: job debriefs and voice notes (2026-10-17, access rules tightened 2026-10-25).
-- Run once in Supabase SQL Editor AFTER schema.sql. Safe to run twice.
-- Undo: supabase/migrations/2026-10-17_debriefs_and_voice_notes.rollback.sql
--
-- WHO SEES WHAT (Soul's 2026-10-17 review asked for this matrix):
--   Debrief / lead voice note : any board member who can see the lead itself.
--                               Visibility is inherited from public.projects, so if
--                               a lead is ever made private, its debriefs and audio
--                               follow automatically.
--   App-test recording        : only the person who recorded it, and Michael (admin).
--   Audio file in storage     : only someone who can see its voice_notes row, plus the
--                               uploader during the moment between upload and row save.
--   Edit a debrief            : only its author, and only while still a board member.
--   Delete a recording        : its author or Michael. Debriefs are never deleted.
--   Signed-out / not on board : nothing.
--   Michael's private revenue leads (michael_revenue_leads) are a separate table and
--   are never touched here.
--
-- 1. debriefs: when a bid route ends (Won or Lost), the person who worked it
--    answers a short interview so Michael, Brendan and the agents (Midas, Soul,
--    Claude) learn which leads are worth chasing.
-- 2. voice_notes: short recordings (a note on a lead, a spoken debrief answer,
--    or a whole test session where someone tries the app). Audio lives in a
--    PRIVATE storage bucket; only board members can play it.

-- ---------- Debriefs ----------
create table if not exists public.debriefs (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  route_id text not null references public.routes(id) on delete cascade,
  author uuid not null default auth.uid() references auth.users(id),
  outcome text not null check (outcome in ('won', 'lost')),
  lead_accuracy text check (lead_accuracy in ('right', 'partly', 'wrong')),
  reasons text[] not null default '{}'
    check (reasons <@ array['price','timing','relationship','scope_fit','no_response','paperwork','distance','other']::text[]),
  more_like_this text check (more_like_this in ('more', 'same', 'fewer')),
  real_value numeric check (real_value is null or real_value >= 0),
  for_agents text check (for_agents is null or length(for_agents) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (route_id, author)
);
create index if not exists debriefs_project_idx on public.debriefs(project_id);

alter table public.debriefs enable row level security;

-- The route must belong to the lead, and the reader must be able to see that lead.
-- The subqueries run under the reader's own access, so project rules carry over.
drop policy if exists debriefs_read on public.debriefs;
create policy debriefs_read on public.debriefs for select to authenticated
  using (public.my_role() is not null
         and exists (select 1 from public.projects p where p.id = debriefs.project_id));

-- Members write and update only their own debrief, on a lead they can see. Nobody deletes one.
drop policy if exists debriefs_insert on public.debriefs;
create policy debriefs_insert on public.debriefs for insert to authenticated
  with check (public.my_role() is not null and author = auth.uid()
              and exists (select 1 from public.routes r
                          where r.id = debriefs.route_id and r.project_id = debriefs.project_id));
drop policy if exists debriefs_update on public.debriefs;
create policy debriefs_update on public.debriefs for update to authenticated
  using (public.my_role() is not null and author = auth.uid())
  with check (public.my_role() is not null and author = auth.uid()
              and exists (select 1 from public.routes r
                          where r.id = debriefs.route_id and r.project_id = debriefs.project_id));

-- ---------- Voice notes ----------
create table if not exists public.voice_notes (
  id uuid primary key default gen_random_uuid(),
  project_id text references public.projects(id) on delete cascade,
  route_id text references public.routes(id) on delete set null,
  kind text not null check (kind in ('note', 'debrief', 'test')),
  label text check (label is null or length(label) <= 200),
  path text not null unique,
  mime text not null check (mime like 'audio/%'),
  duration_s integer not null check (duration_s between 1 and 3600),
  -- The recorder will not save without this: everyone heard on it agreed.
  consent boolean not null check (consent),
  author uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check (kind = 'test' or project_id is not null)
);
create index if not exists voice_notes_project_idx on public.voice_notes(project_id);

alter table public.voice_notes enable row level security;

-- Lead recordings: anyone who can see the lead. App-test recordings: the recorder and Michael.
drop policy if exists voice_read on public.voice_notes;
create policy voice_read on public.voice_notes for select to authenticated
  using (public.my_role() is not null and (
           (project_id is not null
            and exists (select 1 from public.projects p where p.id = voice_notes.project_id))
        or (project_id is null and (author = auth.uid() or public.my_role() = 'admin'))));
-- Saved as yourself, under your own storage folder, on a lead you can see.
drop policy if exists voice_insert on public.voice_notes;
create policy voice_insert on public.voice_notes for insert to authenticated
  with check (public.my_role() is not null and author = auth.uid()
              and split_part(path, '/', 1) = auth.uid()::text
              and (project_id is null
                   or exists (select 1 from public.projects p where p.id = voice_notes.project_id))
              and (route_id is null
                   or exists (select 1 from public.routes r
                              where r.id = voice_notes.route_id and r.project_id = voice_notes.project_id)));
-- The person who recorded it, or Michael, can delete a recording.
drop policy if exists voice_delete on public.voice_notes;
create policy voice_delete on public.voice_notes for delete to authenticated
  using (author = auth.uid() or public.my_role() = 'admin');

-- Private bucket: 25 MB per file, audio only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice-notes', 'voice-notes', false, 26214400,
        array['audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/mpeg', 'audio/wav'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- A file is readable (and can get a signed link) only if you can see its voice_notes row.
-- The uploader can also read their own folder, for the moment before the row is saved.
drop policy if exists voice_obj_read on storage.objects;
create policy voice_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'voice-notes' and public.my_role() is not null
         and ((storage.foldername(name))[1] = auth.uid()::text
              or exists (select 1 from public.voice_notes v where v.path = objects.name)));
drop policy if exists voice_obj_insert on storage.objects;
create policy voice_obj_insert on storage.objects for insert to authenticated
  -- Files go under the uploader's own folder: <user id>/<file>.
  with check (bucket_id = 'voice-notes' and public.my_role() is not null
              and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists voice_obj_delete on storage.objects;
create policy voice_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'voice-notes'
         and public.my_role() is not null
         and ((storage.foldername(name))[1] = auth.uid()::text or public.my_role() = 'admin'));

-- ---------- What the agents read ----------
-- One row per finished route, newest first. Agents (or Michael exporting for
-- them) read this instead of the whole board.
create or replace view public.agent_briefing with (security_invoker = true) as
select
  d.created_at,
  p.name as project,
  p.city,
  p.kind,
  r.contractor,
  r.trade_scope,
  d.outcome,
  d.lead_accuracy,
  d.reasons,
  d.more_like_this,
  d.real_value,
  p.est_value,
  d.for_agents,
  pr.display_name as told_by,
  (select count(*) from public.voice_notes v where v.route_id = d.route_id and v.kind = 'debrief') as voice_answers
from public.debriefs d
join public.projects p on p.id = d.project_id
join public.routes r on r.id = d.route_id
left join public.profiles pr on pr.id = d.author
order by d.created_at desc;

do $$ begin
  begin alter publication supabase_realtime add table public.debriefs;    exception when others then null; end;
  begin alter publication supabase_realtime add table public.voice_notes; exception when others then null; end;
end $$;
