-- ============================================================
-- KARIGHAR — patch v30: orphaned ledger lines
-- Run ONCE in the Supabase SQL editor. Idempotent.
--
-- WHAT WENT WRONG
--
-- The admin settlements screen reported "Books do not reconcile, Rs -400"
-- with all four of its checks clean: no duplicate payments, no paid job
-- missing a payment row, and no individual job whose ledger and payment
-- disagreed. The money was real and nothing could find it.
--
-- Diagnosis: one Rs 2,000 job had been deleted. The two financial tables
-- disagree about what that means --
--
--     payments.job_id        references jobs(id) on delete cascade
--     provider_ledger.job_id references jobs(id) on delete set null
--
-- -- so the payment row was destroyed while its two ledger lines survived
-- with job_id set to null:  earning +1,600 and commission -400.
--
-- admin_reconciliation() sums provider_ledger with NO job filter, so it kept
-- counting that orphaned -400 while the payment it should have matched no
-- longer existed. Worse, commission_outstanding() reads the same unfiltered
-- ledger, so the provider's balance was Rs 400 too high and the Record
-- button pre-filled the inflated figure.
--
-- Deleting a CUSTOMER does the same thing at one remove: jobs.customer_id
-- cascades from customers, so removing a test account silently takes their
-- jobs and payments with it and leaves the ledger behind.
--
-- Three fixes below: finish v27, stop orphans forming, and make them
-- impossible to hide if they ever do.
--
-- Run supabase/diagnose_ledger_drift.sql section 2 FIRST to clear the
-- existing orphans. Section 2 of this patch will fail while they remain,
-- which is deliberate -- the constraint should not be added over bad data.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Finish patch_v27
--
-- v27's final statement named a column that does not exist
-- (`provider_earning`; the column is `provider_payout`). The SQL editor does
-- not run a multi-statement script in one transaction, so everything before
-- it committed and only this one constraint was lost.
-- ------------------------------------------------------------
do $$
begin
  alter table payments add constraint payments_amounts_non_negative
    check (amount >= 0 and commission >= 0 and provider_payout >= 0);
exception when duplicate_object then
  raise notice 'payments_amounts_non_negative already present';
end $$;


-- ------------------------------------------------------------
-- 2. Stop orphans forming
--
-- Make the ledger cascade exactly as payments already does, so a deleted job
-- takes its WHOLE financial record with it and the two sides can never
-- disagree again.
--
-- This overrides the original `on delete set null`, which was chosen so the
-- ledger would outlive the job. That intent is sound for an append-only book
-- -- but it is not what the rest of the schema does, and as implemented it
-- produced a bill nobody could explain or dispute. Half a financial record is
-- worse than none: there is no job to show the provider, no payment to
-- reconcile against, and no way to tell a real debt from a deletion artefact.
--
-- THE STRICTER ALTERNATIVE, if you would rather keep history than keep the
-- ability to delete: leave the FK alone and stop jobs being deletable at all,
-- which is what jobs.provider_id and jobs.business_id already do --
--
--   alter table jobs drop constraint jobs_customer_id_fkey;
--   alter table jobs add constraint jobs_customer_id_fkey
--     foreign key (customer_id) references customers(profile_id);  -- NO ACTION
--
-- That preserves every record forever at the cost of never being able to
-- remove a customer who has jobs. Pick one; the bug was having both halves
-- of the contradiction at once.
-- ------------------------------------------------------------
alter table provider_ledger drop constraint if exists provider_ledger_job_id_fkey;
alter table provider_ledger add constraint provider_ledger_job_id_fkey
  foreign key (job_id) references jobs(id) on delete cascade;

-- Belt and braces: a non-payout line must have a job. 'payout' is the one
-- type that legitimately has none -- that is how record_settlement() books a
-- cash remittance against the account rather than against any single job.
do $$
begin
  alter table provider_ledger add constraint provider_ledger_job_required
    check (job_id is not null or type = 'payout');
exception when duplicate_object then
  raise notice 'provider_ledger_job_required already present';
end $$;


-- ------------------------------------------------------------
-- 3. Make an orphan impossible to hide
--
-- The screen had four checks and not one of them could see this. Add a fifth
-- so a delta always has somewhere to point.
--
-- The return type changes, so the old function has to go first -- `create or
-- replace` cannot alter a function's signature.
-- ------------------------------------------------------------
drop function if exists admin_reconciliation();

create or replace function admin_reconciliation()
returns table (
  paid_without_payment  bigint,
  duplicate_payments    bigint,
  orphaned_ledger_lines bigint,
  orphaned_ledger_value numeric,
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

  select coalesce(sum(case when type = 'commission' then abs(amount) else 0 end), 0)
       - coalesce(sum(case when type = 'adjustment' then amount else 0 end), 0)
    into lc from provider_ledger;

  return query select
    (select count(*) from jobs j
      where j.status in ('paid', 'rated')
        and not exists (select 1 from payments p where p.job_id = j.id)),
    (select count(*) from (
       select job_id from payments group by job_id having count(*) > 1) d),
    -- NEW: ledger lines with no job behind them. 'payout' excluded -- those
    -- are settlements and are supposed to have none.
    (select count(*) from provider_ledger
      where job_id is null and type <> 'payout'),
    -- How much of the delta those lines account for, on the same basis the
    -- delta is computed: commission raised, net of reversals.
    (select round(coalesce(sum(case when type = 'commission' then abs(amount) else 0 end), 0)
                - coalesce(sum(case when type = 'adjustment' then amount else 0 end), 0), 2)
       from provider_ledger where job_id is null and type <> 'payout'),
    round(pc, 2),
    round(lc, 2),
    round(pc - lc, 2),
    (select count(*) from jobs
      where status = 'completed' and updated_at < now() - interval '3 days'),
    (select coalesce(sum(price), 0) from jobs
      where status = 'completed' and updated_at < now() - interval '3 days');
end; $$;

revoke all on function admin_reconciliation() from public;
grant execute on function admin_reconciliation() to authenticated, service_role;


-- ------------------------------------------------------------
-- Verifying
--
--   select * from admin_reconciliation();
--   -- expect commission_delta 0.00 and orphaned_ledger_lines 0
--
--   -- and the account that was over-billed:
--   select round(commission_outstanding(p.id), 2)
--     from profiles p where p.full_name = 'KariGhar provider';
--   -- expect 1910.00, down from 2310.00
-- ------------------------------------------------------------
