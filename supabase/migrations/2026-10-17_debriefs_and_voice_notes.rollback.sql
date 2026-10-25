-- Undo 2026-10-17_debriefs_and_voice_notes.sql.
-- WARNING: this permanently deletes every debrief and voice-note record.
-- Supabase does not let SQL delete storage files or buckets. After running this,
-- open Storage, empty the "voice-notes" bucket, then delete the bucket.

drop view if exists public.agent_briefing;

do $$ begin
  begin alter publication supabase_realtime drop table public.voice_notes; exception when others then null; end;
  begin alter publication supabase_realtime drop table public.debriefs;    exception when others then null; end;
end $$;

drop policy if exists voice_obj_read   on storage.objects;
drop policy if exists voice_obj_insert on storage.objects;
drop policy if exists voice_obj_delete on storage.objects;

drop table if exists public.voice_notes;
drop table if exists public.debriefs;

