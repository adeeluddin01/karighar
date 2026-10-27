-- ============================================================
-- KARIGHAR — Database schema (complete)
-- Postgres / Supabase. Run in the Supabase SQL editor.
-- Home-services marketplace: Karachi, services-only, COD, hybrid pricing.
--
-- This is the WHOLE schema. On a fresh project run only this file — every
-- patch up to and including patch_v22 is already folded in. The
-- supabase/patch_v*.sql files exist only to bring an OLDER database forward,
-- in numeric order.
--
-- Folded in here: v2 (job RLS, rating trigger, verification bucket),
-- v3 (realtime), v4 (notifications, price/status/review integrity, COD
-- ledger), v5 (settlements, dispute admin), v6 (price lock, booking
-- rate-limit), v7 (public provider view, cancel_reason), v8 (no admin
-- self-escalation), v9 (job visibility fix), v10 (status-notify enum cast),
-- v11 (provider PII lockdown), v12 (provider->customer ratings, signup
-- role/phone metadata, chat notifications), v13 (restores notifications
-- layer), v14 (house promo banners), v15 (5 new service categories:
-- carpenter, painter, solar panel cleaning, camera installation, washing
-- machine repair), v16 (a customer sees the pro on their own job/bid at any
-- status), v17 (SECURITY: verification + reputation columns are no longer
-- self-writable), v18 (business accounts: technicians beneath a dispatcher),
-- v19 (a quote can only be set once the pro has arrived), v20 (admins can
-- resolve the email behind an account, for search), v21 (financial
-- integrity: actor guard on jobs, reversals, settlement caps, reconciliation),
-- v22 (a business is a located trading entity: CNIC, address and premises
-- coordinates recorded by the admin who grants the account, plus
-- business_services and the public views that put companies on the map),
-- v23 (public `avatars` bucket, so a profile picture can actually be
-- uploaded — profiles.avatar_url had no writer and no bucket), v24
-- (commission: platform defaults per account kind and job type, plus a
-- per-technician/per-business override, resolved and frozen when the
-- provider is stamped).
-- ============================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- ---------- Enums ----------
-- 'business' is a dispatcher that assigns jobs to technicians on its team.
-- It is granted by Karighar, never self-selected: handle_new_user() whitelists
-- signup metadata to provider-or-customer, and profiles_guard_role() blocks
-- the value on update.
create type user_role       as enum ('customer', 'provider', 'admin', 'business');
create type provider_status as enum ('pending', 'approved', 'suspended', 'rejected');
create type business_status   as enum ('active', 'suspended');
create type membership_status as enum ('invited', 'active', 'declined', 'removed');
create type job_type        as enum ('fixed', 'custom');
create type job_status       as enum (
  'created',      -- customer created it
  'bidding',      -- custom job open for bids
  'assigned',     -- provider assigned / accepted
  'en_route',     -- provider on the way
  'arrived',      -- provider at location
  'in_progress',  -- work happening
  'completed',    -- work done, awaiting payment
  'paid',         -- COD collected
  'rated',        -- customer left review
  'cancelled',
  'disputed'
);
create type bid_status     as enum ('pending', 'awarded', 'rejected');
create type payment_method as enum ('cod');          -- v1: cash only
create type payment_status as enum ('pending', 'collected', 'settled', 'refunded');
-- 'business_share' is the technician<->business leg of a dispatched job: what
-- the technician owes their business out of the cash they collected, and the
-- matching receivable on the business. It is deliberately NOT 'commission'
-- (which means "owed to Karighar" and is what /admin/settlements chases) and
-- not 'adjustment' (which summarizeLedger counts as already settled).
create type ledger_type    as enum ('earning', 'commission', 'payout', 'adjustment', 'business_share');

-- ============================================================
-- Profiles  (1:1 with auth.users)
-- ============================================================
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        user_role not null default 'customer',
  full_name   text,
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create table customers (
  profile_id      uuid primary key references profiles(id) on delete cascade,
  default_address text,
  lat             double precision,
  lng             double precision,
  -- Provider->customer ratings. `jobs_rated` is the count of ratings
  -- received; cf. providers.jobs_completed, which despite its name is also a
  -- review count.
  rating_avg      numeric(2,1) not null default 0,
  jobs_rated      int not null default 0
);

-- Platform-wide knobs. Single row: `id` is a boolean pinned true by a check,
-- so a second row cannot exist and every reader can say `where id`.
-- Four rates, not one: Karighar charges a solo technician and a dispatching
-- company on different terms, and a catalogue booking on different terms
-- from an on-site quote. Edited on the Providers and Businesses admin tabs
-- respectively, beside the accounts each one governs.
create table platform_settings (
  id              boolean primary key default true check (id),
  provider_fixed  numeric(4,3) not null default 0.200,
  provider_custom numeric(4,3) not null default 0.150,
  business_fixed  numeric(4,3) not null default 0.200,
  business_custom numeric(4,3) not null default 0.150,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references profiles(id) on delete set null,
  constraint platform_rates_range check (
    provider_fixed  between 0 and 1 and provider_custom between 0 and 1 and
    business_fixed  between 0 and 1 and business_custom between 0 and 1
  )
);
insert into platform_settings (id) values (true) on conflict (id) do nothing;

create table providers (
  profile_id     uuid primary key references profiles(id) on delete cascade,
  cnic_no        text,
  cnic_front_url text,
  cnic_back_url  text,
  selfie_url     text,
  status         provider_status not null default 'pending',
  bio            text,
  rating_avg     numeric(2,1) not null default 0,
  jobs_completed int not null default 0,
  service_areas  jsonb not null default '[]'::jsonb,  -- e.g. ["Gulshan","DHA"]
  verified_at    timestamptz,
  -- Karighar's cut for this one pro. Null = the platform default for the job
  -- type (platform_settings below). Admin-owned: providers_guard_trusted_cols
  -- coerces it back, or a pro would simply set their own commission to zero.
  commission_rate numeric(4,3)
                  check (commission_rate is null
                         or (commission_rate >= 0 and commission_rate <= 1))
);

-- ============================================================
-- Businesses  (a dispatcher with technicians beneath it)
-- ============================================================
-- A satellite table rather than columns on `profiles`, for the same reason
-- `providers` is one: profiles_upd lets a user update their own profiles row,
-- so anything there is self-writable. THIS row — not role = 'business' — is
-- the real gate, exactly as providers.status (not role = 'provider') is what
-- actually gates the pro area.
--
-- No CNIC columns: a business is a dispatcher and never works a job, so it
-- carries no identity verification of its own. Every technician beneath it is
-- still individually verified through /pro/onboarding and admin approval.
-- Name, phone and avatar stay on `profiles` and are not duplicated here.
create table businesses (
  profile_id     uuid primary key references profiles(id) on delete cascade,
  status         business_status not null default 'active',
  about          text,
  service_areas  jsonb not null default '[]'::jsonb,
  -- A business is a real trading entity: a CNIC behind it and premises it
  -- operates from. Both are recorded by the admin who grants the account —
  -- there is no self-service signup, so there is nothing to approve after
  -- the fact. businesses_guard_trusted_cols keeps them admin-owned.
  cnic_no          text,
  cnic_front_url   text,
  cnic_back_url    text,
  owner_selfie_url text,
  verified_at      timestamptz,
  address          text,
  lat              double precision,
  lng              double precision,
  -- Karighar's cut for this one company. Null = the platform default. On a
  -- dispatched job the BUSINESS is billed, so this is the rate that applies
  -- and the technician's own override is irrelevant.
  commission_rate numeric(4,3)
                  check (commission_rate is null
                         or (commission_rate >= 0 and commission_rate <= 1)),
  rating_avg     numeric(2,1) not null default 0,   -- trigger-maintained
  jobs_completed int not null default 0,            -- trigger-maintained
  created_at     timestamptz not null default now()
);

-- Membership + invite state + the split rate.
--
-- A table rather than a `providers.business_id` column: a column there would
-- be self-writable under prov_self, so a technician could null it out to
-- re-enter the open pool or point it at someone else's business. A separate
-- table is also the only way to give the two sides different rights over
-- different columns of the same relationship, and it carries the invite
-- state a column cannot.
--
-- provider_id -> providers(profile_id) structurally guarantees that only a
-- real, individually-verified provider can ever be a team member.
create table business_members (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(profile_id) on delete cascade,
  provider_id  uuid not null references providers(profile_id)  on delete cascade,
  status       membership_status not null default 'invited',
  -- Fraction of the job price the TECHNICIAN keeps. The business keeps the
  -- rest and pays Karighar's commission out of its side.
  tech_share   numeric(4,3) not null default 0.700
               check (tech_share >= 0 and tech_share <= 1),
  invited_by   uuid references profiles(id),
  invited_at   timestamptz not null default now(),
  responded_at timestamptz,
  removed_at   timestamptz,
  -- Re-invites are state transitions on one row, so a decline stays on record.
  unique (business_id, provider_id)
);
create index business_members_provider_idx on business_members(provider_id, status);
create index business_members_business_idx on business_members(business_id, status);
-- Structural teeth for the open-pool lockout: at most one active business per
-- technician, enforced by the database even if a policy or RPC is ever wrong.
create unique index business_members_one_active
  on business_members(provider_id) where (status = 'active');

-- What a business covers — the counterpart of provider_services.
create table business_services (
  business_id uuid references businesses(profile_id) on delete cascade,
  service_id  uuid references services(id) on delete cascade,
  primary key (business_id, service_id)
);

-- ============================================================
-- Catalog
-- ============================================================
create table service_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  icon       text,
  sort_order int not null default 0,
  is_active  boolean not null default true
);

create table services (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references service_categories(id) on delete cascade,
  name        text not null,
  description text,
  base_price  numeric(10,2),        -- null = quote/custom
  unit        text not null default 'job',  -- 'unit','visit','sq ft','item','job'
  visit_fee   numeric(10,2) not null default 0,
  is_active   boolean not null default true
);

create table provider_services (
  provider_id uuid references providers(profile_id) on delete cascade,
  service_id  uuid references services(id) on delete cascade,
  primary key (provider_id, service_id)
);

