-- ============================================================
-- KARIGHAR — patch v16: let a customer see their own pro's profile
-- Run ONCE in the Supabase SQL editor AFTER patch_v11 (or after schema.sql,
-- which already includes v11's version of this view). Idempotent.
--
-- The problem
-- -----------
-- public_provider_profiles (patch_v11 / schema.sql) only lists a provider
-- when `status = 'approved' and role = 'provider'` — the right gate for the
-- general public browse on Home/Map, where there is no relationship between
-- viewer and provider yet.
--
-- But the mobile app also uses this same view to resolve the provider on a
-- CUSTOMER'S OWN JOB: the pro's name/avatar on the bookings list, the pro
-- card on the booking detail screen, the quote cards while bidding, chat,
-- and the "view profile" link itself. All of those point at a provider the
-- customer already has a real relationship with — the job or bid row is
-- proof of that — so gating them on the provider's current public-listing
-- status is the wrong check and is why those screens come back empty /
-- "Pro not found" even for a provider legitimately assigned to the job.
--
-- The fix
-- -------
-- Add two more ways a row becomes visible, alongside the existing public
-- case: the requester has a `jobs` row with this provider (as customer_id ->
-- provider_id, any status — active or past, matching "the customer can see
-- the active job provider page" either way), or a `bids` row on one of their
-- jobs (so a quote during bidding also shows a real name/photo, not a blank).
-- Admins keep seeing everyone, as before.
--
-- This does not expose anything new to a stranger: a customer can only ever
-- unlock a provider they have already interacted with through a real job.
-- ============================================================

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
  where
    -- public case: unchanged from patch_v11
    (prov.status = 'approved' and pr.role = 'provider')

    -- relationship case: a job the requester owns as customer, with this
    -- provider assigned (any status — includes past/closed jobs)
    or exists (
      select 1 from jobs j
      where j.provider_id = prov.profile_id
        and j.customer_id = auth.uid()
    )

    -- relationship case: a quote from this provider on one of the
    -- requester's jobs, even before they're assigned
    or exists (
      select 1 from bids b
      join jobs j on j.id = b.job_id
      where b.provider_id = prov.profile_id
        and j.customer_id = auth.uid()
    )

    or is_admin();

-- Owner's rights are what let the view read past providers/profiles RLS —
-- restated so a future default flip is loud (same as patch_v11).
do $$
begin
  execute 'alter view public_provider_profiles set (security_invoker = off)';
exception when others then
  raise notice 'security_invoker unsupported here; view already uses owner rights by default';
end $$;

grant select on public_provider_profiles to anon, authenticated;

-- ---------- check ----------
-- As the affected customer (through the app, or via the SQL editor's "Run as"
-- if your plan supports it), this should now return the assigned/bidding pro
-- even while their `providers.status` is still 'pending':
--
--   select * from public_provider_profiles where id = '<provider profile_id>';
--
-- A stranger with no job/bid tied to that provider must still get nothing
-- back for a non-approved pro — the public case is unchanged.
