-- ============================================================
-- KARIGHAR — Database schema (complete)
-- Postgres / Supabase. Run in the Supabase SQL editor.
-- Home-services marketplace: Karachi, services-only, COD, hybrid pricing.
--
-- This is the WHOLE schema. On a fresh project run only this file — every
-- patch up to and including patch_v11 is already folded in. The
-- supabase/patch_v*.sql files exist only to bring an OLDER database forward,
-- in numeric order.
--
-- Folded in here: v2 (job RLS, rating trigger, verification bucket),
-- v3 (realtime), v4 (notifications, price/status/review integrity, COD
-- ledger), v5 (settlements, dispute admin), v6 (price lock, booking
-- rate-limit), v7 (public provider view, cancel_reason), v8 (no admin
-- self-escalation), v9 (job visibility fix), v10 (status-notify enum cast),
-- v11 (provider PII lockdown).
-- ============================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- ---------- Enums ----------
create type user_role       as enum ('customer', 'provider', 'admin');
create type provider_status as enum ('pending', 'approved', 'suspended', 'rejected');
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
create type payment_status as enum ('pending', 'collected', 'settled');
create type ledger_type    as enum ('earning', 'commission', 'payout', 'adjustment');

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
  lng             double precision
);

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
  verified_at    timestamptz
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
  provider_id     uuid references providers(profile_id),
  commission_rate numeric(4,3) not null default 0.20,   -- 0.20 fixed, 0.15 custom
  cancel_reason   text,                                 -- why it was cancelled (admin/support)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index jobs_customer_idx on jobs(customer_id);
create index jobs_provider_idx on jobs(provider_id);
create index jobs_status_idx   on jobs(status);

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
  created_at      timestamptz not null default now()
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
  provider_id uuid not null references providers(profile_id) on delete cascade,
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

-- ============================================================
-- Helpers & triggers
-- ============================================================
-- Auto-create a profile row when a new auth user signs up.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, new.raw_user_meta_data->>'full_name', new.phone);
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

-- Recompute a provider's rating + completed count when reviews change.
create or replace function on_review_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.provider_id, old.provider_id);
begin
  update providers set
    rating_avg = coalesce((select round(avg(rating)::numeric, 1) from reviews where provider_id = pid), 0),
    jobs_completed = (select count(*) from reviews where provider_id = pid)
  where profile_id = pid;
  return new;
end;
$$;
create trigger reviews_aggregate after insert or update or delete on reviews
  for each row execute function on_review_change();

-- Block role self-escalation: a normal user may switch between customer and
-- provider (signup / onboarding do that), but may not grant or remove 'admin'.
-- Service-role writes (auth.uid() is null) and admins are unaffected.
create or replace function profiles_guard_role()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not is_admin()
     and (new.role = 'admin' or old.role = 'admin') then
    raise exception 'You are not allowed to change the admin role';
  end if;
  return new;
end; $$;
create trigger profiles_before_update_role before update on profiles
  for each row when (old.role is distinct from new.role)
  execute function profiles_guard_role();

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
    new.commission_rate := 0.20;
    new.status := 'created';
  else
    new.price := null;
    new.commission_rate := 0.15;
    new.status := 'bidding';
  end if;
  return new;
end; $$;
create trigger jobs_before_insert before insert on jobs
  for each row execute function jobs_enforce_insert();

-- ---------- Price immutability ----------
-- A price can be set once (null -> value). Changing one the customer already
-- agreed to is blocked; admin excepted.
create or replace function jobs_lock_price()
returns trigger language plpgsql set search_path = public as $$
begin
  if is_admin() then return new; end if;
  if new.price is distinct from old.price and old.price is not null then
    raise exception 'Price is locked once it has been set';
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

-- ---------- Payment + provider ledger on completion (COD) ----------
-- The customer pays the Pro cash, so the Pro holds the full amount and OWES
-- the platform its commission.
create or replace function jobs_on_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare amt numeric; commission numeric; payout numeric;
begin
  amt := coalesce(new.price, 0);
  commission := round(amt * new.commission_rate, 2);
  payout := amt - commission;
  if not exists (select 1 from payments where job_id = new.id) then
    insert into payments(job_id, amount, method, commission, provider_payout, status)
      values (new.id, amt, 'cod', commission, payout, 'collected');
    if new.provider_id is not null then
      insert into provider_ledger(provider_id, job_id, type, amount, balance)
        values (new.provider_id, new.id, 'earning', payout, 0),
               (new.provider_id, new.id, 'commission', -commission, 0);
    end if;
  end if;
  return new;
end; $$;
create trigger jobs_after_paid after update on jobs
  for each row when (new.status = 'paid' and old.status is distinct from 'paid')
  execute function jobs_on_paid();

