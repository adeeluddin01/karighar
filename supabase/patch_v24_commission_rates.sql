-- ============================================================
-- KARIGHAR — patch v24: configurable + per-account commission rates
-- Run ONCE in the Supabase SQL editor. Idempotent.
--
-- What changes, and why
-- ---------------------
-- Karighar's cut was hardcoded in one place: jobs_enforce_insert() stamped
-- 0.20 on a fixed job and 0.15 on a custom one, and nothing could ever vary
-- it. Changing the platform rate meant a schema edit; giving one technician
-- or one company a different deal was impossible.
--
-- This adds two levels:
--
--   1. a platform default per ACCOUNT KIND and per JOB TYPE — four numbers,
--      because Karighar charges a solo technician and a dispatching company
--      on different terms, and a catalogue booking on different terms from
--      an on-site quote. These are edited on the Providers and Businesses
--      tabs respectively, beside the accounts they govern;
--   2. an optional per-account override on `providers` and on `businesses`.
--      Null means "use the platform default for my kind", so nothing changes
--      for the accounts an admin never touches.
--
-- WHERE THE RATE IS RESOLVED
-- At INSERT nobody knows who will do the job — provider_id is null — so the
-- job can only carry a placeholder at that point (the technician default,
-- the common case). The real rate is applied when the provider is STAMPED,
-- in jobs_stamp_business(), which already fires on every path that ever sets
-- provider_id and already owns business_id/tech_share. An unassigned job is
-- never paid, so the placeholder can never be charged.
--
-- And it is frozen there, exactly like tech_share: raising an account's rate
-- tomorrow must not re-price work already done. The job carries what was
-- actually charged.
--
-- WHO IS BILLED DECIDES WHOSE RATE APPLIES. On a dispatched job Karighar
-- bills the BUSINESS, so the business override — and failing that the
-- BUSINESS default — wins, and the technician's own rate is irrelevant:
-- they are not the one paying it.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Platform defaults
-- ------------------------------------------------------------
-- Single row: `id` is a boolean pinned true by a check, so a second row
-- cannot exist and every reader can say `where id`.
create table if not exists platform_settings (
  id         boolean primary key default true check (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);

-- Added separately rather than in the CREATE above so this patch also
-- upgrades a database that ran an earlier draft of it.
alter table platform_settings add column if not exists provider_fixed  numeric(4,3) not null default 0.200;
alter table platform_settings add column if not exists provider_custom numeric(4,3) not null default 0.150;
alter table platform_settings add column if not exists business_fixed  numeric(4,3) not null default 0.200;
alter table platform_settings add column if not exists business_custom numeric(4,3) not null default 0.150;

do $$
begin
  alter table platform_settings add constraint platform_rates_range check (
    provider_fixed  between 0 and 1 and provider_custom between 0 and 1 and
    business_fixed  between 0 and 1 and business_custom between 0 and 1
  );
exception when duplicate_object then null;
end $$;

insert into platform_settings (id) values (true) on conflict (id) do nothing;

-- An earlier draft of THIS patch held one pair for both account kinds. If
-- those columns are present, carry their values across before dropping them,
-- so an admin who already set a rate does not silently lose it.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'platform_settings'
                and column_name = 'commission_fixed') then
    update platform_settings
       set provider_fixed  = commission_fixed,  provider_custom = commission_custom,
           business_fixed  = commission_fixed,  business_custom = commission_custom
     where id;
    alter table platform_settings drop column commission_fixed;
    alter table platform_settings drop column commission_custom;
  end if;
end $$;

alter table platform_settings enable row level security;

-- Readable by any signed-in account: a pro already sees the commission on
-- every one of their own jobs in /pro/history, so the rate itself is not a
-- secret. Writes are admin-only, and go through the RPC below.
drop policy if exists settings_read  on platform_settings;
drop policy if exists settings_admin on platform_settings;
create policy settings_read  on platform_settings for select to authenticated using (true);
create policy settings_admin on platform_settings for all
  using (is_admin()) with check (is_admin());


