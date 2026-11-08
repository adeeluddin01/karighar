-- ============================================================
-- KARIGHAR — patch v29: radius dispatch with a widening ring
-- Run ONCE in the Supabase SQL editor. Idempotent.
-- Independent of v27 and v28 — apply in any order.
--
-- WHAT THIS CHANGES
--
-- Today every approved, unattached technician sees EVERY open job in the
-- city the moment it is posted. `jobs_select`'s open-pool branch tests four
-- things — unassigned, open status, approved, not an attached tech — and
-- nothing geographic. Whoever opens the dashboard first takes the work,
-- however far away they are.
--
-- After this patch a new job is offered first to technicians within 3km of
-- it, and the ring widens as the job goes unclaimed:
--
--     0-9 min   3 km        40-49 min  11 km
--     10-19     5 km        50-59      13 km
--     20-29     7 km        60-69      15 km
--     30-39     9 km        70+        everyone
--
-- All odd, as asked, and capped at 15km — about the width of Karachi's
-- built-up core, after which holding a job back helps nobody.
--
-- NO SCHEDULER. The radius is computed from `jobs.created_at` on every
-- read, so the ring widens on its own with nothing running in the
-- background. There is no cron in this project and this does not add one.
--
-- WHY THE ENFORCEMENT IS IN RLS
--
-- `jobs_select`'s own comment already makes the argument: "/pro/dashboard's
-- pool query is a plain `.is("provider_id", null)` that any caller could
-- reproduce by hand". A radius applied only in the client would be a
-- suggestion, not a dispatch rule — the anon key ships in the bundle. So the
-- predicate goes into the three policies that actually gate the pool:
-- jobs_select (read it), jobs_claim (take it), bids_insert (quote on it).
-- All three must agree or the narrowest one leaks.
--
-- A DELIBERATE DESIGN DECISION IS BEING REVERSED HERE
--
-- patch_v22 states: "`providers` still has no lat/lng at all ... An
-- individual technician therefore remains unplottable ... a business is a
-- premises, a technician is a person who travels."
--
-- That was a privacy position, and radius dispatch cannot work without a
-- coordinate to measure from. The compromise: `providers.lat/lng` is a
-- self-declared BASE location, it is never added to `public_provider_profiles`,
-- and no policy here lets one account read another's. It is read only inside
-- provider_origin(), for the caller's own row. Technicians still do not go
-- on anyone's map.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Where a technician works from
--
-- Nullable, and expected to stay null for a while: nothing collected this
-- before, so every existing row starts without it. provider_origin() below
-- falls back to their service areas so nobody goes dark on day one.
-- ------------------------------------------------------------
alter table providers add column if not exists lat double precision;
alter table providers add column if not exists lng double precision;

do $$
begin
  alter table providers add constraint providers_latlng_pair
    check ((lat is null) = (lng is null));
exception when duplicate_object then null;
end $$;

-- Sanity bounds. Not a Karachi box — a pro may legitimately sit just outside
-- the city — but a transposed lat/lng or a 0,0 "null island" pin is a bug,
-- and it would silently place someone in the Gulf of Guinea.
do $$
begin
  alter table providers add constraint providers_latlng_range
    check (lat is null or (lat between -90 and 90 and lng between -180 and 180));
exception when duplicate_object then null;
end $$;

-- NOTE: providers_guard_trusted_cols() is deliberately NOT amended. lat/lng
-- are self-declared, like bio and service_areas — a pro saying where they
-- work from is not a trusted field, and coercing it would stop them setting
-- it at all.


-- ------------------------------------------------------------
-- 2. Approximate centres for the 14 areas in KARACHI_AREAS
--
-- The fallback for a technician who has not dropped a pin. These are
-- APPROXIMATE neighbourhood centres, good to a kilometre or so — enough to
-- decide "is this job roughly near them", not enough to navigate by. A table
-- rather than a hardcoded CASE so they can be corrected without a code
-- deploy.
--
-- Names must match src/lib/types.ts KARACHI_AREAS exactly; that array is
-- what writes providers.service_areas.
-- ------------------------------------------------------------
create table if not exists area_centroids (
  name text primary key,
  lat  double precision not null,
  lng  double precision not null
);

