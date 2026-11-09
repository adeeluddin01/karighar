-- ============================================================
-- KARIGHAR — why "Books do not reconcile" shows Rs -400
--
-- NOT A MIGRATION. Section 1 is read-only. Section 2 CHANGES FINANCIAL
-- DATA — run section 1 first and only repair what it actually finds.
--
-- THE SYMPTOM
--   In payments  Rs 1,910     <- sum(payments.commission) where status <> 'refunded'
--   In ledger    Rs 2,310     <- sum(|commission|) - sum(adjustment), ALL of provider_ledger
--   delta        Rs  -400
--   Duplicate payments 0, Paid-no-payment 0, and NO job shows a mismatch.
--
-- THE CAUSE: an orphaned ledger row.
--
-- The two financial tables disagree about what a deleted job means:
--
--     payments.job_id        uuid not null references jobs(id) on delete cascade
--     provider_ledger.job_id uuid          references jobs(id) on delete set null
--
-- Delete a job and the payment row is DELETED, while the ledger rows SURVIVE
-- with job_id set to null. Deleting a customer does the same thing at one
-- remove: jobs.customer_id cascades from customers, so removing a test
-- customer silently takes their jobs and payments with it and leaves the
-- ledger behind.
--
-- admin_reconciliation() then compares:
--     pc = sum over payments            <- the row is gone, contributes 0
--     lc = sum over provider_ledger     <- no job filter at all, still counts it
--
-- so lc exceeds pc by exactly that job's commission. Rs 400 is a Rs 2,000 job
-- at the 20% default.
--
-- WHY THE PER-JOB CHECK CAME BACK EMPTY
-- A query written `from jobs ... left join provider_ledger` structurally
-- cannot see a ledger row that no longer has a job. The orphan is invisible
-- to every job-first query, including the reconciliation screen itself.
--
-- WHY IT MATTERS
-- commission_outstanding() reads only provider_ledger, orphans included, so
-- "Owed Rs 2,310" and the cap inside record_settlement() are both Rs 400 too
-- high. Settling the pre-filled amount over-collects from that provider.
-- ============================================================


-- ------------------------------------------------------------
-- 1. CONFIRM — read-only.
-- ------------------------------------------------------------

-- 1a. THE ONE THAT MATTERS. Every ledger line with no job behind it.
--     'payout' legitimately has a null job_id — that is how record_settlement
--     books a cash remittance. ANY OTHER type here is an orphan.
select id, provider_id, type, amount, created_at
  from provider_ledger
 where job_id is null
 order by type, created_at;

-- 1b. The same thing totalled. The 'commission' line here should account for
--     the whole -400.
select type,
       count(*)                       as rows,
       sum(amount)                    as total,
       sum(abs(amount))               as total_abs
  from provider_ledger
 where job_id is null
 group by type
 order by type;

-- 1c. Proof that the orphans are the entire delta: this recomputes the
--     reconciliation while ignoring ledger lines that have no job.
--     Expect 0.00 — which would confirm nothing else is wrong.
select round(
         coalesce((select sum(commission) from payments where status <> 'refunded'), 0)
       - (coalesce((select sum(abs(amount)) from provider_ledger
                     where type = 'commission' and job_id is not null), 0)
        - coalesce((select sum(amount) from provider_ledger
                     where type = 'adjustment' and job_id is not null), 0))
       , 2) as delta_ignoring_orphans;

-- 1d. What that orphaned money is doing to the account on screen.
select p.full_name,
       round(coalesce(sum(case when l.type = 'earning'    then l.amount      else 0 end), 0), 2) as net_earned,
       round(coalesce(sum(case when l.type = 'commission' then abs(l.amount) else 0 end), 0), 2) as commission_raised,
       round(coalesce(sum(case when l.job_id is null and l.type <> 'payout'
                               then abs(l.amount) else 0 end), 0), 2)                            as of_which_orphaned
  from provider_ledger l
  join profiles p on p.id = l.provider_id
 group by p.full_name;


-- ------------------------------------------------------------
-- 2. REPAIR — CHANGES DATA. Only the rows 1a actually listed.
--
-- The judgement call: a ledger line whose job no longer exists is billing
-- for work there is no longer any record of. It cannot be reconciled against
-- `payments`, it cannot be disputed, and the provider cannot be shown what
-- they are paying for. It should not sit in an outstanding balance.
--
-- 'payout' rows are preserved — those are real settlements and are SUPPOSED
-- to have a null job_id.
-- ------------------------------------------------------------

begin;

create table if not exists provider_ledger_orphan_backup as
select * from provider_ledger where false;

insert into provider_ledger_orphan_backup
select * from provider_ledger
 where job_id is null and type <> 'payout';

delete from provider_ledger
 where job_id is null and type <> 'payout';

-- Expect 0.00 before you commit.
select round(
         coalesce((select sum(commission) from payments where status <> 'refunded'), 0)
       - (coalesce((select sum(abs(amount)) from provider_ledger where type = 'commission'), 0)
        - coalesce((select sum(amount)      from provider_ledger where type = 'adjustment'), 0))
       , 2) as commission_delta_after;

-- 0.00 -> commit;      anything else -> rollback;  and send me 1a's output.
commit;


-- ------------------------------------------------------------
-- 3. STOPPING IT RECURRING
--
-- The orphan is a symptom; the asymmetry is the bug. Three options, in the
-- order I'd pick them:
--
-- (a) Make the reconciliation compare like with like. Smallest change,
--     and it makes the screen honest immediately — but an orphaned balance
--     would still be billed to the provider by commission_outstanding(),
--     just no longer reported as drift. Fixes the symptom only.
--
-- (b) Make the ledger cascade like payments, so a deleted job takes its
--     whole financial record with it:
--
--       alter table provider_ledger drop constraint provider_ledger_job_id_fkey;
--       alter table provider_ledger add constraint provider_ledger_job_id_fkey
--         foreign key (job_id) references jobs(id) on delete cascade;
--
--     Consistent with payments, and no orphan can ever form. The cost is
--     that `on delete set null` was a deliberate choice — the ledger was
--     meant to outlive the job.
--
-- (c) Stop deleting jobs. If the ledger is meant to outlive the job, then
--     the job should not be deletable in the first place:
--
--       alter table jobs drop constraint jobs_customer_id_fkey;
--       alter table jobs add constraint jobs_customer_id_fkey
--         foreign key (customer_id) references customers(profile_id);   -- NO ACTION
--
--     This matches what `jobs.provider_id` and `jobs.business_id` already
--     do, and the schema's own comment on those columns: "a job's financial
--     record outlives the job". It would mean a customer with jobs cannot
--     be deleted until those jobs are dealt with.
--
-- (b) and (c) are opposites and the right one depends on which record you
-- consider authoritative. Worth deciding deliberately rather than leaving
-- the two tables disagreeing, which is what produced this.
-- ------------------------------------------------------------