-- ------------------------------------------------------------
-- 2. Per-account overrides
-- ------------------------------------------------------------
-- Null = follow the platform default for this account's kind. Deliberately
-- nullable rather than defaulted, so "never set" and "set to the same number
-- as the default" stay distinguishable — the admin screens show the
-- difference, and 0% is a real deal someone can strike.
alter table providers  add column if not exists commission_rate numeric(4,3);
alter table businesses add column if not exists commission_rate numeric(4,3);

do $$
begin
  alter table providers add constraint providers_commission_range
    check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 1));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table businesses add constraint businesses_commission_range
    check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 1));
exception when duplicate_object then null;
end $$;


-- ------------------------------------------------------------
-- 3. The overrides are platform-owned
-- ------------------------------------------------------------
-- WITHOUT THIS THE WHOLE PATCH IS A HOLE. `prov_self` and `biz_self_update`
-- are row-level, not column-level, so the owner may write every column of
-- their own row — a provider could set their own commission to 0 and keep
-- 100% of every job. Same class as patch_v17 and patch_v22; same fix, which
-- is to coerce the column back on any end-user write.
create or replace function providers_guard_trusted_cols()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Not an end-user write: definer triggers, service_role and psql pass through.
  if current_user is distinct from 'authenticated' then return new; end if;
  if is_admin() then return new; end if;

  if tg_op = 'INSERT' then
    new.status          := 'pending';
    new.verified_at     := null;
    new.rating_avg      := 0;
    new.jobs_completed  := 0;
    new.commission_rate := null;
  else
    new.status          := old.status;
    new.verified_at     := old.verified_at;
    new.rating_avg      := old.rating_avg;
    new.jobs_completed  := old.jobs_completed;
    new.commission_rate := old.commission_rate;
  end if;
  return new;
end; $$;

create or replace function businesses_guard_trusted_cols()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user is distinct from 'authenticated' then return new; end if;
  if is_admin() then return new; end if;

  if tg_op = 'INSERT' then
    raise exception 'Business accounts are granted by Karighar';
  end if;

  new.status           := old.status;
  new.verified_at      := old.verified_at;
  new.rating_avg       := old.rating_avg;
  new.jobs_completed   := old.jobs_completed;
  new.created_at       := old.created_at;
  -- Identity and premises: recorded by the admin who granted the account.
  new.cnic_no          := old.cnic_no;
  new.cnic_front_url   := old.cnic_front_url;
  new.cnic_back_url    := old.cnic_back_url;
  new.owner_selfie_url := old.owner_selfie_url;
  new.address          := old.address;
  new.lat              := old.lat;
  new.lng              := old.lng;
  -- What Karighar charges them is Karighar's to set.
  new.commission_rate  := old.commission_rate;
  return new;
end; $$;


-- ------------------------------------------------------------
-- 4. Resolution
-- ------------------------------------------------------------
-- The earlier draft took only a job type; drop it so the new signature is
-- unambiguous rather than overloaded.
drop function if exists default_commission_rate(job_type);

-- `p_scope` is 'provider' or 'business'. Defaults to 'provider' because the
-- one caller that cannot know yet — jobs_enforce_insert, at booking time —
-- is stamping a placeholder for an unassigned job.
create or replace function default_commission_rate(
  p_type  job_type,
  p_scope text default 'provider'
)
returns numeric language sql stable security definer set search_path = public as $$
  select case
           when p_scope = 'business' and p_type = 'fixed' then business_fixed
           when p_scope = 'business'                      then business_custom
           when p_type  = 'fixed'                         then provider_fixed
           else                                                provider_custom
         end
    from platform_settings where id;
$$;