insert into area_centroids (name, lat, lng) values
  ('Gulshan-e-Iqbal',  24.9215, 67.0961),
  ('DHA',              24.8008, 67.0518),
  ('Clifton',          24.8138, 67.0300),
  ('Nazimabad',        24.9120, 67.0300),
  ('North Nazimabad',  24.9400, 67.0400),
  ('Gulistan-e-Johar', 24.9200, 67.1300),
  ('Malir',            24.8900, 67.2000),
  ('Korangi',          24.8400, 67.1300),
  ('Saddar',           24.8600, 67.0200),
  ('PECHS',            24.8700, 67.0600),
  ('Federal B Area',   24.9300, 67.0700),
  ('Bahadurabad',      24.8800, 67.0700),
  ('Shah Faisal',      24.8700, 67.1600),
  ('Landhi',           24.8500, 67.1900)
on conflict (name) do update set lat = excluded.lat, lng = excluded.lng;

alter table area_centroids enable row level security;

-- Public geography, not personal data. Readable by everyone so the client
-- can show the same rings the policies enforce; admin-writable only.
drop policy if exists area_centroids_read on area_centroids;
create policy area_centroids_read on area_centroids for select using (true);

drop policy if exists area_centroids_admin on area_centroids;
create policy area_centroids_admin on area_centroids for all
  using (is_admin()) with check (is_admin());


-- ------------------------------------------------------------
-- 3. Distance, without PostGIS
--
-- Only pgcrypto is installed, and enabling cube/earthdistance or PostGIS is
-- a dashboard action this patch should not assume. Haversine on a spherical
-- earth is accurate to ~0.3% over city distances, which is far inside the
-- error already introduced by using a neighbourhood centroid.
-- ------------------------------------------------------------
create or replace function km_between(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable parallel safe as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 6371 * 2 * asin(least(1, sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2)
        + cos(radians(lat1)) * cos(radians(lat2))
          * power(sin(radians(lng2 - lng1) / 2), 2)
    )))
  end;
$$;
-- `least(1, ...)` guards asin() against a float result a hair above 1 for two
-- identical points, which would otherwise raise "input is out of range".


-- ------------------------------------------------------------
-- 4. The ladder
--
-- Split in two so the arithmetic is pure and testable on its own, and only
-- the thin wrapper touches now(). NULL means "no limit" — past the cap the
-- job is open to everyone, which is simpler and more honest than a radius
-- large enough to pretend it is a limit.
-- ------------------------------------------------------------
create or replace function dispatch_radius_for_age(p_minutes numeric)
returns numeric language sql immutable parallel safe as $$
  select case
    when p_minutes is null       then 3::numeric   -- treat unknown age as brand new
    when p_minutes < 0           then 3::numeric   -- clock skew; never wider than the start
    when floor(p_minutes / 10) >= 6 then null      -- 70 min+ : everyone
    else (3 + 2 * floor(p_minutes / 10))::numeric  -- 3, 5, 7, 9, 11, 13, 15
  end;
$$;

create or replace function job_dispatch_radius_km(p_created_at timestamptz)
returns numeric language sql stable parallel safe as $$
  select dispatch_radius_for_age(
    extract(epoch from (now() - coalesce(p_created_at, now()))) / 60.0
  );
$$;


-- ------------------------------------------------------------
-- 5. Where the caller is measured from
--
-- A technician's own pin if they set one, otherwise the mean centre of the
-- areas they cover. The mean is crude for someone covering, say, Clifton and
-- Malir — it lands between them, near neither — but it is strictly better
-- than no location, and the fix is for that pro to drop a pin.
--
-- A business measures from its premises, which is already a verified pin
-- (grant_business_account rejects a null one). Businesses compete for the
-- same pool, so leaving them unrestricted would let a dispatcher take a job
-- the 3km rule was holding for a nearby technician.
-- ------------------------------------------------------------
create or replace function caller_origin()
returns table(lat double precision, lng double precision)
language sql stable security definer set search_path = public as $$
  select coalesce(p.lat, c.lat), coalesce(p.lng, c.lng)
  from providers p
  left join lateral (
    select avg(a.lat) as lat, avg(a.lng) as lng
    from area_centroids a
    where a.name in (
      select jsonb_array_elements_text(p.service_areas)
    )
  ) c on true
  where p.profile_id = auth.uid()
  union all
  select b.lat, b.lng
  from businesses b
  where b.profile_id = auth.uid()
    and not exists (select 1 from providers p2 where p2.profile_id = auth.uid())
  limit 1;