-- ============================================================
-- Jobs
-- ============================================================
create table jobs (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references customers(profile_id) on delete cascade,
  type            job_type not null,
  service_id      uuid references services(id),        -- null for fully custom
  title           text not null,
  description     text,
  photos          jsonb not null default '[]'::jsonb,
  status          job_status not null default 'created',
  address         text not null,
  lat             double precision,
  lng             double precision,
  scheduled_at    timestamptz,
  price           numeric(10,2),                        -- final agreed price
  -- Whoever is actually DOING this job, and whom the customer deals with —
  -- for a dispatched job that is the assigned technician, not the business.
  -- Keeping this meaning is what lets chat, the call button, GPS tracking,
  -- profiles_job_peer, the status machine and jobs_update_provider carry on
  -- unchanged for business work.
  provider_id     uuid references providers(profile_id),
  commission_rate numeric(4,3) not null default 0.20,   -- 0.20 fixed, 0.15 custom
  -- The dispatcher, recorded ALONGSIDE the technician. Both are stamped by
  -- jobs_stamp_business() and FROZEN here at assignment: membership and the
  -- split rate can change before the job is paid, and jobs_on_paid must use
  -- the terms that were in force when the work was handed out. Same principle
  -- as commission_rate above, which is likewise a frozen column, not a lookup.
  --
  -- NO ACTION on delete, exactly like provider_id above: a job's financial
  -- history must not be rewritten by someone deleting an account, so the
  -- delete is refused instead. (SET NULL would also fight jobs_stamp_business,
  -- which restores this column on every update, and trip the pair check
  -- below by nulling one half.)
  business_id     uuid references businesses(profile_id),
  tech_share      numeric(4,3),
  cancel_reason   text,                                 -- why it was cancelled (admin/support)
  constraint jobs_price_non_negative check (price is null or price >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Makes the money branch in jobs_on_paid a single null test.
  constraint jobs_business_share_pair
    check ((business_id is null) = (tech_share is null))
);
create index jobs_customer_idx on jobs(customer_id);
create index jobs_provider_idx on jobs(provider_id);
create index jobs_status_idx   on jobs(status);
create index jobs_business_idx on jobs(business_id);

create table bids (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references jobs(id) on delete cascade,
  provider_id uuid not null references providers(profile_id) on delete cascade,
  amount      numeric(10,2) not null,
  note        text,
  eta_minutes int,
  status      bid_status not null default 'pending',
  created_at  timestamptz not null default now(),
  unique (job_id, provider_id)
);

create table job_tracking (
  job_id       uuid primary key references jobs(id) on delete cascade,
  provider_lat double precision,
  provider_lng double precision,
  updated_at   timestamptz not null default now()
);

create table payments (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references jobs(id) on delete cascade,
  amount          numeric(10,2) not null,
  method          payment_method not null default 'cod',
  commission      numeric(10,2) not null default 0,
  provider_payout numeric(10,2) not null default 0,
  status          payment_status not null default 'pending',
  created_at      timestamptz not null default now(),
  -- One payment per job, enforced by the database rather than by a
  -- read-then-write inside jobs_on_paid.
  unique (job_id)
);

create table reviews (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references jobs(id) on delete cascade unique,
  customer_id uuid not null references customers(profile_id) on delete cascade,
  provider_id uuid not null references providers(profile_id) on delete cascade,
  rating      int not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
);

-- The other direction: the provider rates the customer. A separate table
-- rather than a column on `reviews`, whose unique `job_id` and triggers are
-- load-bearing. Here `provider_id` is the author and `customer_id` the subject.
create table customer_reviews (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references jobs(id) on delete cascade unique,
  provider_id uuid not null references providers(profile_id) on delete cascade,
  customer_id uuid not null references customers(profile_id) on delete cascade,
  rating      int not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
);
create index customer_reviews_customer_idx on customer_reviews(customer_id);
create index customer_reviews_provider_idx on customer_reviews(provider_id);

create table messages (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references jobs(id) on delete cascade,
  sender_id  uuid not null references profiles(id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now()
);
create index messages_job_idx on messages(job_id);

create table provider_ledger (
  id          uuid primary key default gen_random_uuid(),
  -- "the account this line belongs to" — a technician OR a business. It
  -- points at `profiles`, not `providers`, because a dispatcher-only business
  -- has no providers row yet must hold the commission it owes Karighar. The
  -- column keeps its historical name: renaming would ripple through
  -- ledger_self, jobs_on_paid, record_settlement, /pro/history and
  -- /admin/settlements for no functional gain.
  provider_id uuid not null references profiles(id) on delete cascade,
  job_id      uuid references jobs(id) on delete set null,
  type        ledger_type not null,
  amount      numeric(10,2) not null,   -- +earning, -commission owed on COD
  balance     numeric(10,2) not null default 0,
  created_at  timestamptz not null default now()
);

create table disputes (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references jobs(id) on delete cascade,
  raised_by  uuid not null references profiles(id),
  reason     text not null,
  status     text not null default 'open',
  resolution text,
  created_at timestamptz not null default now()
);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  job_id     uuid references jobs(id) on delete cascade,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, read);

-- Karighar's own promo banners. Content lives here so marketing copy can be
-- changed from the table editor without a redeploy, which a static export
-- would otherwise need.
create table house_promos (
  id         uuid primary key default gen_random_uuid(),
  audience   text not null default 'provider'
             check (audience in ('provider', 'customer', 'all')),
  eyebrow    text,
  title      text not null,
  body       text,
  cta_label  text,
  href       text,
  priority   int not null default 0,     -- highest wins when several are live
  is_active  boolean not null default true,
  starts_at  timestamptz,
  ends_at    timestamptz,
  created_at timestamptz not null default now()
);
create index house_promos_live_idx on house_promos(audience, is_active, priority desc);

-- ============================================================
-- Helpers & triggers
-- ============================================================
-- Auto-create a profile row when a new auth user signs up.
-- Name, phone AND role all arrive in raw_user_meta_data from signUp(): with
-- email confirmation on there is no session, so the client cannot write them
-- to `profiles` afterwards.
--
-- The role is whitelisted. Metadata is client-controlled and
-- profiles_guard_role() below is an UPDATE trigger, so it does not protect
-- this INSERT — without the whitelist anyone could sign up as an admin.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    case
      when new.raw_user_meta_data->>'role' = 'provider' then 'provider'::user_role
      else 'customer'::user_role
    end,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.phone, new.raw_user_meta_data->>'phone')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- keep jobs.updated_at fresh
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger jobs_touch before update on jobs
  for each row execute function touch_updated_at();

-- is current user an admin?
create or replace function is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- …a live business account?
create or replace function is_active_business()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from businesses b
                 where b.profile_id = auth.uid() and b.status = 'active');
$$;

-- …a technician who works for one? Such a technician is locked out of the
-- open job pool: their work arrives only through their business.
create or replace function is_attached_tech()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from business_members m
                 join businesses b on b.profile_id = m.business_id
                 where m.provider_id = auth.uid()
                   and m.status = 'active' and b.status = 'active');
$$;

-- Recompute a provider's rating + completed count when reviews change — and,
-- if the job was dispatched by a business, that business's too.
--
-- The review itself still attaches to the TECHNICIAN who did the work. The
-- business aggregate is JOB-SCOPED: only reviews on jobs this business
-- actually dispatched. Scoping it to current members instead would be
-- gameable (invite one 5-star pro, never dispatch them, inherit the rating)
-- and would make a business's public rating lurch whenever someone left.
create or replace function on_review_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.provider_id, old.provider_id);
        bid uuid;
begin
  update providers set
    rating_avg = coalesce((select round(avg(rating)::numeric, 1) from reviews where provider_id = pid), 0),
    jobs_completed = (select count(*) from reviews where provider_id = pid)
  where profile_id = pid;

  select j.business_id into bid from jobs j
   where j.id = coalesce(new.job_id, old.job_id);

  if bid is not null then
    update businesses set
      rating_avg = coalesce((select round(avg(r.rating)::numeric, 1)
                               from reviews r join jobs j2 on j2.id = r.job_id
                              where j2.business_id = bid), 0),
      jobs_completed = (select count(*) from reviews r join jobs j2 on j2.id = r.job_id
                         where j2.business_id = bid)
    where profile_id = bid;
  end if;
  return new;
end;
$$;
create trigger reviews_aggregate after insert or update or delete on reviews
  for each row execute function on_review_change();

-- Same, for the provider->customer direction.
create or replace function on_customer_review_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare cid uuid := coalesce(new.customer_id, old.customer_id);
begin
  update customers set
    rating_avg = coalesce(
      (select round(avg(rating)::numeric, 1) from customer_reviews where customer_id = cid), 0),
    jobs_rated = (select count(*) from customer_reviews where customer_id = cid)
  where profile_id = cid;
  return new;
end;
$$;
create trigger customer_reviews_aggregate after insert or update or delete on customer_reviews
  for each row execute function on_customer_review_change();

-- Block role self-escalation: a normal user may switch between customer and
-- provider (signup / onboarding do that), but may not grant or remove 'admin'
-- or 'business'. Service-role writes (auth.uid() is null) and admins are
-- unaffected.
--
-- Belt-and-braces only, for both guarded values: the real gates are the
-- `providers.status`/`businesses.status` rows, which this file makes
-- admin-write-only. Nothing keys off `role` alone.
create or replace function profiles_guard_role()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not is_admin()
     and (new.role in ('admin','business') or old.role in ('admin','business')) then
    raise exception 'You are not allowed to change that role';
  end if;
  return new;
end; $$;
create trigger profiles_before_update_role before update on profiles
  for each row when (old.role is distinct from new.role)
  execute function profiles_guard_role();

