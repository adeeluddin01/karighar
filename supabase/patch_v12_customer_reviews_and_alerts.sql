-- ============================================================
-- KARIGHAR — patch v12: provider→customer ratings, signup role/phone,
--                       chat notifications
-- Run ONCE in the Supabase SQL editor. Idempotent & self-contained.
--
-- Three unrelated-looking problems that all live in the database.
--
-- 1. Signup lost the role AND the phone
-- -------------------------------------
-- handle_new_user() read `new.raw_user_meta_data->>'full_name'` for the name
-- but `new.phone` — the auth.users column — for the phone. An email signup
-- never populates that column, so the phone was dropped. The role was not
-- read at all: the app wrote it to `profiles` *after* signUp(), which only
-- works when a session comes back. With "Confirm email" ON there is no
-- session, so a user who signed up as a provider silently became a customer.
--
-- Both now travel in user metadata and are applied here, at insert time.
--
-- 2. A provider could not rate the customer
-- -----------------------------------------
-- `reviews` is customer→provider only, and its `job_id` is UNIQUE, so the
-- other direction cannot share the table without dropping that constraint
-- and re-testing the triggers and policies that depend on it. Hence a second
-- table, `customer_reviews`, mirroring the first.
--
-- 3. A new chat message raised no notification
-- --------------------------------------------
-- jobs_notify() and bids_notify() covered status changes and quotes; messages
-- were silent, so the other party only saw a message by opening the job.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Signup metadata: role + phone
-- ------------------------------------------------------------
-- The role is whitelisted. raw_user_meta_data is client-controlled, and
-- profiles_guard_role() (patch_v8) is an UPDATE trigger, so it does not
-- protect this INSERT — without the whitelist anyone could sign up as admin.
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


-- ------------------------------------------------------------
-- 2. Customer rating aggregates
-- ------------------------------------------------------------
-- Named `jobs_rated`, not `jobs_completed` as on `providers`: that column is
-- a misnomer there (on_review_change sets it to the *review* count), and the
-- mistake is not worth copying.
alter table customers add column if not exists rating_avg numeric(2,1) not null default 0;
alter table customers add column if not exists jobs_rated int           not null default 0;


-- ------------------------------------------------------------
-- 3. The second review direction
-- ------------------------------------------------------------
-- `provider_id` is the author, `customer_id` the subject — the opposite of
-- `reviews`. One per job, same as the other direction.
create table if not exists customer_reviews (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references jobs(id) on delete cascade unique,
  provider_id uuid not null references providers(profile_id) on delete cascade,
  customer_id uuid not null references customers(profile_id) on delete cascade,
  rating      int not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
);
create index if not exists customer_reviews_customer_idx on customer_reviews(customer_id);
create index if not exists customer_reviews_provider_idx on customer_reviews(provider_id);


-- ------------------------------------------------------------
-- 4. Keep customers.rating_avg / jobs_rated in step
-- ------------------------------------------------------------
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
drop trigger if exists customer_reviews_aggregate on customer_reviews;
create trigger customer_reviews_aggregate after insert or update or delete on customer_reviews
  for each row execute function on_customer_review_change();


-- ------------------------------------------------------------
-- 5. Review integrity (mirror of reviews_enforce, other direction)
-- ------------------------------------------------------------
-- 'rated' is in the list because the CUSTOMER's review already moves the job
-- to 'rated' — whoever rates second must still be allowed to. Note this is
-- deliberately decoupled from jobs.status: 'rated' is terminal in the status
-- machine, so a provider's rating must not try to advance it.
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
end;
$$;
drop trigger if exists customer_reviews_before_insert on customer_reviews;
create trigger customer_reviews_before_insert before insert on customer_reviews
  for each row execute function customer_reviews_enforce();


-- ------------------------------------------------------------
-- 6. Tell the customer they were rated
-- ------------------------------------------------------------
create or replace function customer_reviews_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare jtitle text;
begin
  select title into jtitle from jobs where id = new.job_id;
  perform notify_user(
    new.customer_id, 'rating',
    'Your pro rated you ' || new.rating || ' out of 5', jtitle, new.job_id);
  return new;
end;
$$;
drop trigger if exists customer_reviews_after_insert_notify on customer_reviews;
create trigger customer_reviews_after_insert_notify after insert on customer_reviews
  for each row execute function customer_reviews_notify();


-- ------------------------------------------------------------
-- 7. RLS
-- ------------------------------------------------------------
alter table customer_reviews enable row level security;

drop policy if exists custrev_read  on customer_reviews;
drop policy if exists custrev_write on customer_reviews;
-- Public read, exactly as `rev_read` on `reviews`: a customer's rating is
-- meant to be visible to everyone, the customer included. No update/delete
-- policy, so ratings are immutable once left — same as the other direction.
create policy custrev_read  on customer_reviews for select using (true);
create policy custrev_write on customer_reviews for insert
  with check (provider_id = auth.uid());

-- Deliberately NOT done here: a job-peer SELECT policy on `customers`.
-- Nothing needs it — providers read ratings through the view below, and the
-- address they drive to is already on `jobs`. Granting it would hand out
-- `default_address` and lat/lng for no functional gain, since RLS is
-- row-level and cannot hide those columns.


-- ------------------------------------------------------------
-- 8. Public window onto customer ratings
-- ------------------------------------------------------------
-- Not a `using (true)` policy on `customers`: that table holds the address
-- and coordinates, and RLS is row-level rather than column-level, so a
-- blanket read would be the same mistake patch_v11 fixed on `providers`.
-- The view carries the aggregates ONLY — no name, address or coordinates —
-- and runs with its owner's rights so it can read through cust_self.
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


-- ------------------------------------------------------------
-- 9. Notify on a new chat message
-- ------------------------------------------------------------
-- Deliberately coalesced: one unread 'message' alert per job at a time, or a
-- back-and-forth conversation would bury every other notification. Once the
-- reader has opened it, the next message raises a fresh one.
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
end;
$$;
drop trigger if exists messages_after_insert_notify on messages;
create trigger messages_after_insert_notify after insert on messages
  for each row execute function messages_notify();


-- ------------------------------------------------------------
-- 10. Realtime
-- ------------------------------------------------------------
do $$ begin alter publication supabase_realtime add table customer_reviews;
exception when duplicate_object then null; end $$;
