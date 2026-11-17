-- ============================================================
-- KARIGHAR — patch v34: withdraw "a customer can ask for a specific technician"
-- Run ONCE in the Supabase SQL editor. Idempotent.
-- Reverts patch_v31_requested_provider.sql, back to patch_v29's dispatch ring.
--
-- WHY
--
-- patch_v31 let a customer name the technician they wanted: a "Book a
-- technician" tab on /book, a `?pro=` param carried through the booking
-- forms, and `jobs.requested_provider_id` — which hid the new job from every
-- other pro for ten minutes while the named one decided.
--
-- That is being withdrawn as a product decision. A customer picks a SERVICE;
-- the job goes into the open pool and is claimed through the ordinary
-- widening ring. There is no customer-side pro selection anywhere in the
-- client any more, and nothing writes this column.
--
-- WHAT GOES
--
--   * the three policies go back to their patch_v29 bodies, asking
--     caller_in_dispatch_range() directly
--   * the hold function, the see-this-job wrapper, both triggers
--   * the column, its index and its check constraint
--   * public_provider_services, the view the removed tab browsed
--
-- ORDER MATTERS: the policies reference the column through
-- caller_may_see_open_job(), so they are restored FIRST. Dropping the column
-- while a policy still named it would fail.
--
-- WHAT IS LOST
--
-- Which pro was requested on an old job. Nothing reads it — the only surface
-- was a "Requested for you" pill, removed from the client in the same change
-- — and every such job is long since claimed or closed. Acceptable.
--
-- SEQUENCING: run this WITH the client release that stops writing the
-- column, not before it. PostgREST rejects an insert naming a column that
-- does not exist, so the old client would fail to book against this schema.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The three policies, back to patch_v29 (lines 269-306)
--
-- Read it, claim it, quote on it. They must keep agreeing with each other or
-- the narrowest one leaks — which is why all three move together.
-- ------------------------------------------------------------
drop policy if exists jobs_select on jobs;
create policy jobs_select on jobs for select using (
  customer_id = auth.uid()
  or provider_id = auth.uid()
  or is_admin()
  or business_id = auth.uid()
  or (provider_id is null and status in ('created','bidding')
      and (
        (exists (select 1 from providers p where p.profile_id = auth.uid() and p.status = 'approved')
         and not is_attached_tech())
        or is_active_business()
      )
      -- v29: the widening ring.
      and caller_in_dispatch_range(jobs.lat, jobs.lng, jobs.created_at))
);

drop policy if exists jobs_claim on jobs;
create policy jobs_claim on jobs for update
  using (provider_id is null and status in ('created','bidding')
         and exists (select 1 from providers p where p.profile_id = auth.uid() and p.status = 'approved')
         and not is_attached_tech()
         -- Without this a pro who holds the uuid — from an earlier page load,
         -- or from anywhere else — could still claim a job they can no longer
         -- see. A read filter alone is not a dispatch rule.
         and caller_in_dispatch_range(jobs.lat, jobs.lng, jobs.created_at))
  with check (provider_id = auth.uid());

drop policy if exists bids_insert on bids;
create policy bids_insert on bids for insert
  with check (
    is_admin()
    or (provider_id = auth.uid()
        and not is_attached_tech()
        and exists (select 1 from jobs j
                    where j.id = bids.job_id
                      and j.provider_id is null
                      and j.status in ('created','bidding')
                      and caller_in_dispatch_range(j.lat, j.lng, j.created_at)))
  );


-- ------------------------------------------------------------
-- 2. The triggers
--
-- The guard made the field write-once; the notifier told a pro they had been
-- asked for. With no column there is nothing to guard and nobody to tell.
-- Note jobs_after_insert_requested_t was the only AFTER INSERT trigger on
-- `jobs` — after this there are none again.
-- ------------------------------------------------------------
drop trigger if exists jobs_guard_requested_provider_t on jobs;
drop trigger if exists jobs_after_insert_requested_t on jobs;


-- ------------------------------------------------------------
-- 3. The functions
--
-- caller_may_see_open_job() goes, but caller_in_dispatch_range() and the rest
-- of patch_v29 STAY — the policies above depend on them.
-- ------------------------------------------------------------
drop function if exists jobs_guard_requested_provider();
drop function if exists jobs_notify_requested_provider();
drop function if exists caller_may_see_open_job(uuid, double precision, double precision, timestamptz);
drop function if exists requested_provider_hold_minutes();


-- ------------------------------------------------------------
-- 4. The column
--
-- Dropping the column drops its index and check constraint with it; both
-- `drop ... if exists` lines above it are belt-and-braces for a database
-- where someone removed the column by hand first.
-- ------------------------------------------------------------
alter table jobs drop constraint if exists jobs_requested_provider_not_self;
drop index if exists jobs_requested_provider_idx;
alter table jobs drop column if exists requested_provider_id;


-- ------------------------------------------------------------
-- 5. The view the removed tab browsed
--
-- public_provider_services existed only so a customer browsing technicians
-- could see each one's trades. Nothing reads it now.
--
-- public_provider_profiles STAYS — it is unrelated to patch_v31 and still
-- feeds the home rail, a pro's public profile, and every screen that shows a
-- technician's name and rating.
-- ------------------------------------------------------------
drop view if exists public_provider_services;


-- ------------------------------------------------------------
-- Verifying
--
--   -- the column is gone (this must ERROR with 42703):
--   select requested_provider_id from jobs limit 1;
--
--   -- so is the view (also 42P01):
--   select * from public_provider_services limit 1;
--
--   -- and the functions (expect 0 rows):
--   select proname from pg_proc
--    where proname in ('caller_may_see_open_job',
--                      'requested_provider_hold_minutes',
--                      'jobs_guard_requested_provider',
--                      'jobs_notify_requested_provider');
--
--   -- the ring is intact: as an approved pro, a job booked nearby in the
--   -- last few minutes is visible immediately.
--   select count(*) from jobs where provider_id is null
--    and status in ('created','bidding');
-- ------------------------------------------------------------
