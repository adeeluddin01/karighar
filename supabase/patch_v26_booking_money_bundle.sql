-- ============================================================
-- KARIGHAR — patch v26: booking + money fix bundle
-- Run ONCE in the Supabase SQL editor. Idempotent where possible.
-- Applies on top of a database already at v25 (live, 2026-11-03).
--
-- Contents (see ~/workspace/karighar-booking-money-audit/REPORT.md):
--   1. jobs.proposed_price — pro price proposal, customer accepts.
--   2. provider_ledger.settlement_business_id — per-business settlement
--      attribution, so a technician changing teams cannot have their old
--      business's share collected by the new one.
--   3. Freelance cap: an independent pro may hold at most 3 active
--      jobs (assigned/en_route/arrived/in_progress). Enforced by a
--      trigger on every path that sets provider_id, not just the UI.
--   4. Customer unassign: at `assigned` only, the customer may drop
--      the pro and reopen the job (fixed -> created, custom -> bidding).
--      Implemented as an RPC because the v21 guard forbids a direct
--      unassign and the price lock forbids resetting an awarded price.
--   5. Atomic bid award RPC: job assignment + bid award/reject in one
--      transaction, replacing the three separate client updates.
--   6. Dispute freeze: a dispute raised at completed/paid moves the job
--      to disputed, and a job with an open dispute cannot move to paid.
--      Reversal now also closes the job's open disputes.
--   7. Paid-price guard: jobs_on_paid refuses a paid job with a null
--      or zero price instead of booking a Rs 0 payment.
--   8. Business assignment rejects pending bids, so a customer cannot
--      later award a stale bid and silently undo a dispatch.
--   9. Admin job-status RPC for stuck jobs (admin only).
--  10. Booking time must be in the future (null = flexible, allowed).
--  11. Notifications for a price proposal and for a move to paid.
--
-- Paid-confirmation rule, decided for this bundle: either party may
-- confirm payment (as today), because requiring both would strand jobs
-- whenever one party goes silent — the exact leakage the stranded-
-- completed metric measures. The safeguards are instead: the paid
-- action shows the exact amount, both parties are notified on paid,
-- and an open dispute now blocks paid (section 6).
-- ============================================================


-- ------------------------------------------------------------
-- 1 + 2. New columns (idempotent)
-- ------------------------------------------------------------
do $$ begin
  alter table jobs add column proposed_price numeric(10,2);
exception when duplicate_column then null; end $$;

do $$ begin
  alter table provider_ledger add column settlement_business_id uuid;
exception when duplicate_column then null; end $$;


-- ------------------------------------------------------------
-- 3. Freelance cap
-- ------------------------------------------------------------
create or replace function freelance_active_jobs(p_provider uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from jobs
  where provider_id = p_provider
    and status in ('assigned', 'en_route', 'arrived', 'in_progress');
$$;

-- Independent pro = a providers row with no live team membership.
-- Attached technicians are exempt: their work arrives only through
-- their business, which already limits what they can take.
create or replace function is_freelance_provider(p_provider uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from providers p where p.profile_id = p_provider)
     and not exists (
       select 1 from business_members m
       join businesses b on b.profile_id = m.business_id
       where m.provider_id = p_provider
         and m.status = 'active' and b.status = 'active'
     );
$$;

create or replace function jobs_enforce_freelance_cap()
returns trigger language plpgsql set search_path = public as $$
begin
  if is_admin() then return new; end if;
  if new.provider_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.provider_id is not distinct from old.provider_id then
    return new;
  end if;
  if is_freelance_provider(new.provider_id)
     and freelance_active_jobs(new.provider_id) >= 3 then
    raise exception 'This pro already has 3 active jobs — they must complete one before taking another.';
  end if;
  return new;
end; $$;

drop trigger if exists jobs_freelance_cap_t on jobs;
create trigger jobs_freelance_cap_t before insert or update on jobs
  for each row execute function jobs_enforce_freelance_cap();


-- ------------------------------------------------------------
-- 4. State machine + guard + price lock: allow unassign, and only
--    unassign, at `assigned`
-- ------------------------------------------------------------
-- State machine: assigned may now return to created / bidding, but
-- only through the unassign path the guard below permits. Direct
-- moves to created/bidding by anyone else are still blocked by the
-- guard (pro branch never allows them; customer branch allows them
-- only for a genuine unassign).
-- Replacing the function body: the case list gains the two
-- unassign targets for `assigned`. (NOT wrapped in a DO block: the
-- function's own dollar-quote body delimiter would end a DO block early and
-- leave `declare` as top-level SQL — that was the 42601 error.)
create or replace function jobs_enforce_status()
returns trigger language plpgsql set search_path = public as $$
declare ok boolean;
begin
  if is_admin() then return new; end if;
  ok := case old.status
    when 'created'     then new.status in ('assigned','cancelled')
    when 'bidding'     then new.status in ('assigned','cancelled')
    when 'assigned'    then new.status in ('en_route','cancelled','created','bidding')
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

-- Guard: customer unassign exemption, checked BEFORE the bid check
-- (which would otherwise raise "cannot be unassigned" on the null
-- provider) and before the status allow-list.
create or replace function jobs_guard_actor()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); ok boolean;
begin
  if uid is null or is_admin() then return new; end if;

  -- ========== the customer ==========
  if uid = old.customer_id then
    -- Unassign: assigned job, provider cleared, back to the open state
    -- for its type, price untouched for fixed and reset for custom.
    -- Nothing is paid yet at `assigned`, so no money moves.
    if old.status = 'assigned'
       and new.provider_id is null
       and ((old.type = 'fixed' and new.status = 'created'
             and new.price is not distinct from old.price)
            or (old.type = 'custom' and new.status = 'bidding'
                and new.price is null)) then
      return new;
    end if;

    -- Accepting a price proposal: provider unchanged, price moves
    -- from null to exactly the proposed figure. Not a bid, so the
    -- bid check below must not run for it.
    if new.provider_id is not distinct from old.provider_id
       and old.price is null
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

