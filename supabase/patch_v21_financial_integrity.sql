-- ============================================================
-- KARIGHAR — patch v21: close the financial integrity gaps
-- Run ONCE in the Supabase SQL editor. Idempotent.
--
-- Closes findings P0-1, P0-2, P1-3, P1-4, P1-5, P2-6 and P2-7 from
-- FINANCIAL_AUDIT.md. In one patch because several of them share a guard and
-- splitting would leave the ledger inconsistent between migrations.
--
-- The headline problem
-- --------------------
-- `jobs_update_customer` is `using/with check (customer_id = auth.uid())`.
-- RLS is row-level, so that constrains ONE column and leaves `provider_id`,
-- `price` and `status` writable. `jobs_enforce_status()` validates which
-- TRANSITION is legal but never WHO is making it. Nothing anywhere checked an
-- awarded price against a real row in `bids`.
--
-- Composed, that let any signed-in customer assign any approved technician at
-- any price and then walk the job alone to `paid` — booking a commission debt
-- against a technician for work that never happened.
--
-- !! ENUM TRANSACTION TRAP: 'refunded' is added to payment_status here and is
-- !! used ONLY inside a function body, which is resolved at execution rather
-- !! than at creation. Do not add a top-level statement using that literal.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Enum + column constraints (P2-6, P1-5)
-- ------------------------------------------------------------
alter type payment_status add value if not exists 'refunded';

do $$ begin
  alter table jobs add constraint jobs_price_non_negative
    check (price is null or price >= 0);
exception when duplicate_object then null; end $$;

-- `payments.job_id` had only a foreign key. The sole defence against a second
-- payment row — and a duplicate set of ledger entries — was a read-then-write
-- inside jobs_on_paid. Make the database the authority instead.
-- Any historical duplicate is collapsed to the earliest row first, otherwise
-- the constraint cannot be created.
delete from payments p
 using payments q
 where p.job_id = q.job_id
   and (q.created_at, q.id) < (p.created_at, p.id);

do $$ begin
  alter table payments add constraint payments_one_per_job unique (job_id);
exception when duplicate_object then null; end $$;


-- ------------------------------------------------------------
-- 2. THE ACTOR GUARD (P0-1)
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- 3. One payment row per job, enforced by the constraint (P1-5)
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- 4. Reversals (P0-2)
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- 5. Settlements can no longer exceed what is owed (P1-3, P1-4)
-- ------------------------------------------------------------
-- What an account still owes Karighar: commission raised, less anything
-- already remitted or reversed.
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

-- What a technician still owes their business for cash collected on its behalf.
-- Not scoped per business: a settlement row carries no job_id, so it cannot be
-- attributed to one. business_members_one_active means a technician has at most
-- one employer at a time, so in practice the two are the same number — and
-- capping on the total is the safe direction either way.
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


-- ------------------------------------------------------------
-- 6. Reconciliation (P2-7, P2-8)
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- 7. Grants
-- ------------------------------------------------------------
revoke all on function reverse_job_charges(uuid, text)        from public;
revoke all on function commission_outstanding(uuid)           from public;
revoke all on function business_share_outstanding(uuid)       from public;
revoke all on function admin_reconciliation()                 from public;

grant execute on function reverse_job_charges(uuid, text)     to authenticated, service_role;
grant execute on function commission_outstanding(uuid)        to authenticated, service_role;
grant execute on function business_share_outstanding(uuid)    to authenticated, service_role;
grant execute on function admin_reconciliation()              to authenticated, service_role;


-- ============================================================
-- Verify
-- ============================================================
-- As a CUSTOMER on your own quote job, every one of these must now raise:
--   update jobs set provider_id = '<a pro who never bid>' where id = '<job>';
--   update jobs set provider_id = '<a real bidder>', price = 1 where id = '<job>';
--   update jobs set status = 'completed' where id = '<job>';   -- from 'assigned'
--
-- And the legitimate path must still pass: award a real pending bid at its
-- exact amount, then confirm exactly one row lands in `payments`.
--
-- As the ASSIGNED PRO, the work transitions must still pass, and
--   update jobs set status = 'rated' where id = '<job>';
-- must raise.
--
-- Reversal:
--   select reverse_job_charges('<paid job>', 'customer refunded in full');
--   select * from admin_reconciliation();   -- commission_delta must be 0.00
--   select reverse_job_charges('<same job>', 'again');   -- must raise
--
-- Caps:
--   select record_settlement('<pro>', commission_outstanding('<pro>') + 1);  -- raises
