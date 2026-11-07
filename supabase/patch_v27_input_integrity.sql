-- ============================================================
-- KARIGHAR — patch v27: input integrity
-- Run ONCE in the Supabase SQL editor. Idempotent where possible.
-- Applies on top of a database already at v26.
--
-- WHY THIS PATCH EXISTS
--
-- The app is a static export (`output: "export"`), so there is no server
-- tier: every write is issued from the browser with the anon key that ships
-- in the JS bundle. Nothing in src/lib/validate.ts is a security control — a
-- crafted supabase-js call skips all of it. RLS and the constraints below are
-- the only enforcement that exists.
--
-- Contents:
--   1. jobs.proposed_price guard — the customer could set it themselves and
--      then "accept" their own figure, overwriting the pro's quote. This is
--      the hole; everything else here is narrowing or hardening.
--   2. disputes insert guard — anyone holding a job uuid could file a
--      dispute on a stranger's job, which v26 turns into a payment freeze.
--   3. disputes write narrowing — the raiser (or the counterparty) could
--      resolve or delete the dispute and unblock payment with no admin.
--   4. messages/bids/job_tracking — participants could DELETE each other's
--      rows, i.e. destroy the evidence a dispute is decided on.
--   5. notify_user and the v26 functions — executable by PUBLIC, so anon
--      could forge a notification to any user id.
--   6. Length and sign CHECKs. Every client-writable text column was
--      unbounded; several money columns had no non-negative constraint.
--
-- Constraint names are referenced by src/lib/dbErrors.ts, which maps them to
-- user-facing copy. Renaming one here means renaming it there.
--
-- Lengths mirror LIMITS in src/lib/validate.ts. The two have to agree, or
-- the user gets a Postgres error where they used to get a sentence.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Pre-flight: report rows that the new CHECKs would reject.
--
-- A constraint added to a table with violating rows fails the whole patch
-- part-way through. This says what would break BEFORE anything is altered,
-- so the patch is never half-applied.
-- ------------------------------------------------------------
do $$
declare
  n bigint;
  problems text := '';
begin
  select count(*) into n from jobs where length(btrim(title)) > 120;
  if n > 0 then problems := problems || format('  jobs.title > 120: %s row(s)%s', n, chr(10)); end if;

  select count(*) into n from jobs where length(coalesce(description, '')) > 2000;
  if n > 0 then problems := problems || format('  jobs.description > 2000: %s row(s)%s', n, chr(10)); end if;

  select count(*) into n from jobs where length(btrim(address)) > 300;
  if n > 0 then problems := problems || format('  jobs.address > 300: %s row(s)%s', n, chr(10)); end if;

  select count(*) into n from messages where length(btrim(text)) > 2000;
  if n > 0 then problems := problems || format('  messages.text > 2000: %s row(s)%s', n, chr(10)); end if;

  select count(*) into n from disputes where length(btrim(reason)) > 2000 or length(btrim(reason)) < 3;
  if n > 0 then problems := problems || format('  disputes.reason outside 3..2000: %s row(s)%s', n, chr(10)); end if;

  select count(*) into n from disputes where status not in ('open', 'resolved', 'rejected');
  if n > 0 then problems := problems || format('  disputes.status not in (open,resolved,rejected): %s row(s)%s', n, chr(10)); end if;

  select count(*) into n from profiles where length(btrim(coalesce(full_name, ''))) > 80;
  if n > 0 then problems := problems || format('  profiles.full_name > 80: %s row(s)%s', n, chr(10)); end if;

  select count(*) into n from providers where length(coalesce(bio, '')) > 1000;
  if n > 0 then problems := problems || format('  providers.bio > 1000: %s row(s)%s', n, chr(10)); end if;

  select count(*) into n from providers
   where cnic_no is not null and length(regexp_replace(cnic_no, '[^0-9]', '', 'g')) <> 13;
  if n > 0 then problems := problems || format('  providers.cnic_no not 13 digits: %s row(s)%s', n, chr(10)); end if;

  select count(*) into n from bids where amount <= 0;
  if n > 0 then problems := problems || format('  bids.amount <= 0: %s row(s)%s', n, chr(10)); end if;

  select count(*) into n from jobs where commission_rate < 0 or commission_rate > 1;
  if n > 0 then problems := problems || format('  jobs.commission_rate outside 0..1: %s row(s)%s', n, chr(10)); end if;

  if problems <> '' then
    raise exception 'patch_v27 would reject existing rows. Fix these first: %', chr(10) || problems;
  end if;
  raise notice 'patch_v27 pre-flight clean — no existing row violates the new constraints.';
