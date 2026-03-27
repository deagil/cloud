-- Migration: Supabase Storage buckets
-- Run artifacts (screenshots) are private; profile photos are public.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('run-artifacts', 'run-artifacts', false, 52428800, array['image/png', 'image/jpeg', 'image/webp', 'video/webm']),
  ('profile-photos', 'profile-photos', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- RLS for run-artifacts: workspace members can read artifacts from their runs
create policy "Workspace members can read run artifacts"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'run-artifacts'
    and exists (
      select 1
      from runs r
      -- artifact path: run-artifacts/{run_id}/...
      -- extract run_id from the storage object name (first path segment)
      where r.id::text = split_part(name, '/', 1)
        and public.is_workspace_member(r.workspace_id)
    )
  );

-- Profile photos are public reads — no policy needed (bucket is public)

-- Only service role can insert into run-artifacts (background execution)
-- Only authenticated users can manage their own profile photos
create policy "Users can manage their profile photos"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