-- Price lock: allow the unassign price reset (custom job back to
-- bidding with a null price). Every other re-price stays blocked.
create or replace function jobs_lock_price()
returns trigger language plpgsql set search_path = public as $$
begin
  if is_admin() then return new; end if;

  if old.status = 'assigned'
     and new.provider_id is null
     and new.status = 'bidding'
     and old.price is not null
     and new.price is null then
    return new;
  end if;

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


-- ------------------------------------------------------------
-- 5. Atomic bid award RPC (replaces the 3 client updates)
-- ------------------------------------------------------------
create or replace function customer_award_bid(p_job uuid, p_bid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); j jobs%rowtype; b bids%rowtype;
begin
  if uid is null then raise exception 'Sign in first'; end if;

  select * into j from jobs where id = p_job for update;
  if not found then raise exception 'Job not found'; end if;
  if j.customer_id <> uid then raise exception 'Not your booking'; end if;
  if j.status <> 'bidding' then raise exception 'This job is not collecting quotes'; end if;
  if j.provider_id is not null then raise exception 'This job is already assigned'; end if;

  select * into b from bids where id = p_bid and job_id = p_job for update;
  if not found then raise exception 'That quote is not on offer for this job'; end if;
  if b.status <> 'pending' then raise exception 'That quote is no longer available'; end if;

  -- One transaction: the job update fires the guard (bid check passes
  -- because the bid is still pending), the business stamp, and the
  -- freelance cap trigger. If any of them raises, nothing is written.
  update jobs set provider_id = b.provider_id, price = b.amount, status = 'assigned'
  where id = p_job;
  update bids set status = 'awarded' where id = p_bid;
  update bids set status = 'rejected'
  where job_id = p_job and id <> p_bid and status = 'pending';
end; $$;

grant execute on function customer_award_bid(uuid, uuid) to authenticated;


-- ------------------------------------------------------------
-- 4 (continued). Customer unassign RPC
-- ------------------------------------------------------------
create or replace function customer_unassign_pro(p_job uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); j jobs%rowtype; old_provider uuid;
begin
  if uid is null then raise exception 'Sign in first'; end if;

  select * into j from jobs where id = p_job for update;
  if not found then raise exception 'Job not found'; end if;
  if j.customer_id <> uid then raise exception 'Not your booking'; end if;
  if j.status <> 'assigned' then raise exception 'Only an assigned job can be reopened'; end if;
  if j.provider_id is null then raise exception 'This job has no pro to remove'; end if;
  old_provider := j.provider_id;

  -- The winning quote goes back on offer; quotes already rejected
  -- stay rejected (those pros may submit a fresh quote).
  update bids set status = 'pending'
  where job_id = p_job and status = 'awarded';

  update jobs
  set provider_id = null,
      status = case when j.type = 'custom' then 'bidding' else 'created' end,
      price = case when j.type = 'custom' then null else price end,
      proposed_price = null
  where id = p_job;

  perform notify_user(old_provider, 'status', 'Job reopened',
    j.title || ' is open again — the customer removed the assignment.', p_job);
end; $$;

grant execute on function customer_unassign_pro(uuid) to authenticated;