end $$;


-- ------------------------------------------------------------
-- 1. jobs.proposed_price — the price-manipulation hole
--
-- v26 added the column with no CHECK and no guard. `jobs_update_customer` is
-- a row-level policy, so a customer may write ANY column of their own job —
-- including this one. The accept-exemption inside jobs_guard_actor then only
-- tested `new.price = old.proposed_price`, never who wrote `proposed_price`.
--
-- So, with the anon key and two PATCHes: set proposed_price = 500, then set
-- price = 500. The pro's real quote is gone and the price is locked at 500.
-- jobs_lock_price did not catch it either: its arrival check keys on
-- `auth.uid() = new.provider_id`, which is false when the actor is the
-- customer.
--
-- Fix: only the assigned provider may write proposed_price, and only while
-- on site. Admins keep their override.
-- ------------------------------------------------------------
alter table jobs drop constraint if exists jobs_proposed_price_non_negative;
alter table jobs add constraint jobs_proposed_price_non_negative
  check (proposed_price is null or proposed_price >= 0);

alter table jobs drop constraint if exists jobs_commission_rate_range;
alter table jobs add constraint jobs_commission_rate_range
  check (commission_rate >= 0 and commission_rate <= 1);

create or replace function jobs_guard_proposed_price()
returns trigger language plpgsql set search_path = public as $$
declare uid uuid := auth.uid();
begin
  -- Unchanged: nothing to police.
  if new.proposed_price is not distinct from old.proposed_price then
    return new;
  end if;

  -- Server-side callers (SECURITY DEFINER RPCs, the service role) and admins
  -- are trusted here, same convention as the *_guard_trusted_cols triggers.
  if uid is null or current_user <> 'authenticated' or is_admin() then
    return new;
  end if;

  -- Clearing it is part of accepting or declining, and the customer does
  -- both. Only SETTING a figure is restricted.
  if new.proposed_price is null then
    return new;
  end if;

  if uid is distinct from new.provider_id then
    raise exception 'Only the assigned pro can propose a price for this job';
  end if;

  if new.status not in ('arrived', 'in_progress') then
    raise exception 'Mark yourself arrived before proposing a price for this job';
  end if;

  if new.proposed_price <= 0 then
    raise exception 'A proposed price must be greater than zero';
  end if;

  return new;
end; $$;

drop trigger if exists jobs_guard_proposed_price_t on jobs;
create trigger jobs_guard_proposed_price_t before update on jobs
  for each row execute function jobs_guard_proposed_price();

-- Tighten the customer's accept-exemption in jobs_guard_actor: the figure
-- being accepted must actually exist. With the trigger above, a non-null
-- old.proposed_price can only have been written by the provider — so
-- requiring non-null is what ties the acceptance to a real proposal.
--
-- This is a copy of the v26 body with that one condition added; the rest is
-- deliberately unchanged.
create or replace function jobs_guard_actor()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); ok boolean;
begin
  if uid is null or is_admin() then return new; end if;

  -- ========== the customer ==========
  if uid = old.customer_id then
    if old.status = 'assigned'
       and new.provider_id is null
       and ((old.type = 'fixed' and new.status = 'created'
             and new.price is not distinct from old.price)
            or (old.type = 'custom' and new.status = 'bidding'
                and new.price is null)) then
      return new;
    end if;

    -- Accepting a price proposal. `old.proposed_price is not null` is the
    -- v27 addition: without it the customer could invent the figure in a
    -- prior UPDATE and then "accept" it here.
    if new.provider_id is not distinct from old.provider_id
       and old.price is null
       and old.proposed_price is not null
       and new.price is not null
       and new.price = old.proposed_price then
      return new;
    end if;

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
        raise exception 'A job can only be awarded to a pro who bid that amount';
      end if;
    end if;
    return new;
  end if;

  -- ========== the assigned provider ==========
  if uid = old.provider_id then
    return new;
  end if;

  -- ========== an unassigned provider claiming an open job ==========
  if old.provider_id is null and uid = new.provider_id then
    return new;
  end if;

  raise exception 'You cannot change this job';
end; $$;