-- Admin records a commission settlement (the Pro remitted it).
create or replace function record_settlement(p_provider uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  insert into provider_ledger(provider_id, job_id, type, amount, balance)
  values (p_provider, null, 'payout', p_amount, 0);  -- 'payout' = settlement recorded
end; $$;

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
alter table messages           enable row level security;
alter table provider_ledger    enable row level security;
alter table disputes           enable row level security;
alter table notifications      enable row level security;

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

-- Catalog is public-read; admin writes.
create policy cat_read  on service_categories for select using (true);
create policy cat_admin on service_categories for all using (is_admin()) with check (is_admin());
create policy svc_read  on services for select using (true);
create policy svc_admin on services for all using (is_admin()) with check (is_admin());

-- Customers/providers: owner manages own row; admin all.
create policy cust_self on customers for all using (profile_id = auth.uid() or is_admin())
  with check (profile_id = auth.uid() or is_admin());
-- NOTE: no public read on `providers`. It holds cnic_no and the storage paths
-- of identity documents, and RLS is row-level, not column-level — a
-- `using (true)` select policy here would hand that to anyone with the anon
-- key. Public pro data goes out through public_provider_profiles below.
create policy prov_self on providers for all using (profile_id = auth.uid() or is_admin())
  with check (profile_id = auth.uid() or is_admin());
create policy provsvc_self on provider_services for all using (provider_id = auth.uid() or is_admin())
  with check (provider_id = auth.uid() or is_admin());

-- Jobs: customer sees own; assigned provider sees own; open (unassigned) jobs
--       visible to approved providers to accept/bid; admin all.
create policy jobs_select on jobs for select using (
  customer_id = auth.uid()
  or provider_id = auth.uid()
  or is_admin()
  or (provider_id is null and status in ('created','bidding')
      and exists (select 1 from providers p where p.profile_id = auth.uid() and p.status = 'approved'))
);
create policy jobs_insert on jobs for insert with check (customer_id = auth.uid());
create policy jobs_update_customer on jobs for update
  using (customer_id = auth.uid()) with check (customer_id = auth.uid());
create policy jobs_update_provider on jobs for update
  using (provider_id = auth.uid()) with check (provider_id = auth.uid());
create policy jobs_claim on jobs for update
  using (provider_id is null and status in ('created','bidding')
         and exists (select 1 from providers p where p.profile_id = auth.uid() and p.status = 'approved'))
  with check (provider_id = auth.uid());
create policy jobs_admin on jobs for all using (is_admin()) with check (is_admin());

-- Bids: provider manages own; job's customer can read; admin all.
create policy bids_rw on bids for all
  using (provider_id = auth.uid() or is_admin()
         or exists(select 1 from jobs j where j.id = bids.job_id and j.customer_id = auth.uid()))
  with check (provider_id = auth.uid() or is_admin());

-- Tracking / payments / messages / reviews scoped to job participants.
create policy track_rw on job_tracking for all
  using (exists(select 1 from jobs j where j.id = job_tracking.job_id
               and (j.customer_id = auth.uid() or j.provider_id = auth.uid() or is_admin())))
  with check (exists(select 1 from jobs j where j.id = job_tracking.job_id
               and (j.provider_id = auth.uid() or is_admin())));
create policy pay_read on payments for select
  using (exists(select 1 from jobs j where j.id = payments.job_id
               and (j.customer_id = auth.uid() or j.provider_id = auth.uid() or is_admin())));
create policy msg_rw on messages for all
  using (exists(select 1 from jobs j where j.id = messages.job_id
               and (j.customer_id = auth.uid() or j.provider_id = auth.uid() or is_admin())))
  with check (sender_id = auth.uid());
create policy rev_read on reviews for select using (true);
create policy rev_write on reviews for insert with check (customer_id = auth.uid());
create policy ledger_self on provider_ledger for select using (provider_id = auth.uid() or is_admin());
create policy disp_rw on disputes for all
  using (raised_by = auth.uid() or is_admin()
         or exists(select 1 from jobs j where j.id = disputes.job_id
                   and (j.customer_id = auth.uid() or j.provider_id = auth.uid())))
  with check (raised_by = auth.uid());
-- Admins fully manage disputes (disp_rw only lets the raiser write).
create policy disp_admin on disputes for all using (is_admin()) with check (is_admin());

-- Notifications are private to their recipient.
create policy notif_own on notifications for select using (user_id = auth.uid());
create policy notif_update on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- Public provider profiles
-- ============================================================
-- The only public window onto `providers`: safe columns, approved pros only.
-- Runs with the view owner's rights, so it reads past the RLS above.
--
-- Both halves of the WHERE matter — `role = 'provider' AND status =
-- 'approved'` is exactly what roleOf() in src/components/nav.ts calls a
-- provider, so the view and the app agree on who is one. Checking only the
-- status would list any account carrying an approved `providers` row,
-- including one whose profile is still a customer.
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

-- Owner's rights are the default; stated so a future default flip is loud.
do $$
begin
  execute 'alter view public_provider_profiles set (security_invoker = off)';
exception when others then
  raise notice 'security_invoker unsupported here; view already uses owner rights by default';
end $$;

grant select on public_provider_profiles to anon, authenticated;

-- ============================================================
-- Storage: private bucket for CNIC / selfie
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('verification', 'verification', false)
  on conflict (id) do nothing;

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
  ('Plumber',             'wrench',    3);

-- Enable Realtime for live chat, tracking, and status updates.
do $$ begin alter publication supabase_realtime add table jobs;          exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table messages;      exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table job_tracking;  exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table notifications; exception when duplicate_object then null; end $$;

insert into services (category_id, name, description, base_price, unit, visit_fee)
select c.id, s.name, s.description, s.base_price, s.unit, s.visit_fee from service_categories c
join (values
  ('AC Service & Repair','AC General Service','Cleaning & servicing, 1–2.5 ton',1750,'unit',500),
  ('AC Service & Repair','AC Installation','Install with up to 10ft piping',2800,'unit',500),
  ('AC Service & Repair','AC Gas Refill / Repair','Diagnosis + gas top-up',NULL,'job',500),
  ('Electrician','Basic Visit / Minor Fix','Switches, sockets, small faults',800,'visit',0),
  ('Electrician','House Wiring','Per square foot',65,'sq ft',0),
  ('Plumber','Basic Visit / Leak Fix','Leaks, taps, small repairs',800,'visit',0),
  ('Plumber','Fixture Installation','Tap, sink, commode install',1200,'item',0)
) as s(cat,name,description,base_price,unit,visit_fee) on s.cat = c.name;
