-- ============================================================
-- KARIGHAR — patch v11: stop exposing provider identity documents (SECURITY)
-- Run ONCE in the Supabase SQL editor. Idempotent & self-contained:
-- it re-creates the public_provider_profiles view, so it also covers
-- projects where patch_v7 was never applied.
--
-- The problem
-- -----------
-- schema.sql shipped:
--
--     create policy prov_read on providers for select using (true);
--
-- `providers` holds `cnic_no`, `cnic_front_url`, `cnic_back_url` and
-- `selfie_url`. Row-level security is row-level, not column-level, so that
-- one policy hands every CNIC number and document path to anyone holding the
-- anon key — which ships in the browser bundle of a static export.
--
-- The storage bucket itself is already private (patch_v2), so the images
-- aren't downloadable; the identity numbers and paths were.
--
-- The fix
-- -------
-- Drop the blanket read. Public, non-sensitive pro data goes out through the
-- `public_provider_profiles` view, which selects only the safe columns and
-- runs with its owner's rights, so it can still read `providers` (and
-- `profiles`) after this lockdown.
--
-- Column-level GRANTs can't express this: a grant applies to the role, not
-- the row, so restricting `cnic_no` for `authenticated` would also hide it
-- from the provider reading their own record in /pro/onboarding.
-- ============================================================

-- ---------- 1. the public, safe projection ----------
-- Both halves of the condition matter. patch_v7's version checked only
-- `status = 'approved'`, so ANY account with an approved `providers` row was
-- listed as a bookable pro — including one whose profile is still a customer
-- (e.g. a row inserted by hand, or an onboarding that never flipped the role).
-- `role = 'provider' AND status = 'approved'` is exactly what roleOf() in
-- src/components/nav.ts treats as a provider, so the view and the app now
-- agree on who is one.
create or replace view public_provider_profiles as
  select prov.profile_id as id,
         pr.full_name,
         pr.avatar_url,
         prov.bio,
         prov.rating_avg,
         prov.jobs_completed,
         prov.service_areas
  from providers prov
  join profiles pr on pr.id = prov.profile_id
  where prov.status = 'approved'
    and pr.role = 'provider';

-- Owner's rights (the default) are what let the view read past the RLS below.
-- Stated explicitly so a future default flip doesn't silently break it.
do $$
begin
  execute 'alter view public_provider_profiles set (security_invoker = off)';
exception when others then
  raise notice 'security_invoker unsupported here; view already uses owner rights by default';
end $$;

grant select on public_provider_profiles to anon, authenticated;

-- ---------- 2. lock the table down ----------
-- Everything the public needs is in the view above.
drop policy if exists prov_read on providers;

-- Owner and admin keep full access (restated so this file stands alone).
drop policy if exists prov_self on providers;
create policy prov_self on providers for all
  using (profile_id = auth.uid() or is_admin())
  with check (profile_id = auth.uid() or is_admin());

-- ---------- 3. check ----------
-- Expect exactly one policy (`prov_self`) on `providers`:
--   select polname from pg_policies where tablename = 'providers';
-- And, signed out, this must now return zero rows:
--   select cnic_no from providers;
-- while this still returns the approved pros:
--   select * from public_provider_profiles;

-- ---------- 4. find accounts the stricter view now excludes ----------
-- A `providers` row whose profile isn't role='provider' will no longer appear.
-- That's usually a data mistake rather than a missing pro, so list them:
--
--   select p.id, p.full_name, p.role, pv.status
--   from providers pv join profiles p on p.id = pv.profile_id
--   where pv.status = 'approved' and p.role <> 'provider';
--
-- Then pick the repair that matches what you meant. Either promote that
-- account (it really is the pro):
--
--   update profiles set role = 'provider' where id = '<profile-id>';
--
-- or move the providers row to the account that should own it:
--
--   update providers set profile_id = '<real-pro-id>' where profile_id = '<wrong-id>';
--
-- Left as comments on purpose — only you know which was intended.