-- ------------------------------------------------------------
-- 2. disputes — validate the job, like reviews already do
--
-- disp_rw's `with check` was `raised_by = auth.uid()` and nothing more, so
-- any authenticated user could insert a dispute against ANY job id. Combined
-- with v26's disputes_freeze_job (SECURITY DEFINER, no authorization check)
-- that let a third party move a stranger's completed job to `disputed` and
-- block its payment indefinitely.
--
-- reviews_enforce/customer_reviews_enforce already validate the job and its
-- parties; this is the equivalent for disputes.
-- ------------------------------------------------------------
create or replace function disputes_enforce_insert()
returns trigger language plpgsql set search_path = public as $$
declare j record;
begin
  if auth.uid() is null or current_user <> 'authenticated' then
    return new;
  end if;

  if new.raised_by is distinct from auth.uid() then
    raise exception 'A dispute must be raised by you';
  end if;

  select customer_id, provider_id into j from jobs where id = new.job_id;
  if not found then
    raise exception 'That job does not exist';
  end if;

  if auth.uid() <> j.customer_id
     and (j.provider_id is null or auth.uid() <> j.provider_id) then
    raise exception 'You can only raise a dispute on your own job';
  end if;

  -- A dispute always starts open; only an admin moves it on (see section 3).
  new.status := 'open';
  return new;
end; $$;

drop trigger if exists disputes_enforce_insert_t on disputes;
create trigger disputes_enforce_insert_t before insert on disputes
  for each row execute function disputes_enforce_insert();

-- The freeze itself gets an authorization check. It is SECURITY DEFINER and
-- was callable with no checks at all; the insert guard above is the primary
-- gate, but a definer function that moves a job between statuses should not
-- rely on its only caller staying honest.
create or replace function disputes_freeze_job()
returns trigger language plpgsql security definer set search_path = public as $$
declare st text; j record;
begin
  select customer_id, provider_id into j from jobs where id = new.job_id;
  if not found then return new; end if;

  if auth.uid() is not null
     and not is_admin()
     and auth.uid() <> j.customer_id
     and (j.provider_id is null or auth.uid() <> j.provider_id) then
    raise exception 'You can only raise a dispute on your own job';
  end if;

  select status into st from jobs where id = new.job_id;
  if st in ('completed', 'paid') then
    update jobs set status = 'disputed' where id = new.job_id;
  end if;
  return new;
end; $$;

drop trigger if exists disputes_freeze_t on disputes;
create trigger disputes_freeze_t after insert on disputes
  for each row execute function disputes_freeze_job();


-- ------------------------------------------------------------
-- 3. disputes — stop the raiser resolving or deleting their own dispute
--
-- `disp_rw` was `for all`, `disputes.status` was free text with no CHECK, and
-- jobs_block_paid_with_open_dispute tests `status is distinct from
-- 'resolved'`. So the raiser could PATCH status='resolved' (or DELETE the
-- row) and unblock payment with no admin involved. Worse: DELETE is checked
-- against `using` only, and `using` matched any job participant — so the
-- provider could delete the customer's dispute outright.
--
-- Select + insert for participants; everything else is disp_admin's.
-- ------------------------------------------------------------
alter table disputes drop constraint if exists disputes_status_valid;
alter table disputes add constraint disputes_status_valid
  check (status in ('open', 'resolved', 'rejected'));

drop policy if exists disp_rw on disputes;

drop policy if exists disp_read on disputes;
create policy disp_read on disputes for select
  using (raised_by = auth.uid() or is_admin()
         or exists(select 1 from jobs j where j.id = disputes.job_id
                   and (j.customer_id = auth.uid() or j.provider_id = auth.uid())));

drop policy if exists disp_insert on disputes;
create policy disp_insert on disputes for insert
  with check (raised_by = auth.uid());


-- ------------------------------------------------------------
-- 4. messages / bids / job_tracking — keep the audit trail
--
-- All three were `for all` with a participant-scoped `using`. Because DELETE
-- is checked against `using` and not `with check`, a customer could delete
-- the provider's messages and bids, and the provider could delete the
-- customer's. For a cash-on-delivery marketplace whose dispute evidence IS
-- the chat log, that is the wrong default.
--
-- Nothing in src/ issues a DELETE against any of these three tables, so
-- dropping that right breaks no product behaviour.
-- ------------------------------------------------------------
drop policy if exists msg_rw on messages;