-- ---------- Verification + reputation are platform-owned (patch_v17) ----------
-- RLS is row-level, not column-level, so `prov_self`/`cust_self` (both `for
-- all`) let the owner write EVERY column of their own row. Without the guards
-- below a self-registered provider can run
--
--     update providers set status = 'approved' where profile_id = auth.uid();
--
-- and skip admin verification entirely — jobs_select and jobs_claim gate the
-- open pool on exactly that column — or publish a fabricated 5.0 rating
-- through public_provider_profiles. `customers` has the identical hole, and
-- public_customer_ratings shows those numbers to a pro deciding whether to
-- take a job.
--
-- They COERCE rather than raise, for two reasons. /pro/onboarding upserts
-- `status: 'pending'` unconditionally on every save, so raising would turn
-- that form into a hard error for every pro; and coercing fixes a live bug in
-- passing — today an APPROVED pro who edits their bio silently demotes
-- themselves and loses the dashboard until an admin re-approves. INSERT is
-- guarded as well as UPDATE because that call is an upsert.
--
-- The escape keys on `current_user`, NOT auth.uid(). on_review_change() and
-- on_customer_review_change() are SECURITY DEFINER triggers that legitimately
-- write these columns; SECURITY DEFINER changes `current_user` to the function
-- owner but leaves `auth.uid()` as the reviewing customer's (it reads a JWT
-- claim). An auth.uid()-based escape would therefore coerce every aggregate
-- back to OLD and freeze every rating in the system forever.
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
    -- What Karighar charges them is Karighar's to set, not theirs.
    new.commission_rate := old.commission_rate;
  end if;
  return new;
end; $$;
create trigger providers_guard_cols before insert or update on providers
  for each row execute function providers_guard_trusted_cols();

create or replace function customers_guard_trusted_cols()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user is distinct from 'authenticated' then return new; end if;
  if is_admin() then return new; end if;

  if tg_op = 'INSERT' then
    new.rating_avg := 0;
    new.jobs_rated := 0;
  else
    new.rating_avg := old.rating_avg;
    new.jobs_rated := old.jobs_rated;
  end if;
  return new;
end; $$;
create trigger customers_guard_cols before insert or update on customers
  for each row execute function customers_guard_trusted_cols();

-- Same shape for `businesses`: it holds rating_avg/jobs_completed too, so
-- without this the guards above would be undone by a new self-writable
-- reputation field. INSERT raises rather than coerces — unlike onboarding,
-- nothing in the app ever self-creates one of these rows.
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
create trigger businesses_guard_cols before insert or update on businesses
  for each row execute function businesses_guard_trusted_cols();

-- Defence in depth: even an admin UI slip cannot move a membership between
-- accounts or produce a nonsense invite transition.
create or replace function business_members_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.business_id is distinct from old.business_id
       or new.provider_id is distinct from old.provider_id then
      raise exception 'A membership cannot be moved between accounts';
    end if;
    if new.status is distinct from old.status and not (
         (old.status = 'invited' and new.status in ('active','declined','removed'))
      or (old.status = 'active'  and new.status = 'removed')
      or (old.status in ('declined','removed') and new.status = 'invited')
    ) then
      raise exception 'Illegal membership change: % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end; $$;
create trigger business_members_guard_t before insert or update on business_members
  for each row execute function business_members_guard();

-- ---------- Notifications ----------
create or replace function notify_user(p_user uuid, p_type text, p_title text, p_body text, p_job uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into notifications(user_id, type, title, body, job_id)
  values (p_user, p_type, p_title, p_body, p_job);
end; $$;

-- ---------- Price / commission integrity on job creation ----------
-- Price and commission are derived from the catalog, never trusted from the
-- client, plus a simple anti-spam cap on bookings per customer.
-- ---------- Commission resolution ----------
-- Two levels: a platform default per job type, and an optional per-account
-- override on providers/businesses. Null override = follow the default, so
-- an account an admin never touches behaves exactly as before.
-- `p_scope` is 'provider' or 'business'. Defaults to 'provider' because the
-- one caller that cannot know yet — jobs_enforce_insert, at booking time —
-- is stamping a placeholder for a job nobody is assigned to.
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

-- Whose rate applies follows who is BILLED. On a dispatched job Karighar
-- bills the business, so a technician override on an attached tech is
-- correctly ignored — they are not the one paying it.
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
create trigger jobs_before_insert before insert on jobs
  for each row execute function jobs_enforce_insert();

-- ---------- Price immutability ----------
-- A price can be set once (null -> value). Changing one the customer already
-- agreed to is blocked; admin excepted.
-- A quote may only be given from on site. `jobs_update_provider` lets the
-- assigned pro write every column of their own job, so hiding the field in
-- /pro/jobs/view is cosmetic — the rule belongs next to the price.
--
-- Keyed on `auth.uid() = new.provider_id` so it catches the PRO pricing their
-- own job but not the CUSTOMER awarding a bid, which legitimately writes
-- price + status='assigned' in one update. Null auth.uid() (service role,
-- seeds) makes the comparison NULL, so those pass; admins return early.
create or replace function jobs_lock_price()
returns trigger language plpgsql set search_path = public as $$
begin
  if is_admin() then return new; end if;

  if new.price is distinct from old.price and old.price is not null then
    raise exception 'Price is locked once it has been set';
  end if;

  if old.price is null
     and new.price is not null
     and auth.uid() = new.provider_id
     and new.status not in ('arrived', 'in_progress') then
    raise exception 'Mark yourself arrived before setting the price for this job';
  end if;

  return new;
end; $$;
create trigger jobs_before_update_price before update on jobs
  for each row when (new.price is distinct from old.price)
  execute function jobs_lock_price();

-- ---------- Status-transition state machine ----------
create or replace function jobs_enforce_status()
returns trigger language plpgsql set search_path = public as $$
declare ok boolean;
begin
  if is_admin() then return new; end if;   -- admin can override
  ok := case old.status
    when 'created'     then new.status in ('assigned','cancelled')
    when 'bidding'     then new.status in ('assigned','cancelled')
    when 'assigned'    then new.status in ('en_route','cancelled')
    when 'en_route'    then new.status in ('arrived','cancelled')
    when 'arrived'     then new.status in ('in_progress','cancelled')
    when 'in_progress' then new.status in ('completed','cancelled')
    when 'completed'   then new.status in ('paid','disputed')
    when 'paid'        then new.status in ('rated','disputed')
    else false end;
  if not ok then
    raise exception 'Illegal status change: % -> %', old.status, new.status;
  end if;
  return new;
end; $$;
create trigger jobs_before_update_status before update on jobs
  for each row when (old.status is distinct from new.status)
  execute function jobs_enforce_status();

-- `jobs_enforce_status` says which transitions exist. This says who may make
-- them, and that a customer awarding a quote must be awarding a real one.
--
-- Actor map, taken from what the app actually does today rather than invented:
--   created/bidding -> assigned   customer awarding a bid, or a pro claiming
--   assigned -> ... -> completed  the assigned pro only
--   completed -> paid             either party (in COD both know the cash moved)
--   paid -> rated                 the customer, who writes the review
--   -> cancelled / disputed       either party
--
-- A null auth.uid() passes through untouched: that is the service role, the
-- seed scripts, and SECURITY DEFINER RPCs such as business_assign_job, which
-- do their own authorisation.
create or replace function jobs_guard_actor()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); ok boolean;
begin
  if uid is null or is_admin() then return new; end if;

  -- ========== the customer ==========
  if uid = old.customer_id then
    -- Awarding a quote. The provider AND the amount must both come from a
    -- live bid on THIS job, so a customer cannot name a pro who never
    -- quoted, nor accept at a figure the pro never offered.
    if new.provider_id is distinct from old.provider_id
       or new.price is distinct from old.price then
      if new.provider_id is null then
        raise exception 'A job cannot be unassigned';
      end if;
      select exists (
        select 1 from bids b
        where b.job_id = new.id
          and b.provider_id = new.provider_id
          and b.amount = new.price
          and b.status in ('pending', 'awarded')
      ) into ok;
      if not ok then
        raise exception 'That quote is not on offer for this job';
      end if;
    end if;

    if new.status is distinct from old.status
       and new.status not in ('assigned', 'cancelled', 'paid', 'rated', 'disputed') then
      raise exception 'Only the assigned pro can move a job to %', new.status;
    end if;
    return new;
  end if;

  -- ========== the assigned pro (or one claiming an open job) ==========
  if uid = new.provider_id then
    if new.customer_id is distinct from old.customer_id then
      raise exception 'A job cannot be moved to another customer';
    end if;
    if new.status is distinct from old.status
       and new.status not in ('assigned', 'en_route', 'arrived', 'in_progress',
                              'completed', 'paid', 'cancelled', 'disputed') then
      raise exception 'A pro cannot move a job to %', new.status;
    end if;
    return new;
  end if;

  return new;
end; $$;

-- Runs after jobs_enforce_status (alphabetical among BEFORE triggers), so the
-- transition is already known to be legal by the time the actor is checked.
drop trigger if exists jobs_guard_actor_t on jobs;
create trigger jobs_guard_actor_t before update on jobs
  for each row execute function jobs_guard_actor();


-- ---------- Review integrity ----------
create or replace function reviews_enforce()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from jobs j
    where j.id = new.job_id
      and j.customer_id = auth.uid()
      and j.provider_id = new.provider_id
      and j.status in ('completed','paid','rated')
  ) then
    raise exception 'You can only review your own completed job';
  end if;
  return new;
end; $$;
create trigger reviews_before_insert before insert on reviews
  for each row execute function reviews_enforce();

-- Mirror, with the parties swapped. 'rated' is in the list because the
-- customer's own review already moved the job there — whoever rates second
-- must still be allowed to. This is deliberately decoupled from jobs.status:
-- 'rated' is terminal in the status machine, so the provider's rating must
-- not try to advance it.
create or replace function customer_reviews_enforce()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from jobs j
    where j.id = new.job_id
      and j.provider_id = auth.uid()
      and j.customer_id = new.customer_id
      and j.status in ('completed','paid','rated')
  ) then
    raise exception 'You can only rate the customer of your own completed job';
  end if;
  return new;
end; $$;
create trigger customer_reviews_before_insert before insert on customer_reviews
  for each row execute function customer_reviews_enforce();

-- ---------- Payment + provider ledger on completion (COD) ----------
-- The customer pays cash on site, so whoever did the work holds the full
-- amount and OWES the platform its commission.
--
-- For a job dispatched by a business, that debt is the BUSINESS's: Karighar
-- bills the dispatcher, and the technician settles with their own business at
-- the rate the two of them agreed. There is still exactly ONE 'commission'
-- row per job either way — Karighar's take is unchanged, it just lands on a
-- different account — so /admin/settlements and record_settlement work on a
-- business with no changes at all.
create or replace function jobs_on_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare amt numeric; commission numeric; payout numeric;
        tech_cut numeric; biz_cut numeric; booked int;
