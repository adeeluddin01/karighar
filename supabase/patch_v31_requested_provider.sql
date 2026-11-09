-- ============================================================
-- KARIGHAR — patch v31: a customer can ask for a specific technician
-- Run ONCE in the Supabase SQL editor. Idempotent.
-- Applies on top of patch_v29 (the dispatch ring), which it extends.
--
-- WHAT THIS ADDS
--
-- Today a customer who likes a technician has no way to say so. Every
-- provider profile's "Book a service" button is a bare href="/book" that
-- drops the id, and the four booking screens never write `provider_id` at
-- all — the job goes into the open pool and whoever opens their dashboard
-- first takes it.
--
-- This adds `jobs.requested_provider_id`: the technician the customer asked
-- for. The requested pro sees the job IMMEDIATELY, regardless of how far
-- they are from it, and for the first 10 minutes nobody else can see it at
-- all. If they do not take it, the job falls back into the normal widening
-- ring and anyone can.
--
-- WHY NOT JUST SET provider_id AT BOOKING
--
-- Nothing in RLS stops a client writing `provider_id` on insert — the policy
-- is only `with check (customer_id = auth.uid())`. It would be one line in
-- the booking form. It is still wrong:
--
--   * the technician never agreed. They might be mid-job, off shift, or 20km
--     away, and the job would sit assigned to someone who never saw it.
--   * it bypasses jobs_enforce_freelance_cap (patch_v26), which only fires
--     on the paths that set provider_id through an UPDATE.
--   * jobs_notify fires on null -> not-null UPDATE, so an insert-time
--     assignment notifies nobody.
--
-- A request is an offer, not an assignment. The pro still claims it through
-- the ordinary path, so every existing guard keeps applying.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The column
--
-- References providers, not profiles: you can only ask for someone who is
-- actually a technician. ON DELETE SET NULL — if the pro's account goes, the
-- job is still a real job and falls back to the open pool rather than
-- vanishing with them.
-- ------------------------------------------------------------
alter table jobs add column if not exists requested_provider_id uuid
  references providers(profile_id) on delete set null;

create index if not exists jobs_requested_provider_idx
  on jobs (requested_provider_id) where requested_provider_id is not null;

-- A customer cannot request themselves, which would otherwise let anyone
-- with a providers row hide a job from the pool indefinitely.
do $$
begin
  alter table jobs add constraint jobs_requested_provider_not_self
    check (requested_provider_id is null or requested_provider_id <> customer_id);
exception when duplicate_object then null;
end $$;


-- ------------------------------------------------------------
-- 2. How long the request is held exclusively
--
-- Ten minutes — one rung of the dispatch ladder. Long enough for a pro to
-- see a notification and respond, short enough that a customer who picked
-- someone unavailable is not left waiting while the job reaches nobody.
-- ------------------------------------------------------------
create or replace function requested_provider_hold_minutes()
returns numeric language sql immutable parallel safe as $$
  select 10::numeric;
$$;

/**
 * Can the calling account see this job yet?
 *
 * Three cases, in order:
 *   * the caller IS the requested pro  -> always, from the moment it is
 *     posted, however far away they are. Being asked for by name outranks
 *     the ring.
 *   * someone else, still inside the hold -> no. This is the exclusivity.
 *   * after the hold, or no request at all -> the ordinary dispatch ring.
 */
create or replace function caller_may_see_open_job(
  p_requested  uuid,
  p_job_lat    double precision,
  p_job_lng    double precision,
  p_created_at timestamptz
) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_requested is not null and p_requested = auth.uid() then true
    when p_requested is not null
         and extract(epoch from (now() - coalesce(p_created_at, now()))) / 60.0
             < requested_provider_hold_minutes() then false
    else caller_in_dispatch_range(p_job_lat, p_job_lng, p_created_at)
  end;
$$;


-- ------------------------------------------------------------
-- 3. The policies
--
-- Same three doors patch_v29 guards — read it, claim it, quote on it — now
-- asking caller_may_see_open_job() instead of the ring directly. They must
-- keep agreeing or the narrowest one leaks.
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
      and caller_may_see_open_job(jobs.requested_provider_id, jobs.lat, jobs.lng, jobs.created_at))
);

drop policy if exists jobs_claim on jobs;
create policy jobs_claim on jobs for update
  using (provider_id is null and status in ('created','bidding')
         and exists (select 1 from providers p where p.profile_id = auth.uid() and p.status = 'approved')
         and not is_attached_tech()
         and caller_may_see_open_job(jobs.requested_provider_id, jobs.lat, jobs.lng, jobs.created_at))
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
                      and caller_may_see_open_job(j.requested_provider_id, j.lat, j.lng, j.created_at)))
  );