drop policy if exists msg_read on messages;
create policy msg_read on messages for select
  using (exists(select 1 from jobs j where j.id = messages.job_id
                and (j.customer_id = auth.uid() or j.provider_id = auth.uid()))
         or is_admin());

-- The job-membership test is NEW, not a carry-over. msg_rw's `with check`
-- was `sender_id = auth.uid()` and nothing else, so any authenticated user
-- holding a job uuid could post into a stranger's chat as themselves — the
-- `using` clause scoped who could READ the thread but never who could write
-- to it. Both halves are needed.
drop policy if exists msg_insert on messages;
create policy msg_insert on messages for insert
  with check (sender_id = auth.uid()
              and exists(select 1 from jobs j where j.id = messages.job_id
                         and (j.customer_id = auth.uid() or j.provider_id = auth.uid())));

drop policy if exists bids_rw on bids;

drop policy if exists bids_read on bids;
create policy bids_read on bids for select
  using (provider_id = auth.uid() or is_admin()
         or exists(select 1 from jobs j where j.id = bids.job_id
                   and j.customer_id = auth.uid()));

-- The insert conditions are bids_rw's `with check`, carried over VERBATIM.
-- `not is_attached_tech()` and the two-status test are load-bearing and
-- documented at schema.sql:1940-1948: without them an attached technician
-- holding an open job's uuid could bid, have the customer award it, and drag
-- that job's commission onto a business that never dispatched it.
drop policy if exists bids_insert on bids;
create policy bids_insert on bids for insert
  with check (
    is_admin()
    or (provider_id = auth.uid()
        and not is_attached_tech()
        and exists (select 1 from jobs j
                    where j.id = bids.job_id
                      and j.provider_id is null
                      and j.status in ('created','bidding')))
  );

-- The award path runs inside customer_award_bid() (SECURITY DEFINER), so it
-- does not need a client-facing UPDATE policy. Admins keep theirs.
drop policy if exists bids_admin on bids;
create policy bids_admin on bids for all using (is_admin()) with check (is_admin());

drop policy if exists track_rw on job_tracking;

drop policy if exists track_read on job_tracking;
create policy track_read on job_tracking for select
  using (exists(select 1 from jobs j where j.id = job_tracking.job_id
                and (j.customer_id = auth.uid() or j.provider_id = auth.uid()))
         or is_admin());

drop policy if exists track_write on job_tracking;
create policy track_write on job_tracking for insert
  with check (exists(select 1 from jobs j where j.id = job_tracking.job_id
                     and j.provider_id = auth.uid()));

drop policy if exists track_update on job_tracking;
create policy track_update on job_tracking for update
  using (exists(select 1 from jobs j where j.id = job_tracking.job_id
                and j.provider_id = auth.uid()))
  with check (exists(select 1 from jobs j where j.id = job_tracking.job_id
                     and j.provider_id = auth.uid()));

drop policy if exists track_admin on job_tracking;
create policy track_admin on job_tracking for all using (is_admin()) with check (is_admin());


-- ------------------------------------------------------------
-- 5. Function grants
--
-- schema.sql:1673-1711 revokes-then-grants the v18..v24 functions. The v26
-- functions were granted with no preceding revoke, so they kept the default
-- PUBLIC execute privilege — i.e. the `anon` role could call them. Each of
-- those starts with its own auth check, so the practical impact was nil, but
-- notify_user() has NO auth check: anon could forge a notification to any
-- user id, which the pending email webhook would then deliver under the
-- karighar domain.
-- ------------------------------------------------------------
revoke all on function notify_user(uuid, text, text, text, uuid) from public;
revoke all on function disputes_freeze_job()                     from public;
revoke all on function disputes_enforce_insert()                 from public;
revoke all on function jobs_guard_proposed_price()               from public;

-- notify_user is only ever called from inside other definer functions and
-- triggers, never from the client, so it is granted to service_role alone.
grant execute on function notify_user(uuid, text, text, text, uuid) to service_role;

-- The v26 RPCs the client does call. Each already checks auth.uid()/is_admin()
-- internally; this just removes the PUBLIC (anon) grant they were left with.
do $$
begin
  execute 'revoke all on function customer_award_bid(uuid, uuid) from public';
  execute 'grant execute on function customer_award_bid(uuid, uuid) to authenticated, service_role';
  execute 'revoke all on function customer_unassign_pro(uuid) from public';
  execute 'grant execute on function customer_unassign_pro(uuid) to authenticated, service_role';
  execute 'revoke all on function admin_update_job_status(uuid, text) from public';
  execute 'grant execute on function admin_update_job_status(uuid, text) to authenticated, service_role';
  execute 'revoke all on function business_settle_with_tech(uuid, numeric) from public';
  execute 'grant execute on function business_settle_with_tech(uuid, numeric) to authenticated, service_role';