-- Whose rate applies follows who is BILLED. On a dispatched job that is the
-- business, so a technician override on an attached tech is correctly
-- ignored — they are not the one paying Karighar.
create or replace function resolve_commission_rate(
  p_provider uuid,
  p_business uuid,
  p_type     job_type
)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare rate numeric;
begin
  if p_business is not null then
    select b.commission_rate into rate from businesses b where b.profile_id = p_business;
    return coalesce(rate, default_commission_rate(p_type, 'business'));
  end if;

  if p_provider is not null then
    select p.commission_rate into rate from providers p where p.profile_id = p_provider;
  end if;
  return coalesce(rate, default_commission_rate(p_type, 'provider'));
end; $$;


-- ------------------------------------------------------------
-- 5. Stamping
-- ------------------------------------------------------------
-- INSERT: provider_id is null, so only a placeholder can apply. The literals
-- 0.20 / 0.15 are gone.
create or replace function jobs_enforce_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare svc services%rowtype; recent int;
begin
  select count(*) into recent from jobs
    where customer_id = new.customer_id and created_at > now() - interval '10 minutes';
  if recent >= 6 then
    raise exception 'Too many bookings in a short time — please wait a few minutes.';
  end if;

  if new.type = 'fixed' then
    if new.service_id is null then raise exception 'A fixed job needs a service'; end if;
    select * into svc from services where id = new.service_id and is_active = true;
    if not found then raise exception 'That service is not available'; end if;
    new.price := svc.base_price;      -- server-derived; ignore client value
    new.status := 'created';
  else
    new.price := null;
    new.status := 'bidding';
  end if;
  -- A placeholder until a provider is known; jobs_stamp_business re-resolves
  -- it against whoever is actually billed, and an unassigned job is never paid.
  new.commission_rate := default_commission_rate(new.type, 'provider');
  return new;
end; $$;

-- ASSIGNMENT: re-resolve against whoever is actually going to be billed, in
-- the same trigger that already derives business_id and tech_share, and
-- freeze it there.
create or replace function jobs_stamp_business()
returns trigger language plpgsql security definer set search_path = public as $$
declare biz uuid; share numeric(4,3); admin_set boolean := false;
begin
  if tg_op = 'UPDATE' then
    -- An admin may set a one-off rate on a single job; remember that they
    -- did so before the coercion below, so re-deriving does not undo it.
    admin_set := is_admin() and new.commission_rate is distinct from old.commission_rate;

    -- Platform-owned on `jobs`, in every other case.
    if not is_admin() then
      new.commission_rate := old.commission_rate;
    end if;

    if new.provider_id is not distinct from old.provider_id then
      -- Nothing to re-derive, so hold them exactly as they were. Note this
      -- also reverts the RI-driven write from `on delete set null`, which is
      -- why jobs.business_id is declared NO ACTION like jobs.provider_id.
      new.business_id := old.business_id;
      new.tech_share  := old.tech_share;
      return new;
    end if;
  end if;

  if new.provider_id is null then
    new.business_id := null;
    new.tech_share  := null;
    return new;
  end if;

  -- The business must be live as well as the membership: a suspended
  -- dispatcher's technicians go back to working for themselves (see
  -- is_attached_tech, which releases them to the open pool on the same
  -- condition), and their jobs must not be billed to it.
  select m.business_id, m.tech_share into biz, share
    from business_members m
    join businesses b on b.profile_id = m.business_id
   where m.provider_id = new.provider_id
     and m.status = 'active' and b.status = 'active';

  -- Both stay null for an independent pro, so their behaviour is unchanged.
  new.business_id := biz;
  new.tech_share  := share;

  -- The rate this account actually gets, frozen onto the job from here on.
  if not admin_set then
    new.commission_rate := resolve_commission_rate(new.provider_id, biz, new.type);
  end if;
  return new;
end; $$;


-- ------------------------------------------------------------
-- 6. Admin write paths
-- ------------------------------------------------------------
-- The earlier draft took one pair for both kinds; drop it rather than leave
-- an overload that writes half the table.
drop function if exists set_platform_commission(numeric, numeric);