-- ------------------------------------------------------------
-- 4. Lock the field down
--
-- `jobs_insert` only checks `customer_id = auth.uid()`, so without this a
-- customer could set requested_provider_id on someone else's job, or change
-- it after the fact to yank a job back out of the pool. It is set once, at
-- booking, by the person booking.
-- ------------------------------------------------------------
create or replace function jobs_guard_requested_provider()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and new.requested_provider_id is distinct from old.requested_provider_id
     and current_user = 'authenticated'
     and not is_admin() then
    raise exception 'The requested pro is set when the job is booked and cannot be changed';
  end if;
  return new;
end; $$;

drop trigger if exists jobs_guard_requested_provider_t on jobs;
create trigger jobs_guard_requested_provider_t before update on jobs
  for each row execute function jobs_guard_requested_provider();


-- ------------------------------------------------------------
-- 5. Tell the technician they were asked for
--
-- The only provider-facing "new job" notification fires on null -> not-null
-- provider_id, i.e. AFTER they already took it. A request is the one case
-- where a job should reach a specific pro before anyone acts, so it needs
-- its own trigger — and it is the first AFTER INSERT notification on `jobs`.
-- ------------------------------------------------------------
create or replace function jobs_notify_requested_provider()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.requested_provider_id is not null then
    perform notify_user(
      new.requested_provider_id,
      'job_new',
      'A customer asked for you',
      new.title,
      new.id);
  end if;
  return new;
end; $$;

drop trigger if exists jobs_after_insert_requested_t on jobs;
create trigger jobs_after_insert_requested_t after insert on jobs
  for each row execute function jobs_notify_requested_provider();


-- ------------------------------------------------------------
-- 6. Grants. revoke before grant — patch_v26 skipped that step.
-- ------------------------------------------------------------
revoke all on function requested_provider_hold_minutes() from public;
revoke all on function caller_may_see_open_job(uuid, double precision, double precision, timestamptz) from public;
revoke all on function jobs_guard_requested_provider() from public;
revoke all on function jobs_notify_requested_provider() from public;

grant execute on function requested_provider_hold_minutes() to authenticated, service_role;
grant execute on function caller_may_see_open_job(uuid, double precision, double precision, timestamptz)
  to authenticated, service_role;


-- ------------------------------------------------------------
-- Verifying
--
--   -- the hold, with no database state:
--   select requested_provider_hold_minutes();   -- 10
--
--   -- as the requested pro, a brand-new job 40km away is visible:
--   select count(*) from jobs
--    where requested_provider_id = auth.uid() and provider_id is null;
--
--   -- as any OTHER approved pro, that same job must not appear for the
--   -- first 10 minutes, then should.
-- ------------------------------------------------------------


-- ------------------------------------------------------------
-- 7. Which services a technician offers, publicly
--
-- Needed by the "Book a technician" tab: a customer browsing technicians by
-- trade has to know what each one does. `provider_services` cannot answer
-- that — its only policy is `provsvc_self` (owner or admin), so to a
-- customer it is empty.
--
-- Businesses already solved this exact problem: `public_business_services`
-- (schema.sql:2154) is an owner-rights view over the same join. This is its
-- technician twin, and it exposes nothing new — service and category names
-- are already world-readable (`svc_read`/`cat_read` are both `using (true)`),
-- and the technician's identity is already public through
-- `public_provider_profiles`. Only the LINK between them was missing.
--
-- Approved technicians only, mirroring public_provider_profiles' own filter,
-- so a pending or suspended account never surfaces as bookable.
-- ------------------------------------------------------------
create or replace view public_provider_services as
  select ps.provider_id,
         s.id         as service_id,
         s.name       as service_name,
         c.id         as category_id,
         c.name       as category_name,
         c.icon       as category_icon,
         c.sort_order as category_sort
  from provider_services ps
  join providers p          on p.profile_id = ps.provider_id
  join profiles pr          on pr.id = ps.provider_id
  join services s           on s.id = ps.service_id
  join service_categories c on c.id = s.category_id
  where p.status = 'approved' and pr.role = 'provider'
    and s.is_active and c.is_active;

do $$
begin
  execute 'alter view public_provider_services set (security_invoker = off)';
exception when others then
  raise notice 'security_invoker unsupported here; owner rights are the default';
end $$;

grant select on public_provider_services to anon, authenticated;