exception when undefined_function then
  raise notice 'one or more v26 RPCs absent — skipping their grant fix';
end $$;

do $$
begin
  execute 'revoke all on function freelance_active_jobs(uuid) from public';
  execute 'revoke all on function is_freelance_provider(uuid) from public';
exception when undefined_function then
  raise notice 'freelance helpers absent — skipping their revoke';
end $$;

do $$
begin
  execute 'revoke all on function business_share_outstanding_for(uuid, uuid) from public';
  execute 'grant execute on function business_share_outstanding_for(uuid, uuid) to authenticated, service_role';
exception when undefined_function then
  raise notice 'business_share_outstanding_for absent — skipping';
end $$;


-- ------------------------------------------------------------
-- 6. Length and sign constraints
--
-- Every client-writable text column was unbounded `text`. With no server
-- tier and no per-byte rate limiting, storing a multi-MB string in
-- jobs.title was self-serve. Lengths mirror LIMITS in src/lib/validate.ts.
--
-- btrim() in the length tests so trailing whitespace cannot be used to
-- squeeze past a cap the client measured after trimming.
-- ------------------------------------------------------------
alter table jobs drop constraint if exists jobs_title_len;
alter table jobs add constraint jobs_title_len
  check (length(btrim(title)) between 1 and 120);

alter table jobs drop constraint if exists jobs_description_len;
alter table jobs add constraint jobs_description_len
  check (description is null or length(description) <= 2000);

alter table jobs drop constraint if exists jobs_address_len;
alter table jobs add constraint jobs_address_len
  check (length(btrim(address)) between 1 and 300);

alter table messages drop constraint if exists messages_text_len;
alter table messages add constraint messages_text_len
  check (length(btrim(text)) between 1 and 2000);

alter table disputes drop constraint if exists disputes_reason_len;
alter table disputes add constraint disputes_reason_len
  check (length(btrim(reason)) between 3 and 2000);

alter table profiles drop constraint if exists profiles_full_name_len;
alter table profiles add constraint profiles_full_name_len
  check (full_name is null or length(btrim(full_name)) <= 80);

alter table providers drop constraint if exists providers_bio_len;
alter table providers add constraint providers_bio_len
  check (bio is null or length(bio) <= 1000);

-- The CNIC format was checked in the RPCs and in the client, but never on
-- the column — so the self-serve providers.upsert path could store anything.
alter table providers drop constraint if exists providers_cnic_len;
alter table providers add constraint providers_cnic_len
  check (cnic_no is null or length(regexp_replace(cnic_no, '[^0-9]', '', 'g')) = 13);

-- 1200, not the client's 1000: the phone lane prepends review tags and
-- appends a tip line to the comment body, so the stored string is longer
-- than what the user typed into the box.
alter table reviews drop constraint if exists reviews_comment_len;
alter table reviews add constraint reviews_comment_len
  check (comment is null or length(comment) <= 1200);

alter table customer_reviews drop constraint if exists customer_reviews_comment_len;
alter table customer_reviews add constraint customer_reviews_comment_len
  check (comment is null or length(comment) <= 1200);

alter table bids drop constraint if exists bids_amount_positive;
alter table bids add constraint bids_amount_positive
  check (amount > 0);

alter table bids drop constraint if exists bids_note_len;
alter table bids add constraint bids_note_len
  check (note is null or length(note) <= 300);

alter table services drop constraint if exists services_base_price_non_negative;
alter table services add constraint services_base_price_non_negative
  check (base_price is null or base_price >= 0);

alter table services drop constraint if exists services_visit_fee_non_negative;
alter table services add constraint services_visit_fee_non_negative
  check (visit_fee >= 0);

alter table payments drop constraint if exists payments_amounts_non_negative;
alter table payments add constraint payments_amounts_non_negative
  check (amount >= 0 and commission >= 0 and provider_earning >= 0);


-- ------------------------------------------------------------
-- Done. Expected notices: the pre-flight "clean" line, plus a skip notice
-- for any v26 helper this database does not have.
-- ------------------------------------------------------------