begin
  amt        := coalesce(new.price, 0);
  commission := round(amt * new.commission_rate, 2);
  payout     := amt - commission;

  -- `provider_payout` means what the PERSON WHO DID THE WORK ends up with.
  -- On a dispatched job that is their agreed share: the commission is the
  -- business's bill, not theirs.
  if new.business_id is not null then
    payout := round(amt * coalesce(new.tech_share, 0), 2);
  end if;

  -- The unique constraint is the authority now; the read is gone. If a row
  -- already exists this books nothing and returns, so a re-entry (an admin
  -- moving disputed -> paid, say) cannot double-charge.
  insert into payments(job_id, amount, method, commission, provider_payout, status)
    values (new.id, amt, 'cod', commission, payout, 'collected')
    on conflict (job_id) do nothing;
  get diagnostics booked = row_count;
  if booked = 0 then return new; end if;

  if new.provider_id is null then return new; end if;

  if new.business_id is null then
    insert into provider_ledger(provider_id, job_id, type, amount, balance) values
      (new.provider_id, new.id, 'earning',    payout,      0),
      (new.provider_id, new.id, 'commission', -commission, 0);
    return new;
  end if;

  tech_cut := payout;
  biz_cut  := amt - tech_cut;

  insert into provider_ledger(provider_id, job_id, type, amount, balance) values
    (new.provider_id, new.id, 'earning',        tech_cut,    0),
    (new.provider_id, new.id, 'business_share', -biz_cut,    0),
    (new.business_id, new.id, 'business_share', biz_cut,     0),
    (new.business_id, new.id, 'commission',     -commission, 0);
  return new;
end; $$;
create trigger jobs_after_paid after update on jobs
  for each row when (new.status = 'paid' and old.status is distinct from 'paid')
  execute function jobs_on_paid();

