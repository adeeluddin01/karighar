-- ============================================================
-- KARIGHAR — patch v23: profile pictures
-- Run ONCE in the Supabase SQL editor. Idempotent.
--
-- What changes, and why
-- ---------------------
-- `profiles.avatar_url` has existed since the first schema and is selected by
-- public_provider_profiles, public_business_profiles and half a dozen
-- screens — but nothing has ever WRITTEN it, and there was no bucket to
-- write a picture to. The only storage bucket is `verification`, which is
-- private and holds CNIC scans; an avatar must not go there.
--
-- So this adds the missing half: a public `avatars` bucket that each account
-- can write only its own folder in.
--
-- PUBLIC ON PURPOSE. An avatar appears next to a pro on /map and on a public
-- company profile, both of which an anonymous visitor can open, so the object
-- has to be world-readable. Nothing sensitive goes in here — the identity
-- documents stay in `verification`, which keeps its own owner-only policies.
-- ============================================================


-- ------------------------------------------------------------
-- 1. The bucket
-- ------------------------------------------------------------
-- `public = true` makes object URLs readable without a signed token, which is
-- what lets <img src> work for a logged-out visitor.
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do update set public = true;


-- ------------------------------------------------------------
-- 2. Policies
-- ------------------------------------------------------------
-- Same folder-per-account shape as the verification bucket: the first path
-- segment must be the caller's own uid, so nobody can overwrite anyone
-- else's picture. `storage` lives outside the public schema, so these
-- survive a `drop schema public cascade` reset — dropped first so a re-run
-- doesn't fail.
drop policy if exists avatars_read       on storage.objects;
drop policy if exists avatars_own_write  on storage.objects;
drop policy if exists avatars_own_update on storage.objects;
drop policy if exists avatars_own_delete on storage.objects;

-- Anyone, signed in or not: a pro's face on /map is public.
create policy avatars_read on storage.objects for select
  using (bucket_id = 'avatars');

create policy avatars_own_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Needed as well as insert: the client uploads with `upsert: true`, which is
-- an UPDATE when the object already exists.
create policy avatars_own_update on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_own_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ============================================================
-- Verify
-- ============================================================
--   select id, public from storage.buckets where id = 'avatars';
--   -- expect: avatars | t
--
--   select policyname from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and policyname like 'avatars%';
--   -- expect 4 rows
--
-- As a signed-in user, uploading to `<your uid>/avatar.jpg` must succeed and
-- uploading to `<someone else's uid>/avatar.jpg` must fail.
--
-- NOT CHANGED BY THIS PATCH:
-- `profiles.avatar_url` already existed and is already self-writable under
-- `profiles_upd` (`using (id = auth.uid())`), so no new table policy is
-- needed — the column simply had nothing writing to it until now.
--
-- The `verification` bucket is untouched and stays private. An avatar is
-- public; a CNIC scan is not, and the two must never share a bucket.
