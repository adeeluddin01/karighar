-- ============================================================
-- KARIGHAR — patch v13: restore the notifications / business-logic layer
-- Run ONCE in the Supabase SQL editor. Idempotent & self-contained.
--
-- WHY THIS EXISTS
-- ---------------
-- The live project (bcwofxfwyovobqftucnp) was built from a schema.sql that
-- predates patch_v4, and patch_v4 + patch_v5 were never applied. Confirmed
-- against the REST API:
--
--   GET /rest/v1/notifications   -> 404 PGRST205
--       "Could not find the table 'public.notifications' in the schema cache"
--   POST /rest/v1/rpc/notify_user       -> 404 PGRST202 (function absent)
--   POST /rest/v1/rpc/record_settlement -> 404 PGRST202 (function absent)
--
-- Every other table and view the app uses is present, including everything
-- patch_v12 added (customer_reviews, public_customer_ratings).
--
-- WHY IT IS URGENT
-- ----------------
-- patch_v12 installed two triggers that call notify_user():
--   * messages_after_insert_notify        -> on messages
--   * customer_reviews_after_insert_notify -> on customer_reviews
-- plpgsql resolves names at execution, not creation, so those applied cleanly
-- and then fail at runtime. Until this patch runs, on that database:
--   * sending a chat message aborts (missing table `notifications`)
--   * a provider rating a customer aborts (missing function notify_user)
--
-- WHY NOT JUST RUN patch_v4 AND patch_v5
-- --------------------------------------
-- Running them now, after v10 and v12, would go backwards: patch_v4 ships the
-- jobs_notify() that patch_v10 fixed (it calls replace() on the job_status
-- enum and aborts every status change past 'assigned'). This patch instead
-- installs each object at its CURRENT schema.sql definition, so it converges
-- rather than rewinds.
--
-- SAFE TO RUN ANYWHERE. Every statement is create-or-replace / if-not-exists /
-- drop-then-create, so a database that already has some of this is unchanged.
-- ============================================================


-- ============================================================
-- PART 1 — Notifications. This is the part that is broken today.
-- ============================================================

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  job_id     uuid references jobs(id) on delete cascade,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications(user_id, read);

alter table notifications enable row level security;

-- Read and update your own only. No insert policy on purpose: rows arrive
-- solely through notify_user(), which is security definer.
drop policy if exists notif_own    on notifications;
drop policy if exists notif_update on notifications;
create policy notif_own on notifications for select using (user_id = auth.uid());
create policy notif_update on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function notify_user(p_user uuid, p_type text, p_title text, p_body text, p_job uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into notifications(user_id, type, title, body, job_id)
  values (p_user, p_type, p_title, p_body, p_job);
end; $$;

-- The live-update subscription the bell and the alerts screens rely on.
do $$ begin alter publication supabase_realtime add table notifications;
exception when duplicate_object then null; end $$;


-- ============================================================
-- PART 2 — The triggers that raise notifications.
-- jobs_notify is the patch_v10 version: new.status is an enum, and replace()
-- has no enum overload, so it must be cast to text first.
-- ============================================================

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
drop trigger if exists jobs_after_update_notify on jobs;
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
drop trigger if exists bids_after_insert on bids;
create trigger bids_after_insert after insert on bids
  for each row execute function bids_notify();


-- ============================================================
-- PART 3 — Admin settlements + dispute policy (the patch_v5 content).
-- ============================================================

create or replace function record_settlement(p_provider uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  insert into provider_ledger(provider_id, job_id, type, amount, balance)
  values (p_provider, null, 'payout', p_amount, 0);  -- 'payout' = settlement recorded
end; $$;

drop policy if exists disp_admin on disputes;
create policy disp_admin on disputes for all using (is_admin()) with check (is_admin());


-- ============================================================
-- PART 4 — Integrity triggers (the rest of patch_v4).
--
-- READ THIS: unlike parts 1-3, these CHANGE BEHAVIOUR on a database that has
-- been running without them. They are what schema.sql specifies and what the
-- app already assumes (src/lib/jobFlow.ts mirrors the status machine), so a
-- database missing them is the anomaly — but apply them knowing that:
--
--   * jobs_enforce_insert  derives price/commission from the catalog and
--     ignores whatever the client sent, and rate-limits to 6 bookings per
--     customer per 10 minutes.
--   * jobs_enforce_status  rejects status jumps outside the state machine
--     (admins excepted). Anything currently relying on an illegal jump stops.
--   * jobs_on_paid         writes the payments + provider_ledger rows on the
--     move to 'paid'. Not retroactive: jobs already paid stay unrecorded.
--   * reviews_enforce      limits a review to your own completed job.
--
-- If you would rather land parts 1-3 first and verify, stop here and run
-- part 4 separately. Nothing in parts 1-3 depends on it.
-- ============================================================

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
drop trigger if exists jobs_before_insert on jobs;
create trigger jobs_before_insert before insert on jobs
  for each row execute function jobs_enforce_insert();

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
drop trigger if exists jobs_before_update_status on jobs;
create trigger jobs_before_update_status before update on jobs
  for each row when (old.status is distinct from new.status)
  execute function jobs_enforce_status();

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
drop trigger if exists jobs_after_paid on jobs;
create trigger jobs_after_paid after update on jobs
  for each row when (new.status = 'paid' and old.status is distinct from 'paid')
  execute function jobs_on_paid();

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
drop trigger if exists reviews_before_insert on reviews;
create trigger reviews_before_insert before insert on reviews
  for each row execute function reviews_enforce();


-- ============================================================
-- Verify (expect one row, all true)
-- ============================================================
select
  to_regclass('public.notifications')       is not null as has_notifications_table,
  to_regproc('public.notify_user')          is not null as has_notify_user,
  to_regproc('public.record_settlement')    is not null as has_record_settlement,
  exists (select 1 from pg_publication_tables
          where pubname = 'supabase_realtime' and tablename = 'notifications')
                                                        as notifications_realtime;