-- ------------------------------------------------------------
-- 6. Dispute freeze + paid block + reversal closes disputes
-- ------------------------------------------------------------
create or replace function disputes_freeze_job()
returns trigger language plpgsql security definer set search_path = public as $$
declare st text;
begin
  select status into st from jobs where id = new.job_id;
  if st in ('completed', 'paid') then
    update jobs set status = 'disputed' where id = new.job_id;
  end if;
  return new;
end; $$;

drop trigger if exists disputes_freeze_t on disputes;
create trigger disputes_freeze_t after insert on disputes
  for each row execute function disputes_freeze_job();

create or replace function jobs_block_paid_with_open_dispute()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from disputes d
             where d.job_id = new.id and d.status is distinct from 'resolved') then
    raise exception 'This job has an open dispute — resolve it before marking paid.';
  end if;
  return new;
end; $$;

drop trigger if exists jobs_block_paid_dispute_t on jobs;
create trigger jobs_block_paid_dispute_t before update on jobs
  for each row when (new.status = 'paid' and old.status is distinct from 'paid')
  execute function jobs_block_paid_with_open_dispute();

-- Reversal: close the job's open disputes as part of the same
-- transaction. The job's status and reviews are deliberately left
-- alone: a refunded job keeps its accountability history, and the
-- payment row (now 'refunded') is what distinguishes it.
-- This replaces only the tail of reverse_job_charges; the function
-- below is the full current body plus the dispute close, so the patch
-- is self-contained.
create or replace function reverse_job_charges(p_job uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare j jobs%rowtype; pay payments%rowtype; biz_cut numeric;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'Give a reason for the reversal'; end if;

  select * into j from jobs where id = p_job for update;
  if not found then raise exception 'Job not found'; end if;

  select * into pay from payments where job_id = p_job for update;
  if not found then raise exception 'That job was never paid, so there is nothing to reverse'; end if;

  if exists (select 1 from provider_ledger where job_id = p_job and type = 'adjustment') then
    raise exception 'That job has already been reversed'; end if;

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
     set resolution = coalesce(resolution || ' | ', '') || 'Reversed: ' || btrim(p_reason),
         status = 'resolved'
   where job_id = p_job and status is distinct from 'resolved';
end; $$;


-- ------------------------------------------------------------
-- 7. Paid-price guard inside jobs_on_paid
-- ------------------------------------------------------------
-- The function below is the v21 body with one added guard at the
-- top: a paid job with no price, or a zero price, is refused instead
-- of booking a Rs 0 payment that the one-per-job constraint would
-- then prevent from ever being corrected.
create or replace function jobs_on_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare amt numeric; commission numeric; payout numeric;
        tech_cut numeric; biz_cut numeric; booked int;
begin
  if new.price is null or new.price <= 0 then
    raise exception 'A job cannot be paid without a price';
  end if;

  amt        := coalesce(new.price, 0);
  commission := round(amt * new.commission_rate, 2);
  payout     := amt - commission;

  if new.business_id is not null then
    payout := round(amt * coalesce(new.tech_share, 0), 2);
  end if;

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


-- ------------------------------------------------------------
-- 8. Business assignment rejects pending bids
-- ------------------------------------------------------------
create or replace function business_assign_job(p_job uuid, p_provider uuid)
returns void language plpgsql security definer set search_path = public as $$
declare biz uuid := auth.uid(); j jobs%rowtype;
begin
  if biz is null then raise exception 'Sign in first'; end if;
  if not is_active_business() then raise exception 'Not a business account'; end if;

  if not exists (select 1 from business_members m
                 where m.business_id = biz and m.provider_id = p_provider
                   and m.status = 'active') then
    raise exception 'That technician is not on your team'; end if;

  select * into j from jobs where id = p_job for update;
  if not found then raise exception 'Job not found'; end if;
  if j.provider_id is not null then raise exception 'That job has already been taken'; end if;
  if j.status not in ('created','bidding') then raise exception 'That job is no longer open'; end if;
  if j.price is null then
    raise exception 'Send a quote first - this job has no agreed price yet'; end if;

  -- Otherwise the customer could later award a stale pending bid and
  -- silently undo this dispatch (guard passes on a real bid, status
  -- stays `assigned`, stamp re-derives business to null).
  update bids set status = 'rejected'
  where job_id = p_job and status = 'pending';

  update jobs set provider_id = p_provider, status = 'assigned' where id = p_job;
end; $$;


-- ------------------------------------------------------------
-- 9. Admin job-status RPC for stuck jobs
-- ------------------------------------------------------------
create or replace function admin_update_job_status(p_job uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if p_status not in ('created','bidding','assigned','en_route','arrived',
                      'in_progress','completed','paid','rated','cancelled','disputed') then
    raise exception 'Unknown job status';
  end if;
  update jobs set status = p_status where id = p_job;
  if not found then raise exception 'Job not found'; end if;
end; $$;

grant execute on function admin_update_job_status(uuid, text) to authenticated;


-- ------------------------------------------------------------
-- 10. Booking time must be in the future (null = flexible)
-- ------------------------------------------------------------
create or replace function jobs_enforce_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare svc services%rowtype; recent int;
begin
  select count(*) into recent from jobs
    where customer_id = new.customer_id and created_at > now() - interval '10 minutes';
  if recent >= 6 then
    raise exception 'Too many bookings in a short time — please wait a few minutes.';
  end if;

  if new.scheduled_at is not null and new.scheduled_at < now() then
    raise exception 'Booking time must be in the future.';
  end if;

  if new.type = 'fixed' then
    if new.service_id is null then raise exception 'A fixed job needs a service'; end if;
    select * into svc from services where id = new.service_id and is_active = true;
    if not found then raise exception 'That service is not available'; end if;
    new.price := svc.base_price;
    new.status := 'created';
  else
    new.price := null;
    new.status := 'bidding';
  end if;
  new.commission_rate := default_commission_rate(new.type, 'provider');
  return new;
end; $$;


-- ------------------------------------------------------------
-- 11. Notifications: price proposal + move to paid
-- ------------------------------------------------------------
create or replace function jobs_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.provider_id is null and new.provider_id is not null then
    perform notify_user(new.customer_id, 'job_assigned', 'A pro is assigned', new.title, new.id);
    perform notify_user(new.provider_id, 'job_new', 'New job assigned', new.title, new.id);
  end if;
  if old.provider_id is not null and new.provider_id is null then
    perform notify_user(old.provider_id, 'status', 'Job reopened',
      new.title || ' is open again.', new.id);
  end if;
  if new.proposed_price is distinct from old.proposed_price
     and new.proposed_price is not null then
    perform notify_user(new.customer_id, 'status', 'Price proposed',
      'Your pro proposed ' || new.proposed_price::text || ' for ' || new.title, new.id);
  end if;
  if new.status is distinct from old.status then
    if new.status in ('en_route','arrived','in_progress','completed') then
      perform notify_user(new.customer_id, 'status', 'Update on ' || new.title,
        'Status: ' || replace(new.status::text, '_', ' '), new.id);
    elsif new.status = 'cancelled' then
      perform notify_user(new.customer_id, 'status', 'Booking cancelled', new.title, new.id);
      perform notify_user(new.provider_id, 'status', 'Job cancelled', new.title, new.id);
    elsif new.status = 'paid' then
      perform notify_user(new.customer_id, 'status', 'Payment recorded', new.title, new.id);
      perform notify_user(new.provider_id, 'status', 'Payment recorded', new.title, new.id);
    elsif new.status = 'rated' then
      perform notify_user(new.provider_id, 'rating', 'You got a new rating', new.title, new.id);
    end if;
  end if;
  return new;
end; $$;


-- ------------------------------------------------------------
-- 2 (continued). Per-business settlement attribution
-- ------------------------------------------------------------
create or replace function business_share_outstanding_for(p_provider uuid, p_business uuid)
returns numeric language sql security definer stable set search_path = public as $$
  select round(-coalesce(sum(amount), 0), 2)
  from provider_ledger l
  left join jobs j on j.id = l.job_id
  where l.provider_id = p_provider and l.type = 'business_share'
    and (j.business_id = p_business or l.settlement_business_id = p_business);
$$;

-- Replaces the v21 version: same active-membership check, but the cap
-- is what this technician owes THIS business, not their account total.
-- Legacy settlement rows (settlement_business_id null, job_id null)
-- are unattributed and therefore excluded from the per-business cap;
-- they still count in the account total shown on the earnings screen.
create or replace function business_settle_with_tech(p_provider uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare biz uuid := auth.uid(); owed numeric;
begin
  if not is_active_business() then raise exception 'Not a business account'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  if not exists (select 1 from business_members m
                 where m.business_id = biz and m.provider_id = p_provider
                   and m.status = 'active') then
    raise exception 'Not one of your technicians'; end if;

  owed := business_share_outstanding_for(p_provider, biz);
  if p_amount > owed + 0.005 then
    raise exception 'That is more than the % they still owe you', round(owed, 2);
  end if;

  insert into provider_ledger(provider_id, job_id, type, amount, balance, settlement_business_id) values
    (p_provider, null, 'business_share',  p_amount, 0, biz),
    (biz,        null, 'business_share', -p_amount, 0, biz);
end; $$;

grant execute on function business_settle_with_tech(uuid, numeric) to authenticated;
