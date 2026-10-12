-- Brendan's Lead Board: schema, roles and row-level security.
-- Run once in the Supabase SQL editor (Project > SQL Editor > New query).
-- The database is the authority on permissions; the UI only mirrors it.

create extension if not exists pgcrypto;

-- ---------- People ----------
-- Only people with a row here can see anything. Add Michael and Brendan by hand
-- after they sign in once (see README "Add the two users").
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('admin', 'reviewer'))
);

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ---------- Leads ----------
create table if not exists public.projects (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  city text,
  kind text not null default 'bid' check (kind in ('bid', 'residential_research', 'partner')),
  scope text,
  size text,
  deadline date,
  est_value numeric,
  value_confirmed boolean not null default false,
  value_note text,
  verdict text check (verdict in ('good', 'maybe', 'bad')),
  verdict_by uuid references auth.users(id),
  verdict_at timestamptz,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- A bidding route (usually one GC's request) under an owner project.
-- Several routes never multiply the project's value.
create table if not exists public.routes (
  id text primary key default gen_random_uuid()::text,
  project_id text not null references public.projects(id) on delete cascade,
  contractor text not null,
  trade_scope text,
  source_url text,
  original_ad_url text,           -- null = UNVERIFIED; never fill with a generic link
  date_posted date,
  date_checked date,
  how_to_reply text,
  contact_name text,
  phone text,
  email text,
  verification_note text,
  bid_status text,
  stage text not null default 'new'
    check (stage in ('new', 'contacted', 'estimating', 'quote_sent', 'won', 'lost')),
  updated_by uuid references auth.users(id),
  updated_at timestamptz
);
create index if not exists routes_project_idx on public.routes(project_id);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  route_id text references public.routes(id) on delete set null,
  author uuid not null default auth.uid() references auth.users(id),
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists notes_project_idx on public.notes(project_id);

-- Append-only history: who changed what, when.
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  route_id text references public.routes(id) on delete set null,
  author uuid not null references auth.users(id),
  kind text not null check (kind in ('verdict', 'stage', 'archive', 'edit')),
  from_value text,
  to_value text,
  created_at timestamptz not null default now()
);
create index if not exists events_project_idx on public.events(project_id);

-- ---------- Row-level security ----------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.routes   enable row level security;
alter table public.notes    enable row level security;
alter table public.events   enable row level security;

-- Members (admin or reviewer) can read everything.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (public.my_role() is not null);

drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select to authenticated
  using (public.my_role() is not null);
drop policy if exists routes_read on public.routes;
create policy routes_read on public.routes for select to authenticated
  using (public.my_role() is not null);
drop policy if exists notes_read on public.notes;
create policy notes_read on public.notes for select to authenticated
  using (public.my_role() is not null);
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated
  using (public.my_role() is not null);

-- Only Michael (admin) adds/edits/deletes leads and routes directly.
drop policy if exists projects_admin_write on public.projects;
create policy projects_admin_write on public.projects for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
drop policy if exists routes_admin_write on public.routes;
create policy routes_admin_write on public.routes for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- Either member can add notes, always as themselves. Nobody edits or deletes notes.
drop policy if exists notes_insert on public.notes;
create policy notes_insert on public.notes for insert to authenticated
  with check (public.my_role() is not null and author = auth.uid());

-- Events are written only by the functions below (no direct insert policy).

-- ---------- Actions Brendan is allowed to take ----------
-- Security-definer functions let a reviewer change exactly one field and
-- always write a history event with their name and the time.

create or replace function public.set_verdict(p_project text, p_verdict text)
returns public.projects
language plpgsql security definer set search_path = public as $$
declare
  old_v text;
  result public.projects;
begin
  if public.my_role() is null then raise exception 'not a board member' using errcode = '42501'; end if;
  if p_verdict is not null and p_verdict not in ('good', 'maybe', 'bad') then
    raise exception 'invalid verdict';
  end if;
  select verdict into old_v from projects where id = p_project for update;
  if not found then raise exception 'lead not found'; end if;
  update projects set verdict = p_verdict, verdict_by = auth.uid(), verdict_at = now()
    where id = p_project returning * into result;
  insert into events(project_id, author, kind, from_value, to_value)
    values (p_project, auth.uid(), 'verdict', old_v, p_verdict);
  return result;
end $$;

create or replace function public.set_stage(p_route text, p_stage text)
returns public.routes
language plpgsql security definer set search_path = public as $$
declare
  old_s text;
  pid text;
  result public.routes;
begin
  if public.my_role() is null then raise exception 'not a board member' using errcode = '42501'; end if;
  if p_stage not in ('new', 'contacted', 'estimating', 'quote_sent', 'won', 'lost') then
    raise exception 'invalid stage';
  end if;
  select stage, project_id into old_s, pid from routes where id = p_route for update;
  if not found then raise exception 'route not found'; end if;
  update routes set stage = p_stage, updated_by = auth.uid(), updated_at = now()
    where id = p_route returning * into result;
  insert into events(project_id, route_id, author, kind, from_value, to_value)
    values (pid, p_route, auth.uid(), 'stage', old_s, p_stage);
  return result;
end $$;

create or replace function public.set_archived(p_project text, p_archived boolean)
returns public.projects
language plpgsql security definer set search_path = public as $$
declare result public.projects;
begin
  if coalesce(public.my_role(), '') <> 'admin' then
    raise exception 'only Michael can archive' using errcode = '42501';
  end if;
  update projects set archived = p_archived where id = p_project returning * into result;
  if not found then raise exception 'lead not found'; end if;
  insert into events(project_id, author, kind, to_value)
    values (p_project, auth.uid(), 'archive', case when p_archived then 'archived' else 'restored' end);
  return result;
end $$;

revoke all on function public.set_verdict(text, text) from public, anon;
revoke all on function public.set_stage(text, text) from public, anon;
revoke all on function public.set_archived(text, boolean) from public, anon;
grant execute on function public.set_verdict(text, text) to authenticated;
grant execute on function public.set_stage(text, text) to authenticated;
grant execute on function public.set_archived(text, boolean) to authenticated;

-- Live updates so the other phone sees changes without refreshing.
do $$ begin
  begin alter publication supabase_realtime add table public.projects; exception when others then null; end;
  begin alter publication supabase_realtime add table public.routes;   exception when others then null; end;
  begin alter publication supabase_realtime add table public.notes;    exception when others then null; end;
  begin alter publication supabase_realtime add table public.events;   exception when others then null; end;
end $$;