-- ---------- Which business (if any) a job belongs to ----------
-- Gating jobs_select/jobs_claim is NOT sufficient on its own, because the
-- CUSTOMER writes provider_id directly when awarding a bid
-- (src/app/bookings/view/*.tsx):
--
--     .update({ provider_id: bid.provider_id, price: bid.amount, status: 'assigned' })
--
-- jobs_update_customer only constrains customer_id, so that write may name
-- ANY provider. Without this trigger an attached technician with a stale
-- pending bid would still get assigned straight through the lockout, and
-- business_id/tech_share would stay null so jobs_on_paid above would take the
-- independent branch and bill the TECHNICIAN for Karighar's commission —
-- with nothing raising an error.
--
-- So the money facts are derived HERE, in one place, for every path that ever
-- sets provider_id: the assign RPC, a customer awarding a bid, an admin, or
-- any surface added later. Both columns stay null for an independent pro, so
-- their behaviour is untouched.
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

  -- The rate this account actually gets, frozen onto the job from here on —
  -- raising it tomorrow must not re-price work already done.
  if not admin_set then
    new.commission_rate := resolve_commission_rate(new.provider_id, biz, new.type);
  end if;
  return new;
end; $$;
create trigger jobs_stamp_business_t before insert or update on jobs
  for each row execute function jobs_stamp_business();

-- Admin records a commission settlement (the Pro — or the business —
-- remitted it).
create or replace function commission_outstanding(p_account uuid)
returns numeric language sql security definer stable set search_path = public as $$
  select round(coalesce(sum(
    case when type = 'commission'            then abs(amount)
         when type in ('payout','adjustment') then -amount
         else 0 end), 0), 2)
  from provider_ledger where provider_id = p_account;
$$;

create or replace function record_settlement(p_provider uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare owed numeric;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;

  -- Was unbounded. summarizeLedger clamps commissionOwed at zero, so an
  -- overshoot showed as a clean settled balance rather than a credit — which
  -- meant arbitrary commission debt could be extinguished with no visible
  -- trace. The half-paisa tolerance absorbs numeric(10,2) rounding.
  owed := commission_outstanding(p_provider);
  if p_amount > owed + 0.005 then
    raise exception 'That is more than the % outstanding on this account', round(owed, 2);
  end if;

  insert into provider_ledger(provider_id, job_id, type, amount, balance)
  values (p_provider, null, 'payout', p_amount, 0);
end; $$;

create or replace function record_settlement(p_provider uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare owed numeric;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;

  -- Was unbounded. summarizeLedger clamps commissionOwed at zero, so an
  -- overshoot showed as a clean settled balance rather than a credit — which
  -- meant arbitrary commission debt could be extinguished with no visible
  -- trace. The half-paisa tolerance absorbs numeric(10,2) rounding.
  owed := commission_outstanding(p_provider);
  if p_amount > owed + 0.005 then
    raise exception 'That is more than the % outstanding on this account', round(owed, 2);
  end if;

  insert into provider_ledger(provider_id, job_id, type, amount, balance)
  values (p_provider, null, 'payout', p_amount, 0);
end; $$;

-- `profiles` has no email column — the address lives in auth.users, which the
-- anon key cannot read. This lets an ADMIN resolve the email behind accounts
-- they are already looking at, so /admin/providers and /admin/businesses can
-- be searched by it. It takes ids, never a search string: a lookup keyed on
-- an email would answer "does this person have an account here?" for anyone
-- who could reach it. The cap stops it becoming an export endpoint.
create or replace function admin_emails(p_ids uuid[])
returns table (id uuid, email text)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if p_ids is null or array_length(p_ids, 1) is null then return; end if;
  if array_length(p_ids, 1) > 500 then
    raise exception 'Too many ids in one lookup';
  end if;

  return query
    select u.id, u.email::text
    from auth.users u
    where u.id = any(p_ids);
end; $$;

revoke all on function admin_emails(uuid[]) from public;
grant execute on function admin_emails(uuid[]) to authenticated, service_role;

-- ============================================================
-- Business RPCs
-- ============================================================
-- Every membership and dispatch write goes through one of these, which is
-- why business_members has no insert/update/delete policy for `authenticated`
-- at all: a technician cannot flip their own membership to escape the
-- lockout, and a business cannot touch a row that is not theirs.
--
-- SECURITY DEFINER, matching record_settlement above: the authorization check
-- lives inside, in one auditable place. auth.uid() still returns the CALLER
-- inside a definer function (it reads a JWT claim, not the DB role), which is
-- what makes that safe. Each one therefore validates every condition
-- explicitly, because it runs past RLS by design.

-- Admin grants a business account. Refuses an approved provider: a business
-- is a dispatcher and never works jobs, and roleOf() resolves 'business'
-- ahead of 'provider', so granting one to a working pro would strip them of
-- their own dashboard.
create or replace function grant_business_account(
  p_profile uuid,
  p_cnic    text,
  p_address text,
  p_lat     double precision,
  p_lng     double precision
)
returns void language plpgsql security definer set search_path = public as $$
declare digits text;
begin
  if not is_admin() then raise exception 'admins only'; end if;

  if exists (select 1 from providers p
             where p.profile_id = p_profile and p.status = 'approved') then
    raise exception 'That account is an approved technician. A business is a dispatcher and cannot also work jobs.';
  end if;

  digits := regexp_replace(coalesce(p_cnic, ''), '\D', '', 'g');
  if length(digits) <> 13 then
    raise exception 'A business needs the owner''s 13-digit CNIC';
  end if;
  if coalesce(btrim(p_address), '') = '' then
    raise exception 'A business needs the address of its premises';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'A business needs its premises pinned on the map';
  end if;

  insert into businesses(profile_id, status, cnic_no, address, lat, lng, verified_at)
  values (p_profile, 'active', btrim(p_cnic), btrim(p_address), p_lat, p_lng, now())
  on conflict (profile_id) do update
    set status      = 'active',
        cnic_no     = excluded.cnic_no,
        address     = excluded.address,
        lat         = excluded.lat,
        lng         = excluded.lng,
        verified_at = now();

  update profiles set role = 'business' where id = p_profile;
end; $$;

create or replace function update_business_details(
  p_profile uuid,
  p_cnic    text,
  p_address text,
  p_lat     double precision,
  p_lng     double precision
)
returns void language plpgsql security definer set search_path = public as $$
declare digits text;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if not exists (select 1 from businesses where profile_id = p_profile) then
    raise exception 'No such business';
  end if;

  digits := regexp_replace(coalesce(p_cnic, ''), '\D', '', 'g');
  if length(digits) <> 13 then raise exception 'Enter the owner''s 13-digit CNIC'; end if;
  if coalesce(btrim(p_address), '') = '' then raise exception 'Enter the premises address'; end if;
  if p_lat is null or p_lng is null then raise exception 'Pin the premises on the map'; end if;

  update businesses
     set cnic_no = btrim(p_cnic), address = btrim(p_address),
         lat = p_lat, lng = p_lng, verified_at = now()
   where profile_id = p_profile;
end; $$;

create or replace function set_business_status(p_profile uuid, p_status business_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  update businesses set status = p_status where profile_id = p_profile;
end; $$;

-- ---------- Commission, as the admin sets it ----------
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

-- Invite an existing, approved technician by phone. The lookup lives in here
-- precisely so `profiles` needs no search policy.
create or replace function business_invite_technician(p_phone text, p_share numeric default 0.700)
returns uuid language plpgsql security definer set search_path = public as $$
declare biz uuid := auth.uid(); tech uuid; mid uuid; biz_name text; digits text;
begin
  if not is_active_business() then raise exception 'Not a business account'; end if;
  if p_share is null then raise exception 'Enter a share'; end if;
  if p_share < 0 or p_share > 1 then raise exception 'Share must be between 0 and 1'; end if;

  -- Match on the last 10 digits. `profiles.phone` is free text captured at
  -- signup, so the same Karachi number is stored as 03001234567,
  -- +923001234567 or 0300-1234567 depending on who typed it; a literal `=`
  -- would reject most real invites.
  digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(digits) < 10 then raise exception 'Enter a full phone number'; end if;
  digits := right(digits, 10);

  select p.profile_id into tech from providers p
    join profiles pr on pr.id = p.profile_id
   where p.status = 'approved'
     and right(regexp_replace(coalesce(pr.phone, ''), '\D', '', 'g'), 10) = digits
   limit 1;
  -- One message for both misses, on purpose. Distinct errors would let a
  -- business enumerate which phone numbers belong to approved technicians
  -- and which of those are already employed, by typing numbers at it.
  if tech is null
     or exists (select 1 from business_members m
                where m.provider_id = tech and m.status = 'active') then
    raise exception 'No approved technician with that number is free to join';
  end if;

  insert into business_members(business_id, provider_id, status, tech_share, invited_by)
  values (biz, tech, 'invited', p_share, biz)
  on conflict (business_id, provider_id) do update
    set status = 'invited', tech_share = p_share, invited_at = now(),
        responded_at = null, removed_at = null
  returning id into mid;

  select full_name into biz_name from profiles where id = biz;
  perform notify_user(tech, 'business_invite',
    coalesce(biz_name,'A business') || ' invited you to their team',
    'You would keep ' || round(p_share * 100) || '% of each job they send you.', null);
  return mid;
end; $$;

-- Only the invited technician may accept or decline their own invite.
create or replace function business_respond_invite(p_member uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m business_members%rowtype; tech_name text;
begin
  select * into m from business_members where id = p_member for update;
  if not found then raise exception 'Invite not found'; end if;
  if m.provider_id is distinct from auth.uid() then
    raise exception 'That invite is not yours';
  end if;
  if m.status <> 'invited' then raise exception 'That invite is no longer open'; end if;

  if p_accept then
    -- business_members_one_active would catch this anyway, but as a raw
    -- "duplicate key value violates unique constraint" in the user's face.
    -- Reachable by holding a stale invite from B and then joining C.
    if exists (select 1 from business_members x
               where x.provider_id = m.provider_id and x.status = 'active') then
      raise exception 'You are already on a team. Leave it before joining another.';
    end if;
    update business_members set status = 'active', responded_at = now() where id = p_member;
    -- Reject outstanding open-pool bids, or a customer could award a stale
    -- one and route straight around the dispatcher.
    update bids set status = 'rejected'
     where provider_id = m.provider_id and status = 'pending';
  else
    update business_members set status = 'declined', responded_at = now() where id = p_member;
  end if;

  select full_name into tech_name from profiles where id = m.provider_id;
  perform notify_user(m.business_id, 'business_invite',
    coalesce(tech_name,'A technician') ||
      (case when p_accept then ' joined your team' else ' declined your invite' end),
    null, null);
end; $$;

create or replace function business_set_share(p_member uuid, p_share numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_active_business() then raise exception 'Not a business account'; end if;
  if p_share is null then raise exception 'Enter a share'; end if;
  if p_share < 0 or p_share > 1 then raise exception 'Share must be between 0 and 1'; end if;
  -- Only a live relationship: re-pricing a membership someone already
  -- declined or left changes nothing and just looks like it worked.
  update business_members set tech_share = p_share
   where id = p_member and business_id = auth.uid()
     and status in ('invited','active');
  if not found then raise exception 'Not a current member of your team'; end if;
end; $$;

-- Callable by either side. Refused while the technician still has a live job
-- from this business.
create or replace function business_remove_member(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m business_members%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into m from business_members where id = p_member for update;
  if not found then raise exception 'Membership not found'; end if;
  -- Spelt out rather than `auth.uid() not in (...)`: that form evaluates to
  -- NULL, not TRUE, for a null uid, and plpgsql treats a NULL `if` as false —
  -- so the check would silently pass. The grants make that unreachable today;
  -- an authorization test should not depend on that.
  if auth.uid() <> m.business_id and auth.uid() <> m.provider_id and not is_admin() then
    raise exception 'Not your membership';
  end if;
  -- 'disputed' is deliberately NOT in the allowed set: a disputed job is
  -- unresolved money, and only an admin can move it out of that state.
  if exists (select 1 from jobs j
             where j.business_id = m.business_id and j.provider_id = m.provider_id
               and j.status not in ('paid','rated','cancelled')) then
    raise exception 'Finish, reassign or resolve their open jobs first';
  end if;
  update business_members set status = 'removed', removed_at = now() where id = p_member;
end; $$;

-- Dispatch. Row-locks the job so two dispatcher tabs cannot claim the same
-- one. business_id/tech_share are stamped by jobs_stamp_business(), not here,
-- so the money facts are computed in exactly one place. jobs_enforce_status
-- permits created->assigned and bidding->assigned, and jobs_notify already
-- fires on null -> not-null, so the customer and the technician are both
-- notified with no extra code.
create or replace function business_assign_job(p_job uuid, p_provider uuid)
returns void language plpgsql security definer set search_path = public as $$
declare biz uuid := auth.uid(); j jobs%rowtype;
begin
  if biz is null then raise exception 'Sign in first'; end if;
  if not is_active_business() then raise exception 'Not a business account'; end if;

  if not exists (select 1 from business_members m
                 where m.business_id = biz and m.provider_id = p_provider
                   and m.status = 'active') then
    raise exception 'That technician is not on your team';
  end if;

  select * into j from jobs where id = p_job for update;
  if not found then raise exception 'Job not found'; end if;
  if j.provider_id is not null then raise exception 'That job has already been taken'; end if;
  if j.status not in ('created','bidding') then raise exception 'That job is no longer open'; end if;
  if j.price is null then
    raise exception 'Send a quote first - this job has no agreed price yet';
  end if;

  update jobs set provider_id = p_provider, status = 'assigned' where id = p_job;
end; $$;

-- Move a live job to a different active member. jobs_notify only fires on
-- null -> not-null, so the incoming technician is told explicitly here.
create or replace function business_reassign_job(p_job uuid, p_provider uuid)
returns void language plpgsql security definer set search_path = public as $$
declare biz uuid := auth.uid(); j_title text; prev uuid;
begin
  if not is_active_business() then raise exception 'Not a business account'; end if;
  if not exists (select 1 from business_members m
                 where m.business_id = biz and m.provider_id = p_provider
                   and m.status = 'active') then
    raise exception 'That technician is not on your team';
  end if;

  select provider_id into prev from jobs
   where id = p_job and business_id = biz and status = 'assigned' for update;
  if prev is null then
    raise exception 'Only a job you dispatched and not yet started can be reassigned';
  end if;
  if prev = p_provider then return; end if;

  update jobs set provider_id = p_provider where id = p_job
  returning title into j_title;

  perform notify_user(p_provider, 'job_new', 'New job assigned', j_title, p_job);
  perform notify_user(prev, 'status', 'A job was reassigned',
    j_title || ' has been passed to someone else on the team.', p_job);
end; $$;

-- bids_rw's `with check (provider_id = auth.uid())` blocks a business from
-- quoting on a member's behalf, so custom jobs need this. The customer then
-- awards normally and jobs_stamp_business() does the rest.
create or replace function business_place_bid(
  p_job uuid, p_provider uuid, p_amount numeric, p_note text default null,
  p_eta int default null)
returns void language plpgsql security definer set search_path = public as $$
declare biz uuid := auth.uid();
begin
  if not is_active_business() then raise exception 'Not a business account'; end if;
  if not exists (select 1 from business_members m
                 where m.business_id = biz and m.provider_id = p_provider
                   and m.status = 'active') then
    raise exception 'That technician is not on your team';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter a quote amount'; end if;
  -- Running as owner means this bypasses jobs_select, so the open-pool test
  -- that policy would have applied has to be made explicitly. Without it a
  -- business could post a phantom quote onto ANY job id — including one
  -- already assigned elsewhere, where bids_rw would show it to that job's
  -- customer.
  if not exists (select 1 from jobs j
                 where j.id = p_job and j.provider_id is null
                   and j.status in ('created','bidding')) then
    raise exception 'That job is not open for quotes';
  end if;
  insert into bids(job_id, provider_id, amount, note, eta_minutes)
  values (p_job, p_provider, p_amount, p_note, p_eta)
  on conflict (job_id, provider_id) do update
    set amount = excluded.amount, note = excluded.note, eta_minutes = excluded.eta_minutes;
end; $$;

-- The missing other half of the money story. jobs_on_paid records what a
-- technician owes their business for cash they collected, but nothing
-- discharged it — so "due from your team" could only ever grow, and the
-- figure both /business/earnings and /pro/history present as an outstanding
-- balance was really a lifetime total.
--
-- Mirrors record_settlement, one level down: that one records a business (or
-- an independent pro) remitting Karighar's commission; this one records a
-- technician handing their business its share. Karighar is not a party to
-- it, which is why it is the BUSINESS that calls it, not an admin.
--
-- Any membership status: you settle up with people who have already left.
create or replace function business_share_outstanding(p_provider uuid)
returns numeric language sql security definer stable set search_path = public as $$
  select round(-coalesce(sum(amount), 0), 2)
  from provider_ledger
  where provider_id = p_provider and type = 'business_share';
$$;

create or replace function business_settle_with_tech(p_provider uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare biz uuid := auth.uid(); owed numeric;
begin
  if not is_active_business() then raise exception 'Not a business account'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  -- Was existence-only, so 'invited', 'declined' and 'removed' all passed —
  -- and business_invite_technician creates an 'invited' row without the
  -- technician's consent. A business could therefore mint a membership
  -- against any approved technician and write ledger rows referencing them.
  if not exists (select 1 from business_members m
                 where m.business_id = biz and m.provider_id = p_provider
                   and m.status = 'active') then
    raise exception 'Not one of your technicians';
  end if;

  owed := business_share_outstanding(p_provider);
  if p_amount > owed + 0.005 then
    raise exception 'That is more than the % they still owe you', round(owed, 2);
  end if;

  insert into provider_ledger(provider_id, job_id, type, amount, balance) values
    (p_provider, null, 'business_share',  p_amount, 0),
    (biz,        null, 'business_share', -p_amount, 0);
end; $$;

create or replace function business_settle_with_tech(p_provider uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare biz uuid := auth.uid(); owed numeric;
begin
  if not is_active_business() then raise exception 'Not a business account'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  -- Was existence-only, so 'invited', 'declined' and 'removed' all passed —
  -- and business_invite_technician creates an 'invited' row without the
  -- technician's consent. A business could therefore mint a membership
  -- against any approved technician and write ledger rows referencing them.
  if not exists (select 1 from business_members m
                 where m.business_id = biz and m.provider_id = p_provider
                   and m.status = 'active') then
    raise exception 'Not one of your technicians';
  end if;

  owed := business_share_outstanding(p_provider);
  if p_amount > owed + 0.005 then
    raise exception 'That is more than the % they still owe you', round(owed, 2);
  end if;

  insert into provider_ledger(provider_id, job_id, type, amount, balance) values
    (p_provider, null, 'business_share',  p_amount, 0),
    (biz,        null, 'business_share', -p_amount, 0);
end; $$;

-- The product promises "a re-visit or a refund" in two places and the ledger
-- had no way to issue one: a dispute changed a text column and nothing else,
-- so the technician kept owing commission on money they had handed back.
--
-- Reversal rows are derived from the PAYMENTS row, not recomputed from the
-- job, so a reversal always mirrors exactly what was booked even if the job
-- has since been edited by an admin.
--
-- Why 'adjustment' for the commission leg rather than a positive 'commission'
-- row: summarizeLedger takes abs() of commission, so an opposite-signed
-- commission row would ADD to the gross instead of cancelling it.
-- 'adjustment' counts toward `settled`, which is exactly the required effect.
create or replace function reverse_job_charges(p_job uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare j jobs%rowtype; pay payments%rowtype; biz_cut numeric;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'Give a reason for the reversal';
  end if;

  select * into j from jobs where id = p_job for update;
  if not found then raise exception 'Job not found'; end if;

  select * into pay from payments where job_id = p_job for update;
  if not found then raise exception 'That job was never paid, so there is nothing to reverse'; end if;

  -- Idempotent: one reversal per job, so a dispute reopened twice cannot
  -- reverse twice.
  if exists (select 1 from provider_ledger where job_id = p_job and type = 'adjustment') then
    raise exception 'That job has already been reversed';
  end if;

  if j.business_id is null then
    insert into provider_ledger(provider_id, job_id, type, amount, balance) values
      (j.provider_id, p_job, 'earning',    -pay.provider_payout, 0),
      (j.provider_id, p_job, 'adjustment',  pay.commission,      0);
  else
    biz_cut := pay.amount - pay.provider_payout;
    insert into provider_ledger(provider_id, job_id, type, amount, balance) values
      (j.provider_id, p_job, 'earning',        -pay.provider_payout, 0),
      (j.provider_id, p_job, 'business_share',  biz_cut,             0),
      (j.business_id, p_job, 'business_share', -biz_cut,             0),
      (j.business_id, p_job, 'adjustment',      pay.commission,      0);
  end if;

  update payments set status = 'refunded' where job_id = p_job;

  update disputes
     set resolution = coalesce(resolution || ' | ', '') || 'Reversed: ' || btrim(p_reason)
   where job_id = p_job;
end; $$;

-- `payments` was write-only: nothing in the app ever read it, so nothing
-- compared it to `provider_ledger`. A function rather than a view, so it can
-- be gated on is_admin() — views carry no RLS of their own.
create or replace function admin_reconciliation()
returns table (
  paid_without_payment  bigint,
  duplicate_payments    bigint,
  payments_commission   numeric,
  ledger_commission     numeric,
  commission_delta      numeric,
  stranded_completed    bigint,
  stranded_value        numeric
)
language plpgsql security definer set search_path = public as $$
declare pc numeric; lc numeric;
begin
  if not is_admin() then raise exception 'admins only'; end if;

  select coalesce(sum(commission), 0) into pc
    from payments where status <> 'refunded';

  -- Commission raised, net of anything reversed. A reversal books an
  -- 'adjustment' rather than a negative 'commission', so both legs have to be
  -- counted for the two sides to agree.
  select coalesce(sum(case when type = 'commission' then abs(amount) else 0 end), 0)
       - coalesce(sum(case when type = 'adjustment' then amount else 0 end), 0)
    into lc from provider_ledger;

  return query select
    (select count(*) from jobs j
      where j.status in ('paid', 'rated')
        and not exists (select 1 from payments p where p.job_id = j.id)),
    (select count(*) from (
       select job_id from payments group by job_id having count(*) > 1) d),
    round(pc, 2),
    round(lc, 2),
    round(pc - lc, 2),
    -- Commission is only ever booked on the move to `paid`. A job left at
    -- `completed` was done and settled in cash with nothing owed to Karighar.
    (select count(*) from jobs
      where status = 'completed' and updated_at < now() - interval '3 days'),
    (select coalesce(sum(price), 0) from jobs
      where status = 'completed' and updated_at < now() - interval '3 days');
end; $$;

revoke all on function grant_business_account(uuid, text, text, double precision, double precision) from public;
revoke all on function set_business_status(uuid, business_status)         from public;
revoke all on function update_business_details(uuid, text, text, double precision, double precision) from public;
revoke all on function business_invite_technician(text, numeric)          from public;
revoke all on function business_respond_invite(uuid, boolean)             from public;
revoke all on function business_set_share(uuid, numeric)                  from public;
revoke all on function business_remove_member(uuid)                       from public;
revoke all on function business_assign_job(uuid, uuid)                    from public;
revoke all on function business_reassign_job(uuid, uuid)                  from public;
revoke all on function business_place_bid(uuid, uuid, numeric, text, int) from public;
revoke all on function business_settle_with_tech(uuid, numeric)             from public;
revoke all on function reverse_job_charges(uuid, text)                      from public;
revoke all on function commission_outstanding(uuid)                         from public;
revoke all on function business_share_outstanding(uuid)                     from public;
revoke all on function admin_reconciliation()                               from public;
revoke all on function set_platform_commission(text, numeric, numeric)      from public;
revoke all on function set_account_commission(uuid, numeric)                from public;
revoke all on function default_commission_rate(job_type, text)              from public;
revoke all on function resolve_commission_rate(uuid, uuid, job_type)        from public;

grant execute on function grant_business_account(uuid, text, text, double precision, double precision) to authenticated, service_role;
grant execute on function set_business_status(uuid, business_status)         to authenticated, service_role;
grant execute on function set_platform_commission(text, numeric, numeric)    to authenticated, service_role;
grant execute on function set_account_commission(uuid, numeric)              to authenticated, service_role;
grant execute on function default_commission_rate(job_type, text)            to authenticated, service_role;
grant execute on function resolve_commission_rate(uuid, uuid, job_type)      to authenticated, service_role;
grant execute on function update_business_details(uuid, text, text, double precision, double precision) to authenticated, service_role;
grant execute on function business_invite_technician(text, numeric)          to authenticated, service_role;
grant execute on function business_respond_invite(uuid, boolean)             to authenticated, service_role;
grant execute on function business_set_share(uuid, numeric)                  to authenticated, service_role;
grant execute on function business_remove_member(uuid)                       to authenticated, service_role;
grant execute on function business_assign_job(uuid, uuid)                    to authenticated, service_role;
grant execute on function business_reassign_job(uuid, uuid)                  to authenticated, service_role;
grant execute on function business_place_bid(uuid, uuid, numeric, text, int) to authenticated, service_role;
grant execute on function business_settle_with_tech(uuid, numeric)             to authenticated, service_role;
grant execute on function reverse_job_charges(uuid, text)                      to authenticated, service_role;
grant execute on function commission_outstanding(uuid)                         to authenticated, service_role;
grant execute on function business_share_outstanding(uuid)                     to authenticated, service_role;
grant execute on function admin_reconciliation()                               to authenticated, service_role;

-- ---------- Notifications on job / bid changes ----------
-- new.status is an enum; cast before replace(), which has no enum overload.
create or replace function jobs_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.provider_id is null and new.provider_id is not null then
    perform notify_user(new.customer_id, 'job_assigned', 'A pro is assigned', new.title, new.id);
    perform notify_user(new.provider_id, 'job_new', 'New job assigned', new.title, new.id);
  end if;
  if new.status is distinct from old.status then
    if new.status in ('en_route','arrived','in_progress','completed') then
      perform notify_user(new.customer_id, 'status', 'Update on ' || new.title,
        'Status: ' || replace(new.status::text, '_', ' '), new.id);
    elsif new.status = 'cancelled' then
      perform notify_user(new.customer_id, 'status', 'Booking cancelled', new.title, new.id);
      perform notify_user(new.provider_id, 'status', 'Job cancelled', new.title, new.id);
    elsif new.status = 'rated' then
      perform notify_user(new.provider_id, 'rating', 'You got a new rating', new.title, new.id);
    end if;
  end if;
  return new;
end; $$;
create trigger jobs_after_update_notify after update on jobs
  for each row execute function jobs_notify();

create or replace function bids_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare cust uuid; jtitle text;
begin
  select customer_id, title into cust, jtitle from jobs where id = new.job_id;
  perform notify_user(cust, 'bid', 'New quote received',
    'A pro quoted Rs ' || new.amount || ' for ' || jtitle, new.job_id);
  return new;
end; $$;
create trigger bids_after_insert after insert on bids
  for each row execute function bids_notify();

-- Tell the customer their pro rated them.
create or replace function customer_reviews_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare jtitle text;
begin
  select title into jtitle from jobs where id = new.job_id;
  perform notify_user(
    new.customer_id, 'rating',
    'Your pro rated you ' || new.rating || ' out of 5', jtitle, new.job_id);
  return new;
end; $$;
create trigger customer_reviews_after_insert_notify after insert on customer_reviews
  for each row execute function customer_reviews_notify();

-- A new chat message alerts the other party.
--
-- Coalesced on purpose: one unread 'message' alert per job at a time, or a
-- back-and-forth would bury every other notification. Once the reader has
-- opened it, the next message raises a fresh one.
create or replace function messages_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare cust uuid; prov uuid; jtitle text; target uuid;
begin
  select customer_id, provider_id, title into cust, prov, jtitle
    from jobs where id = new.job_id;

  target := case when new.sender_id = cust then prov else cust end;
  if target is null or target = new.sender_id then return new; end if;

  if exists (
    select 1 from notifications
    where user_id = target and job_id = new.job_id
      and type = 'message' and read = false
  ) then
    return new;
  end if;

  perform notify_user(target, 'message', 'New message', jtitle, new.job_id);
  return new;
end; $$;
create trigger messages_after_insert_notify after insert on messages
  for each row execute function messages_notify();

-- ============================================================
-- Row-Level Security
-- ============================================================
alter table profiles           enable row level security;
alter table customers          enable row level security;
alter table providers          enable row level security;
alter table service_categories enable row level security;
alter table services           enable row level security;
alter table provider_services  enable row level security;
alter table jobs               enable row level security;
alter table bids               enable row level security;
alter table job_tracking       enable row level security;
alter table payments           enable row level security;
alter table reviews            enable row level security;
alter table customer_reviews   enable row level security;
alter table messages           enable row level security;
alter table provider_ledger    enable row level security;
alter table disputes           enable row level security;
alter table notifications      enable row level security;
alter table house_promos       enable row level security;
alter table businesses         enable row level security;
alter table business_members   enable row level security;
alter table business_services  enable row level security;
alter table platform_settings  enable row level security;

-- Platform knobs. Readable by any signed-in account: a pro already sees the
-- commission on every one of their own jobs in /pro/history, so the rate is
-- not a secret. Writes are admin-only and go through set_platform_commission.
create policy settings_read  on platform_settings for select to authenticated using (true);
create policy settings_admin on platform_settings for all
  using (is_admin()) with check (is_admin());

-- Profiles: everyone reads own; admin reads all; owner updates own.
create policy profiles_self  on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_upd   on profiles for update using (id = auth.uid());
-- Job peers (customer <-> assigned provider) can read each other's basic profile.
create policy profiles_job_peer on profiles for select using (
  exists (
    select 1 from jobs j
    where (j.customer_id = profiles.id and j.provider_id = auth.uid())
       or (j.provider_id = profiles.id and j.customer_id = auth.uid())
  )
);
-- Team peers, the same way. The business needs its technicians' phone numbers
-- to dispatch; the technician needs to see who invited them. `profiles`
-- carries only name/phone/avatar/role — the document PII is on `providers`,
-- still locked down — and both parties have an explicit relationship row.
--
-- NOT filtered by membership status: the relationship row is itself the proof
-- of a relationship, exactly as profiles_job_peer above takes any job at any
-- status. Filtering to ('invited','active') left /business/team's "Past and
-- declined" section rendering every row as "Unnamed · no phone" — and the
-- business had already typed that person's number to invite them, so hiding
-- the name afterwards protects nothing.
create policy profiles_business_team on profiles for select using (
  exists (select 1 from business_members m
          where m.business_id = auth.uid() and m.provider_id = profiles.id)
  or exists (select 1 from business_members m
          where m.provider_id = auth.uid() and m.business_id = profiles.id)
);

-- Catalog is public-read; admin writes.
create policy cat_read  on service_categories for select using (true);
create policy cat_admin on service_categories for all using (is_admin()) with check (is_admin());
create policy svc_read  on services for select using (true);
create policy svc_admin on services for all using (is_admin()) with check (is_admin());

-- Customers/providers: owner manages own row; admin all.
create policy cust_self on customers for all using (profile_id = auth.uid() or is_admin())
  with check (profile_id = auth.uid() or is_admin());
-- No job-peer read on `customers`: providers get ratings from
-- public_customer_ratings below, and the address they drive to is on `jobs`.
-- RLS is row-level, so a policy here could not hide default_address/lat/lng.
-- NOTE: no public read on `providers`. It holds cnic_no and the storage paths
-- of identity documents, and RLS is row-level, not column-level — a
-- `using (true)` select policy here would hand that to anyone with the anon
-- key. Public pro data goes out through public_provider_profiles below.
create policy prov_self on providers for all using (profile_id = auth.uid() or is_admin())
  with check (profile_id = auth.uid() or is_admin());
create policy provsvc_self on provider_services for all using (provider_id = auth.uid() or is_admin())
  with check (provider_id = auth.uid() or is_admin());
create policy bizsvc_self on business_services for all
  using (business_id = auth.uid() or is_admin())
  with check (business_id = auth.uid() or is_admin());

-- Businesses: granted by Karighar, so there is deliberately NO insert policy
-- for `authenticated`. The owner may edit presentation (about, service_areas)
-- and businesses_guard_trusted_cols coerces the rest back.
create policy biz_read on businesses for select using (
  profile_id = auth.uid()
  or is_admin()
  or exists (select 1 from business_members m
             where m.business_id = businesses.profile_id
               and m.provider_id = auth.uid()
               and m.status in ('invited','active'))
);
create policy biz_self_update on businesses for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy biz_admin on businesses for all
  using (is_admin()) with check (is_admin());

-- Membership: both sides read the relationship, and NOBODY writes it
-- directly. Every write goes through a business_* RPC above — that is what
-- makes the open-pool lockout non-self-writable.
create policy bm_read on business_members for select using (
  business_id = auth.uid() or provider_id = auth.uid() or is_admin()
);
create policy bm_admin on business_members for all
  using (is_admin()) with check (is_admin());

-- Jobs: customer sees own; assigned provider sees own; the dispatching
--       business follows its own jobs end to end; open (unassigned) jobs
--       visible to approved INDEPENDENT providers and to active businesses,
--       to accept/bid; admin all.
--
-- The lockout for attached technicians is enforced HERE rather than merely
-- hidden in the UI: /pro/dashboard's pool query is a plain
-- `.is("provider_id", null)` that any caller could reproduce by hand. With
-- this policy that query simply returns zero rows for them, so there is
-- nothing left to hide.
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
      ))
);
create policy jobs_insert on jobs for insert with check (customer_id = auth.uid());
create policy jobs_update_customer on jobs for update
  using (customer_id = auth.uid()) with check (customer_id = auth.uid());
create policy jobs_update_provider on jobs for update
  using (provider_id = auth.uid()) with check (provider_id = auth.uid());
-- Note the `with check (provider_id = auth.uid())`: no policy anywhere lets
-- one account write another's id into provider_id. A business dispatches
-- through business_assign_job() instead.
create policy jobs_claim on jobs for update
  using (provider_id is null and status in ('created','bidding')
         and exists (select 1 from providers p where p.profile_id = auth.uid() and p.status = 'approved')
         and not is_attached_tech())
  with check (provider_id = auth.uid());
create policy jobs_admin on jobs for all using (is_admin()) with check (is_admin());

-- Bids: provider manages own; job's customer can read; dispatching business
-- reads its team's; admin all.
--
-- The write check carries the open-pool lockout as well as the identity
-- test. Bidding is the SECOND way into the pool, and without `not
-- is_attached_tech()` here an attached technician who kept an open job's
-- uuid could insert a bid, have the customer award it, and drag that job —
-- and Karighar's commission — onto a business that never dispatched it. The
-- job-openness test is the same one business_place_bid makes.
create policy bids_rw on bids for all
  using (provider_id = auth.uid() or is_admin()
         or exists(select 1 from jobs j where j.id = bids.job_id and j.customer_id = auth.uid()))
  with check (
    is_admin()
    or (provider_id = auth.uid()
        and not is_attached_tech()
        and exists (select 1 from jobs j
                    where j.id = bids.job_id
                      and j.provider_id is null
                      and j.status in ('created','bidding')))
  );
-- A dispatcher reads the quotes it placed through business_place_bid. A
-- SELECT-only policy rather than widening bids_rw's `using`: that one is
-- `for all`, so loosening it would hand the business DELETE on its
-- technicians' bids too. Permissive policies OR together.
create policy bids_business_read on bids for select using (
  exists (select 1 from business_members m
          where m.provider_id = bids.provider_id
            and m.business_id = auth.uid() and m.status = 'active')
);

-- Tracking / payments / messages / reviews scoped to job participants.
create policy track_rw on job_tracking for all
  using (exists(select 1 from jobs j where j.id = job_tracking.job_id
               and (j.customer_id = auth.uid() or j.provider_id = auth.uid() or is_admin())))
  with check (exists(select 1 from jobs j where j.id = job_tracking.job_id
               and (j.provider_id = auth.uid() or is_admin())));
-- A business must be able to reconcile the commission it owes, so it reads
-- payments on jobs it dispatched. Deliberately NOT extended the same way:
-- msg_rw and track_rw — a dispatcher does not read the customer<->technician
-- chat or their live GPS.
create policy pay_read on payments for select
  using (exists(select 1 from jobs j where j.id = payments.job_id
               and (j.customer_id = auth.uid() or j.provider_id = auth.uid()
                    or j.business_id = auth.uid() or is_admin())));
create policy msg_rw on messages for all
  using (exists(select 1 from jobs j where j.id = messages.job_id
               and (j.customer_id = auth.uid() or j.provider_id = auth.uid() or is_admin())))
  with check (sender_id = auth.uid());
create policy rev_read on reviews for select using (true);
create policy rev_write on reviews for insert with check (customer_id = auth.uid());
-- The other direction, same posture: public read (a customer's rating is
-- meant to be visible to everyone, the customer included) and no
-- update/delete policy, so ratings are immutable once left.
create policy custrev_read on customer_reviews for select using (true);
create policy custrev_write on customer_reviews for insert
  with check (provider_id = auth.uid());
-- Job-scoped for the business, so it reads the ledger lines for work it
-- dispatched but not a technician's independent history from before they
-- joined.
--
-- The last branch is the business<->technician leg specifically: a settlement
-- row carries no job_id, so without it a business could see what its
-- technicians OWE but never what they had already PAID, and the receivable on
-- /business/earnings could only ever grow. Restricted to `business_share`, so
-- a technician's own earnings and commission history stay private.
create policy ledger_self on provider_ledger for select using (
  provider_id = auth.uid()
  or is_admin()
  or exists (select 1 from jobs j
             where j.id = provider_ledger.job_id and j.business_id = auth.uid())
  or (provider_ledger.type = 'business_share'
      and exists (select 1 from business_members m
                  where m.provider_id = provider_ledger.provider_id
                    and m.business_id = auth.uid()))
);
create policy disp_rw on disputes for all
  using (raised_by = auth.uid() or is_admin()
         or exists(select 1 from jobs j where j.id = disputes.job_id
                   and (j.customer_id = auth.uid() or j.provider_id = auth.uid())))
  with check (raised_by = auth.uid());
-- Admins fully manage disputes (disp_rw only lets the raiser write).
create policy disp_admin on disputes for all using (is_admin()) with check (is_admin());

-- Notifications are private to their recipient.
-- Promos are public, but only while live: the window is enforced in the
-- policy rather than the query, so a draft or an expired promo cannot be
-- pulled out of the table with the anon key by asking differently. Admins
-- manage them and, policies being permissive, also see drafts.
create policy promo_read on house_promos for select using (
  is_active
  and (starts_at is null or starts_at <= now())
  and (ends_at   is null or ends_at   >= now())
);
create policy promo_admin on house_promos for all
  using (is_admin()) with check (is_admin());

create policy notif_own on notifications for select using (user_id = auth.uid());
create policy notif_update on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- Public provider profiles
-- ============================================================
-- Two ways a row becomes visible. Runs with the view owner's rights, so it
-- reads past the RLS on providers/profiles above.
--
-- 1. Public case: `role = 'provider' AND status = 'approved'` is exactly
--    what roleOf() in src/components/nav.ts calls a provider, so the view
--    and the app agree on who is one. Checking only the status would list
--    any account carrying an approved `providers` row, including one whose
--    profile is still a customer. This is the Home/Map browse case, where
--    the viewer has no relationship with the provider yet.
--
-- 2. Relationship case (patch_v16): a customer can see the provider on their
--    OWN job or bid — any status, active or past — because that job/bid row
--    is itself proof of a real relationship, independent of whether the
--    provider is currently public-listed. Without this, the pro's name,
--    avatar, bio and rating go blank everywhere on a customer's own booking
--    (list, detail, chat, "view profile") the moment that provider isn't
--    (or isn't yet) approved — which is the normal state for most of a
--    pro's history before an admin reviews them. Admins always see everyone.
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
    (prov.status = 'approved' and pr.role = 'provider')
    or exists (
      select 1 from jobs j
      where j.provider_id = prov.profile_id
        and j.customer_id = auth.uid()
    )
    or exists (
      select 1 from bids b
      join jobs j on j.id = b.job_id
      where b.provider_id = prov.profile_id
        and j.customer_id = auth.uid()
    )
    or is_admin();

-- Owner's rights are the default; stated so a future default flip is loud.
do $$
begin
  execute 'alter view public_provider_profiles set (security_invoker = off)';
exception when others then
  raise notice 'security_invoker unsupported here; view already uses owner rights by default';
end $$;

grant select on public_provider_profiles to anon, authenticated;

-- Customer ratings, the same way round. `customers` holds the address and
-- lat/lng, and RLS is row-level rather than column-level, so a blanket read
-- there would leak them — this view carries the aggregates ONLY, and runs
-- with its owner's rights so it reads through cust_self.
create or replace view public_customer_ratings as
  select c.profile_id as id,
         c.rating_avg,
         c.jobs_rated
  from customers c;

do $$
begin
  execute 'alter view public_customer_ratings set (security_invoker = off)';
exception when others then
  raise notice 'security_invoker unsupported here; view already uses owner rights by default';
end $$;

grant select on public_customer_ratings to anon, authenticated;

-- Businesses, mirroring public_provider_profiles: name, avatar, blurb,
-- aggregates, areas and a team COUNT. No phone, no member identities, no job
-- or ledger data. public_provider_profiles stays gated on
-- `status = 'approved' and role = 'provider'`, so a business can never leak
-- into it, and vice versa.
create or replace view public_business_profiles as
  select b.profile_id as id,
         pr.full_name,
         pr.avatar_url,
         b.about,
         b.rating_avg,
         b.jobs_completed,
         b.service_areas,
         b.lat,
         b.lng,
         (select count(*) from business_members m
           where m.business_id = b.profile_id and m.status = 'active') as team_size
  from businesses b
  join profiles pr on pr.id = b.profile_id
  where b.status = 'active';

do $$
begin
  execute 'alter view public_business_profiles set (security_invoker = off)';
exception when others then
  raise notice 'security_invoker unsupported here; view already uses owner rights by default';
end $$;

grant select on public_business_profiles to anon, authenticated;

-- What each business covers. `business_services` is owner/admin-only
-- (bizsvc_self), the same shape as provider_services — but unlike a
-- technician, a business is a PLACE, and a pin on a map says nothing without
-- the trade behind it, so the association goes out through a view.
--
-- Nothing here is new information: `services` and `service_categories` are
-- already world-readable (svc_read / cat_read are both `using (true)`). The
-- view publishes only which active business covers which live service.
create or replace view public_business_services as
  select bs.business_id,
         s.id         as service_id,
         s.name       as service_name,
         c.id         as category_id,
         c.name       as category_name,
         c.icon       as category_icon,
         c.sort_order as category_sort
  from business_services bs
  join businesses b         on b.profile_id = bs.business_id
  join services s           on s.id = bs.service_id
  join service_categories c on c.id = s.category_id
  where b.status = 'active' and s.is_active and c.is_active;

do $$
begin
  execute 'alter view public_business_services set (security_invoker = off)';
exception when others then
  raise notice 'security_invoker unsupported here; owner rights are the default';
end $$;

grant select on public_business_services to anon, authenticated;

-- The reviews behind that rating. A customer cannot assemble this himself:
-- `rev_read` is `using (true)` so reviews are public, but a business's
-- reviews are defined by a join through `jobs`, and `jobs_select` shows a
-- customer only their OWN jobs. Hence an owner-rights view, exactly as
-- public_provider_profiles exists because `providers` is not readable.
--
-- Carries the same four columns the provider profile already publishes
-- (rating, comment, date, and a key) and nothing else. In particular:
--
--   * no customer_id — reviews are not attributed to their author anywhere
--     in this app, and that should not change here;
--   * no provider_id and no job_id — which technician did the work is the
--     business's team roster, one row at a time, and
--     public_business_profiles deliberately publishes only `team_size`;
--   * not even the real review id. It is public on the technician's own
--     profile too, so publishing it here would let anyone intersect the two
--     lists and recover exactly the membership `team_size` is withholding.
--     md5 gives a stable, opaque React key with no such back-reference.
create or replace view public_business_reviews as
  select md5(r.id::text) as review_key,
         j.business_id,
         r.rating,
         r.comment,
         r.created_at
  from reviews r
  join jobs j       on j.id = r.job_id
  join businesses b on b.profile_id = j.business_id
  where b.status = 'active';

do $
begin
  execute 'alter view public_business_reviews set (security_invoker = off)';
exception when others then
  raise notice 'security_invoker unsupported here; owner rights are the default';
end $;

grant select on public_business_reviews to anon, authenticated;

-- ============================================================
-- Storage: private bucket for CNIC / selfie
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('verification', 'verification', false)
  on conflict (id) do nothing;

-- Profile pictures, in a SEPARATE and public bucket. An avatar shows next to
-- a pro on /map and on a public company profile, both of which an anonymous
-- visitor can open, so the object has to be world-readable — which is
-- exactly why it must not share the verification bucket with CNIC scans.
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do update set public = true;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select
  using (bucket_id = 'avatars');
drop policy if exists avatars_own_write on storage.objects;
create policy avatars_own_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
-- Needed as well as insert: the client uploads with `upsert: true`, which is
-- an UPDATE once the object exists.
drop policy if exists avatars_own_update on storage.objects;
create policy avatars_own_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_own_delete on storage.objects;
create policy avatars_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Providers upload/read their own files; admins read all.
-- `storage` lives outside the public schema, so these survive a
-- `drop schema public cascade` reset — drop first so a re-run doesn't fail.
drop policy if exists verif_own_write on storage.objects;
create policy verif_own_write on storage.objects for insert
  with check (bucket_id = 'verification' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists verif_own_update on storage.objects;
create policy verif_own_update on storage.objects for update
  using (bucket_id = 'verification' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists verif_read on storage.objects;
create policy verif_read on storage.objects for select
  using (bucket_id = 'verification' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));

-- ============================================================
-- Seed: Karachi catalog (editable in admin)
-- ============================================================
insert into service_categories (name, icon, sort_order) values
  ('AC Service & Repair', 'ac',        1),
  ('Electrician',         'bolt',      2),
  ('Plumber',             'wrench',    3),
  ('Carpenter',           'carpenter', 4),
  ('Painter',             'painter',   5),
  ('Solar Panel Cleaning','solar',     6),
  ('Camera Installation', 'camera',    7),
  ('Washing Machine Repair','washer',  8);

-- Enable Realtime for live chat, tracking, and status updates.
do $$ begin alter publication supabase_realtime add table jobs;          exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table messages;      exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table job_tracking;  exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table notifications; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table customer_reviews; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table business_members; exception when duplicate_object then null; end $$;

insert into services (category_id, name, description, base_price, unit, visit_fee)
select c.id, s.name, s.description, s.base_price, s.unit, s.visit_fee from service_categories c
join (values
  ('AC Service & Repair','AC General Service','Cleaning & servicing, 1–2.5 ton',1750,'unit',500),
  ('AC Service & Repair','AC Installation','Install with up to 10ft piping',2800,'unit',500),
  ('AC Service & Repair','AC Gas Refill / Repair','Diagnosis + gas top-up',NULL,'job',500),
  ('Electrician','Basic Visit / Minor Fix','Switches, sockets, small faults',800,'visit',0),
  ('Electrician','House Wiring','Per square foot',65,'sq ft',0),
  ('Plumber','Basic Visit / Leak Fix','Leaks, taps, small repairs',800,'visit',0),
  ('Plumber','Fixture Installation','Tap, sink, commode install',1200,'item',0),
  ('Carpenter','On-site Quote','Carpenter visits to assess the job and quote a price',NULL,'job',0),
  ('Painter','On-site Quote','Painter visits to assess the job and quote a price',NULL,'job',0),
  ('Solar Panel Cleaning','On-site Quote','Technician visits to assess panel access and quote a price',NULL,'job',0),
  ('Camera Installation','On-site Quote','Technician visits to assess cameras needed and quote a price',NULL,'job',0),
  ('Washing Machine Repair','On-site Quote','Technician visits to diagnose the fault and quote a price',NULL,'job',0)
) as s(cat,name,description,base_price,unit,visit_fee) on s.cat = c.name;