-- One account kind at a time, because the two cards live on two different
-- admin tabs and neither should silently rewrite the other's rates.
create or replace function set_platform_commission(
  p_scope  text,
  p_fixed  numeric,
  p_custom numeric
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if p_scope not in ('provider', 'business') then
    raise exception 'Scope must be provider or business';
  end if;
  if p_fixed is null or p_custom is null then
    raise exception 'Both rates are required';
  end if;
  if p_fixed < 0 or p_fixed > 1 or p_custom < 0 or p_custom > 1 then
    raise exception 'A commission rate is a fraction between 0 and 1';
  end if;

  update platform_settings
     set provider_fixed  = case when p_scope = 'provider' then round(p_fixed, 3)  else provider_fixed  end,
         provider_custom = case when p_scope = 'provider' then round(p_custom, 3) else provider_custom end,
         business_fixed  = case when p_scope = 'business' then round(p_fixed, 3)  else business_fixed  end,
         business_custom = case when p_scope = 'business' then round(p_custom, 3) else business_custom end,
         updated_at = now(),
         updated_by = auth.uid()
   where id;
end; $$;

-- One entry point for both account kinds, so the admin screens don't have to
-- know which table an id lives in. Null clears the override.
create or replace function set_account_commission(p_profile uuid, p_rate numeric)
returns void language plpgsql security definer set search_path = public as $$
declare is_biz boolean; is_pro boolean;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if p_rate is not null and (p_rate < 0 or p_rate > 1) then
    raise exception 'A commission rate is a fraction between 0 and 1';
  end if;

  select exists (select 1 from businesses where profile_id = p_profile) into is_biz;
  select exists (select 1 from providers  where profile_id = p_profile) into is_pro;

  if is_biz then
    update businesses set commission_rate = round(p_rate, 3) where profile_id = p_profile;
  elsif is_pro then
    update providers  set commission_rate = round(p_rate, 3) where profile_id = p_profile;
  else
    raise exception 'That account is neither a technician nor a business';
  end if;
end; $$;

revoke all on function set_platform_commission(text, numeric, numeric) from public;
revoke all on function set_account_commission(uuid, numeric)           from public;
revoke all on function default_commission_rate(job_type, text)         from public;
revoke all on function resolve_commission_rate(uuid, uuid, job_type)   from public;
grant execute on function set_platform_commission(text, numeric, numeric) to authenticated, service_role;
grant execute on function set_account_commission(uuid, numeric)           to authenticated, service_role;
grant execute on function default_commission_rate(job_type, text)         to authenticated, service_role;
grant execute on function resolve_commission_rate(uuid, uuid, job_type)   to authenticated, service_role;


-- ============================================================
-- Verify
-- ============================================================
--   select * from platform_settings;
--   -- one row: provider 0.200/0.150, business 0.200/0.150
--
--   select set_platform_commission('business', 0.25, 0.18);
--   select default_commission_rate('fixed', 'business');   -- 0.250
--   select default_commission_rate('fixed', 'provider');   -- 0.200, untouched
--
-- Per account:
--   select set_account_commission('<pro uid>', 0.10);
--   select commission_rate from providers where profile_id = '<pro uid>';
--   select set_account_commission('<pro uid>', null);   -- back to the default
--
-- The override must NOT be self-writable. As that provider:
--   update providers set commission_rate = 0 where profile_id = auth.uid();
--   -- succeeds as a statement, but the row is unchanged: the guard coerces.
--
-- End to end: book a job (carries the technician placeholder), assign it to
-- a pro with an override, and confirm jobs.commission_rate became the
-- override. Assign another to a technician inside a company and confirm it
-- became the BUSINESS default, not the technician one. Then change the
-- defaults and confirm both EXISTING jobs still show the old rates — frozen,
-- like tech_share.
--
-- EXISTING ROWS: every job already in the table keeps the commission_rate it
-- was stamped with, and every provider/business starts with a null override,
-- so this patch changes no money that has already been agreed.