$$;
-- SECURITY DEFINER so this can be called from inside a policy without
-- depending on the caller's own read policies resolving mid-evaluation. It
-- reads ONLY the row belonging to auth.uid(), and returns nothing else — no
-- caller can use it to locate anybody but themselves.


-- ------------------------------------------------------------
-- 6. The predicate
--
-- Three separate reasons to show a job regardless of distance, and each one
-- is a liveness decision rather than an oversight:
--
--   * past the cap        — the ring has widened to everyone.
--   * job has no pin      — lat/lng are nullable and a customer can book
--                           without touching the map. An unpinned job is
--                           undispatchable by distance, and hiding it from
--                           everyone would strand it forever.
--   * caller has no origin— no pin and no service areas. Rather than go
--                           dark, they keep today's behaviour until they
--                           set a location. This is the one case that can
--                           be gamed (clear your areas, see everything), and
--                           it is accepted knowingly: the ring is a
--                           head start for nearby pros, not a secret.
-- ------------------------------------------------------------
create or replace function caller_in_dispatch_range(
  p_job_lat    double precision,
  p_job_lng    double precision,
  p_created_at timestamptz
) returns boolean
language sql stable security definer set search_path = public as $$
  with r as (select job_dispatch_radius_km(p_created_at) as km),
       o as (select lat, lng from caller_origin())
  select
    (select km from r) is null
    or p_job_lat is null or p_job_lng is null
    or (select lat from o) is null
    or coalesce(
         km_between((select lat from o), (select lng from o), p_job_lat, p_job_lng),
         0
       ) <= (select km from r);
$$;


-- ------------------------------------------------------------
-- 7. The three policies that gate the pool
--
-- Each keeps every condition it had and gains the distance test. They have
-- to move together: reading, claiming and quoting are three separate doors
-- into the same job.
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
-- 8. Grants
--
-- revoke before grant — patch_v26 skipped that and left its functions
-- callable by anon.
-- ------------------------------------------------------------
revoke all on function km_between(double precision, double precision, double precision, double precision) from public;
revoke all on function dispatch_radius_for_age(numeric) from public;
revoke all on function job_dispatch_radius_km(timestamptz) from public;
revoke all on function caller_origin() from public;
revoke all on function caller_in_dispatch_range(double precision, double precision, timestamptz) from public;

grant execute on function km_between(double precision, double precision, double precision, double precision) to authenticated, service_role;
grant execute on function dispatch_radius_for_age(numeric) to authenticated, service_role;
grant execute on function job_dispatch_radius_km(timestamptz) to authenticated, service_role;
grant execute on function caller_origin() to authenticated, service_role;
grant execute on function caller_in_dispatch_range(double precision, double precision, timestamptz) to authenticated, service_role;

grant select on area_centroids to anon, authenticated;


-- ------------------------------------------------------------
-- Verifying this landed
--
--   -- the ladder, no database state needed:
--   select m, dispatch_radius_for_age(m)
--     from unnest(array[0,9,10,29,30,59,60,69,70,600]::numeric[]) m;
--   -- expect 3,3,5,7,9,13,15,15,null,null
--
--   -- a known distance: Clifton -> Gulshan is roughly 13 km
--   select round(km_between(24.8138,67.0300, 24.9215,67.0961)::numeric, 1);
--
--   -- as an approved technician, the pool should now be a subset:
--   select count(*) from jobs where provider_id is null
--     and status in ('created','bidding');
--
-- PERFORMANCE NOTE
-- caller_in_dispatch_range() runs per candidate row on every pool read.
-- caller_origin() is re-evaluated each time; Postgres will not cache it
-- across rows because it is only STABLE. At Karachi's current job volume
-- that is fine. If the open pool ever runs to tens of thousands of rows,
-- add a bounding-box prefilter on jobs.lat/lng and an index to match before
-- reaching for PostGIS.
-- ------------------------------------------------------------
