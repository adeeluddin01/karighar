-- ============================================================
-- KARIGHAR — patch v18: business accounts with technicians beneath them
-- Run ONCE in the Supabase SQL editor AFTER patch_v17. Idempotent.
--
-- What this adds
-- --------------
-- A fourth shape of account. A BUSINESS claims jobs from the open pool and
-- ASSIGNS them to technicians on its team. A technician attached to a
-- business can no longer self-claim from the pool — their work arrives only
-- through their business.
--
-- Product rules this encodes:
--   1. Technicians stay self-serve and individually verified — the existing
--      /pro/onboarding CNIC/selfie flow, approved by an admin. A business
--      never creates or vouches for an identity.
--   2. Business accounts are granted by Karighar only. No public signup.
--   3. A business invites an ALREADY-APPROVED technician, who accepts or
--      declines.
--   4. Karighar's commission, today charged to the individual technician, is
--      charged to the BUSINESS instead. The business<->technician split is at
--      their own chosen rate.
--   5. A review credits BOTH: it stays attached to the technician who did the
--      work, and the business's rating derives from the jobs it dispatched.
--   6. A business is a dispatcher only — it never works jobs, so it carries
--      no CNIC verification of its own.
--   7. The customer deals with the ASSIGNED TECHNICIAN. `jobs.provider_id`
--      keeps its current meaning throughout, which is why chat, the call
--      button, GPS tracking, `profiles_job_peer`, the status machine and
--      `jobs_update_provider` all keep working with no changes at all.
--
-- !! TRANSACTION TRAP — DO NOT ADD A TOP-LEVEL STATEMENT USING THE NEW ENUM
-- !! LITERALS TO THIS FILE. Postgres allows `alter type ... add value` inside
-- !! a transaction, but the new literal cannot be USED in that same
-- !! transaction. Below, 'business' and 'business_share' appear ONLY inside
-- !! function bodies, which are parsed at creation but resolved at execution.
-- !! A statement like `... where role = 'business'` here would fail.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Enums
-- ------------------------------------------------------------
alter type user_role   add value if not exists 'business';
-- The technician's debt to their business for cash they collected on its
-- behalf. Reusing 'commission' would tell an attached technician they owe
-- KARIGHAR money they actually owe their business (and make
-- /admin/settlements chase it); reusing 'adjustment' lands in
-- summarizeLedger's settled bucket and zeroes commissionOwed.
alter type ledger_type add value if not exists 'business_share';

do $$ begin create type business_status   as enum ('active','suspended');
exception when duplicate_object then null; end $$;
do $$ begin create type membership_status as enum ('invited','active','declined','removed');
exception when duplicate_object then null; end $$;


-- ------------------------------------------------------------
-- 2. The business
-- ------------------------------------------------------------
-- A satellite table, not columns on `profiles`: `profiles_upd` lets a user
-- update their own profiles row, so ANY column there is self-writable. The
-- grant flag and the derived aggregates can only live somewhere with its own
-- RLS. This also mirrors the existing providers/customers 1:1 pattern.
-- Name, phone and avatar stay on `profiles` — not duplicated here.
-- No CNIC columns: rule 6.
create table if not exists businesses (
  profile_id     uuid primary key references profiles(id) on delete cascade,
  status         business_status not null default 'active',
  about          text,
  service_areas  jsonb not null default '[]'::jsonb,
  rating_avg     numeric(2,1) not null default 0,   -- trigger-maintained
  jobs_completed int not null default 0,            -- trigger-maintained
  created_at     timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 3. Membership, invite state, and the split rate
-- ------------------------------------------------------------
-- A table, not a `providers.business_id` column: a column on `providers`
-- would be self-writable under `prov_self`, so a technician could null it
-- out to re-enter the open pool, or point it at someone else's business.
-- A separate table is also the only way to give the business and the
-- technician DIFFERENT write rights over DIFFERENT columns of the same
-- relationship, and it carries the invite state a column cannot.
--
-- `provider_id -> providers(profile_id)` structurally enforces rule 1: only
-- a real provider row can ever be a member.
create table if not exists business_members (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(profile_id) on delete cascade,
  provider_id  uuid not null references providers(profile_id)  on delete cascade,
  status       membership_status not null default 'invited',
  -- The fraction of the job price the TECHNICIAN keeps. The business keeps
  -- the rest and pays Karighar's commission out of its side.
  tech_share   numeric(4,3) not null default 0.700
               check (tech_share >= 0 and tech_share <= 1),
  invited_by   uuid references profiles(id),
  invited_at   timestamptz not null default now(),
  responded_at timestamptz,
  removed_at   timestamptz,
  -- Re-invites are state transitions on one row, so the audit trail survives
  -- a decline.
  unique (business_id, provider_id)
);
create index if not exists business_members_provider_idx on business_members(provider_id, status);
create index if not exists business_members_business_idx on business_members(business_id, status);

-- Structural teeth for the lockout: at most one active business per
-- technician, enforced by the database even if a policy or RPC is ever wrong.
create unique index if not exists business_members_one_active
  on business_members(provider_id) where (status = 'active');


-- ------------------------------------------------------------
-- 4. How a job records its dispatcher
-- ------------------------------------------------------------
-- Columns on `jobs`, with the split FROZEN at assignment. jobs_on_paid is a
-- trigger on `jobs`; looking the rate up from business_members at paid-time
-- would be wrong, because membership and rate can change between assignment
-- and payment. This is already the house pattern — `jobs.commission_rate` is
-- a frozen column, not a lookup.
--
-- NO ACTION on delete, matching `jobs.provider_id` rather than inventing a
-- different rule: a job's financial history must not be rewritten by someone
-- deleting an account, so the delete is refused instead. (`on delete set
-- null` was also actively broken — the RI write sets business_id null while
-- leaving tech_share set, which trips jobs_business_share_pair, so deleting
-- any business that had ever dispatched a job failed with a check violation.)
alter table jobs add column if not exists business_id uuid
  references businesses(profile_id);
alter table jobs add column if not exists tech_share numeric(4,3);
create index if not exists jobs_business_idx on jobs(business_id);

-- A database upgraded by an earlier draft of this patch may carry the old
-- SET NULL rule; normalise it either way.
do $$
declare cname text;
begin
  select conname into cname from pg_constraint
   where conrelid = 'public.jobs'::regclass and contype = 'f'
     and confrelid = 'public.businesses'::regclass
     and confdeltype <> 'a';          -- 'a' = NO ACTION
  if cname is not null then
    execute format('alter table jobs drop constraint %I', cname);
    execute 'alter table jobs add constraint jobs_business_id_fkey
               foreign key (business_id) references businesses(profile_id)';
  end if;
end $$;

-- Makes the money branch in jobs_on_paid a single null test.
do $$ begin
  alter table jobs add constraint jobs_business_share_pair
    check ((business_id is null) = (tech_share is null));
exception when duplicate_object then null; end $$;


-- ------------------------------------------------------------
-- 5. Gate helpers (same shape as is_admin())
-- ------------------------------------------------------------
-- Zero-argument, exactly like is_admin(), and deliberately so. A `p_uid`
-- parameter would make these SECURITY DEFINER functions a public oracle —
-- anyone with the anon key could POST /rpc/is_attached_tech {"p_uid": …} and
-- learn whether a given account works for a company. Revoking EXECUTE is not
-- an option: both are called from inside RLS policies, so the querying role
-- must be able to run them. Taking the argument away removes the question.
create or replace function is_active_business()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from businesses b
                 where b.profile_id = auth.uid() and b.status = 'active');
$$;

-- Requires the BUSINESS to be live too, not just the membership. Otherwise
-- suspending a dispatcher strands its whole team: they would still be locked
-- out of the open pool by jobs_select/jobs_claim while their business can no
-- longer assign them anything, leaving them unable to work at all until each
-- one individually quit. On suspension they simply go back to being
-- independent pros, and jobs_stamp_business stops billing their work to the
-- suspended account on the same condition.
create or replace function is_attached_tech()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from business_members m
                 join businesses b on b.profile_id = m.business_id
                 where m.provider_id = auth.uid()
                   and m.status = 'active' and b.status = 'active');
$$;

-- An earlier draft took `p_uid uuid default auth.uid()`; drop it so the
-- oracle overload cannot linger on an upgraded database.
drop function if exists is_active_business(uuid);
drop function if exists is_attached_tech(uuid);


-- ------------------------------------------------------------
-- 6. profiles.role: 'business' must not be self-assignable
-- ------------------------------------------------------------
-- profiles_guard_role previously protected only 'admin'. Since `profiles_upd`
-- lets a user update their own row, a new role value would otherwise be
-- self-grantable. The customer<->provider switch /pro/onboarding needs stays
-- open.
--
-- Note this is belt-and-braces only: the real gate is `businesses.status`,
-- which is admin-write-only, exactly as `providers.status` — not
-- `role = 'provider'` — is what actually gates the pro area today.
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


-- ------------------------------------------------------------
-- 7. Business column guard (same coercion shape as patch_v17)
-- ------------------------------------------------------------
-- `rating_avg`/`jobs_completed` live on `businesses`, so without this the
-- whole point of v17 would be undone by a new self-writable reputation field.
create or replace function businesses_guard_trusted_cols()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user is distinct from 'authenticated' then return new; end if;
  if is_admin() then return new; end if;

  if tg_op = 'INSERT' then
    raise exception 'Business accounts are granted by Karighar';
  end if;
  new.status         := old.status;
  new.rating_avg     := old.rating_avg;
  new.jobs_completed := old.jobs_completed;
  new.created_at     := old.created_at;
  return new;
end; $$;

drop trigger if exists businesses_guard_cols on businesses;
create trigger businesses_guard_cols before insert or update on businesses
  for each row execute function businesses_guard_trusted_cols();

-- Defence in depth: even an admin UI slip cannot produce a nonsense
-- membership transition or move a membership between accounts.
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

drop trigger if exists business_members_guard_t on business_members;
create trigger business_members_guard_t before insert or update on business_members
  for each row execute function business_members_guard();


-- ------------------------------------------------------------
-- 8. THE STAMP TRIGGER — closes the bid-award bypass
-- ------------------------------------------------------------
-- Gating jobs_select/jobs_claim is NOT sufficient on its own, because the
-- CUSTOMER writes provider_id directly when awarding a bid
-- (src/app/bookings/view/mobile.tsx):
--
--     .update({ provider_id: bid.provider_id, price: bid.amount, status: 'assigned' })
--
-- `jobs_update_customer` only constrains customer_id, so that write may name
-- ANY provider. Without the trigger below, two things break silently:
--
--   * an attached technician with a stale pending bid still gets assigned,
--     straight through the lockout; and
--   * that path never sets business_id/tech_share, so jobs_on_paid takes the
--     independent branch and Karighar's commission lands on the TECHNICIAN
--     instead of the business — with nothing raising an error.
--
-- So the money facts are derived here, in ONE place, for every path that
-- ever sets provider_id: the assign RPC, the customer awarding a bid, an
-- admin, or any surface added later.
--
-- !! AND THE TRIGGER MUST OWN THOSE COLUMNS ON *EVERY* WRITE, not only when
-- !! provider_id changes. This is the same trap patch_v17 exists to close:
-- !! RLS is row-level, there are no column grants on `jobs`, and both update
-- !! policies constrain only the identity column —
-- !!     jobs_update_provider: using/check (provider_id = auth.uid())
-- !!     jobs_update_customer: using/check (customer_id  = auth.uid())
-- !! — so the owner of a job row may write EVERY other column of it. An
-- !! early `return new` on the unchanged-provider branch would leave:
-- !!
-- !!   * the assigned technician able to PATCH {business_id: null,
-- !!     tech_share: null} and walk out of their dispatcher mid-job, keeping
-- !!     the independent 80% and handing Karighar's commission bill back to
-- !!     themselves; and
-- !!   * ANY customer able to PATCH {business_id: '<someone else>',
-- !!     tech_share: 0.001} on their own job — business ids are public,
-- !!     `public_business_profiles` is granted to anon — so that at `paid` an
-- !!     uninvolved business is billed the commission, appears in
-- !!     /admin/settlements owing it, and gains read access to the job.
-- !!
-- !! Both are silent: jobs_business_share_pair only requires the two to be
-- !! null together, and neither jobs_lock_price nor jobs_enforce_status has a
-- !! WHEN clause that fires.
--
-- `commission_rate` is frozen here for the same reason. That hole predates
-- business accounts — today both the customer and the assigned technician can
-- PATCH {commission_rate: 0} before a job is paid and zero Karighar's take —
-- but it is the same column class on the same table, so it is fixed here
-- rather than left for a later patch to find.
create or replace function jobs_stamp_business()
returns trigger language plpgsql security definer set search_path = public as $$
declare biz uuid; share numeric(4,3);
begin
  if tg_op = 'UPDATE' then
    -- Platform-owned on `jobs`, in every case. An admin may still override.
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
  return new;
end; $$;

drop trigger if exists jobs_stamp_business_t on jobs;
create trigger jobs_stamp_business_t before insert or update on jobs
  for each row execute function jobs_stamp_business();


-- ------------------------------------------------------------
-- 9. RLS
-- ------------------------------------------------------------
alter table businesses       enable row level security;
alter table business_members enable row level security;

drop policy if exists biz_read        on businesses;
drop policy if exists biz_self_update on businesses;
drop policy if exists biz_admin       on businesses;

-- No INSERT policy for `authenticated` at all: rule 2, admin-granted only.
create policy biz_read on businesses for select using (
  profile_id = auth.uid()
  or is_admin()
  or exists (select 1 from business_members m
             where m.business_id = businesses.profile_id
               and m.provider_id = auth.uid()
               and m.status in ('invited','active'))
);
-- The owner edits presentation only; the guard above coerces the rest.
create policy biz_self_update on businesses for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy biz_admin on businesses for all
  using (is_admin()) with check (is_admin());

drop policy if exists bm_read  on business_members;
drop policy if exists bm_admin on business_members;

-- Both sides can read the relationship. There is deliberately NO
-- insert/update/delete policy for `authenticated`: every write goes through
-- a SECURITY DEFINER RPC below, each of which checks who is calling.
--
-- To be precise about what that does and does not prevent: a technician CAN
-- leave a team whenever they like — business_remove_member is callable by
-- either side, and /pro/dashboard ships a "Leave team" button, because
-- trapping someone in an employment relationship is not something a
-- marketplace should do. What they cannot do is raise their own share, join
-- or leave a team they are not party to, accept an invite that is not
-- theirs, or sit on a team while quietly re-entering the open pool.
--
-- Worth knowing operationally: an attached technician keeps their agreed
-- share where an independent one keeps 1 - commission, so if a business sets
-- the split below that, the standing incentive is to leave. The product
-- answer is deal flow, not a lock.
create policy bm_read on business_members for select using (
  business_id = auth.uid() or provider_id = auth.uid() or is_admin()
);
create policy bm_admin on business_members for all
  using (is_admin()) with check (is_admin());

-- The business needs its team's phone numbers to dispatch; the technician
-- needs to see who invited them. `profiles` carries only name/phone/avatar/
-- role — the document PII is on `providers`, still locked by v11 — and both
-- parties have an explicit relationship row. 'invited' is included so the
-- invite is identifiable before it is accepted.
--
-- NOT filtered by membership status: the relationship row is itself the proof
-- of a relationship, exactly as profiles_job_peer takes any job at any
-- status. Filtering to ('invited','active') left /business/team's "Past and
-- declined" section rendering every row as "Unnamed · no phone" — the
-- business had already typed that person's number to invite them, so hiding
-- the name afterwards protects nothing and just looks broken.
drop policy if exists profiles_business_team on profiles;
create policy profiles_business_team on profiles for select using (
  exists (select 1 from business_members m
          where m.business_id = auth.uid() and m.provider_id = profiles.id)
  or exists (select 1 from business_members m
          where m.provider_id = auth.uid() and m.business_id = profiles.id)
);

-- A dispatcher reads the quotes it placed through business_place_bid. A
-- SELECT-only policy rather than widening bids_rw's `using`: that one is
-- `for all`, so loosening it would hand the business DELETE on its
-- technicians' bids too. Permissive policies OR together, so this adds read
-- access and nothing else.
drop policy if exists bids_business_read on bids;
create policy bids_business_read on bids for select using (
  exists (select 1 from business_members m
          where m.provider_id = bids.provider_id
            and m.business_id = auth.uid() and m.status = 'active')
);

-- The second way into the open pool, and it had no gate at all. `bids_rw`'s
-- check was `provider_id = auth.uid() or is_admin()` — no lockout test and no
-- test that the job is even open. An attached technician who kept an open
-- job's uuid from before they joined could insert a fresh bid, bids_notify
-- would tell the customer, the customer would award it, and
-- jobs_stamp_business would then route that job AND Karighar's commission
-- onto a business that never dispatched it and never agreed to it.
--
-- The openness test is the same one business_place_bid makes, which is the
-- tell that it belonged here all along. `using` is untouched, so the job's
-- customer keeps reading bids exactly as before.
drop policy if exists bids_rw on bids;
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


-- ------------------------------------------------------------
-- 10. The open-pool lockout
-- ------------------------------------------------------------
-- Enforced in RLS, not merely hidden in the UI: /pro/dashboard's pool query
-- is a plain `.is("provider_id", null)` that any caller could reproduce by
-- hand. After this, that query returns zero rows for an attached technician,
-- so there is nothing left to hide.
drop policy if exists jobs_select on jobs;
create policy jobs_select on jobs for select using (
  customer_id = auth.uid()
  or provider_id = auth.uid()
  or is_admin()
  -- the dispatching business follows its own jobs end to end
  or business_id = auth.uid()
  -- The open pool: approved INDEPENDENT technicians, plus active businesses.
  or (provider_id is null and status in ('created','bidding')
      and (
        (exists (select 1 from providers p
                 where p.profile_id = auth.uid() and p.status = 'approved')
         and not is_attached_tech())
        or is_active_business()
      ))
);

-- Note `with check (provider_id = auth.uid())` is left EXACTLY as it was:
-- no policy anywhere lets one account write another's id into provider_id.
-- The business assigns through a definer RPC instead.
drop policy if exists jobs_claim on jobs;
create policy jobs_claim on jobs for update
  using (provider_id is null and status in ('created','bidding')
         and exists (select 1 from providers p
                     where p.profile_id = auth.uid() and p.status = 'approved')
         and not is_attached_tech())
  with check (provider_id = auth.uid());

-- A business must be able to reconcile the commission it owes.
drop policy if exists pay_read on payments;
create policy pay_read on payments for select using (
  exists (select 1 from jobs j where j.id = payments.job_id
          and (j.customer_id = auth.uid() or j.provider_id = auth.uid()
               or j.business_id = auth.uid() or is_admin()))
);

-- Deliberately NOT extended: msg_rw and track_rw. The business does not read
-- the customer<->technician chat or their live GPS. Rule 7, and the right
-- privacy posture.


-- ------------------------------------------------------------
-- 11. Money
-- ------------------------------------------------------------
-- provider_ledger.provider_id pointed at providers(profile_id), so a
-- dispatcher-only business could not hold a ledger row at all — yet rule 4
-- requires exactly that. Widen it to profiles(id).
--
-- This is a pure widening: providers.profile_id is itself a FK to
-- profiles(id), so every existing row already satisfies the looser
-- constraint. No migration, no orphan risk. Nothing downstream cares —
-- /admin/settlements already joins this column to `profiles`, not
-- `providers`; /pro/history filters on `provider_id = user.id`; and
-- record_settlement takes a bare uuid.
--
-- The column keeps its name: renaming would ripple through ledger_self,
-- jobs_on_paid, record_settlement, /pro/history and /admin/settlements for
-- no functional gain. It now means "the account this line belongs to".
do $$
declare cname text;
begin
  select conname into cname from pg_constraint
   where conrelid = 'public.provider_ledger'::regclass and contype = 'f'
     and confrelid = 'public.providers'::regclass;
  if cname is not null then
    execute format('alter table provider_ledger drop constraint %I', cname);
  end if;
end $$;
-- Same name a fresh schema.sql produces, so a patched and a fresh database
-- end up byte-identical here.
alter table provider_ledger drop constraint if exists provider_ledger_provider_id_fkey;
alter table provider_ledger add constraint provider_ledger_provider_id_fkey
  foreign key (provider_id) references profiles(id) on delete cascade;

create or replace function jobs_on_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare amt numeric; commission numeric; payout numeric;
        tech_cut numeric; biz_cut numeric;
begin
  amt        := coalesce(new.price, 0);
  commission := round(amt * new.commission_rate, 2);
  payout     := amt - commission;

  if exists (select 1 from payments where job_id = new.id) then return new; end if;

  -- `provider_payout` means what the PERSON WHO DID THE WORK ends up with.
  -- On a dispatched job that is their agreed share, not price-minus-
  -- commission — the commission is the business's bill, not theirs. Nothing
  -- reads this column today, so getting it wrong would have been invisible
  -- until the first export or reconciliation trusted it.
  if new.business_id is not null then
    payout := round(amt * coalesce(new.tech_share, 0), 2);
  end if;

  insert into payments(job_id, amount, method, commission, provider_payout, status)
    values (new.id, amt, 'cod', commission, payout, 'collected');

  if new.provider_id is null then return new; end if;

  if new.business_id is null then
    -- Independent technician: byte-for-byte the previous behaviour.
    insert into provider_ledger(provider_id, job_id, type, amount, balance) values
      (new.provider_id, new.id, 'earning',    payout,      0),
      (new.provider_id, new.id, 'commission', -commission, 0);
    return new;
  end if;

  -- Business-dispatched. The technician physically collected `amt` in cash;
  -- tech_share was frozen onto the job at assignment.
  tech_cut := round(amt * coalesce(new.tech_share, 0), 2);
  biz_cut  := amt - tech_cut;   -- what the technician owes their business

  insert into provider_ledger(provider_id, job_id, type, amount, balance) values
    -- technician: keeps their cut, owes the business the rest, owes Karighar nothing
    (new.provider_id, new.id, 'earning',        tech_cut,    0),
    (new.provider_id, new.id, 'business_share', -biz_cut,    0),
    -- business: receivable from the technician, and Karighar's commission
    (new.business_id, new.id, 'business_share', biz_cut,     0),
    (new.business_id, new.id, 'commission',     -commission, 0);
  return new;
end; $$;

-- Exactly ONE 'commission' row per job either way, as before — Karighar's
-- take is unchanged, it just lands on a different account. So
-- /admin/settlements and record_settlement work on a business with no change.

-- Scoped so a business can read the ledger lines for jobs it dispatched, but
-- not a technician's independent history from before they joined.
--
-- The third branch is the business<->technician leg specifically: a
-- settlement row carries no job_id, so without it a business could see what
-- its technicians OWE but never what they have already PAID, and the
-- receivable on /business/earnings could only ever grow. Restricted to
-- `business_share`, so a technician's own earnings and their commission
-- history stay private.
drop policy if exists ledger_self on provider_ledger;
create policy ledger_self on provider_ledger for select using (
  provider_id = auth.uid()
  or is_admin()
  or exists (select 1 from jobs j
             where j.id = provider_ledger.job_id and j.business_id = auth.uid())
  -- `::text` rather than the bare literal ON PURPOSE: this is a top-level
  -- statement, and 'business_share' was added to ledger_type by THIS
  -- transaction, so an enum comparison here would fail to resolve (see the
  -- transaction trap at the top of this file). Comparing the label as text
  -- needs no enum metadata.
  or (provider_ledger.type::text = 'business_share'
      and exists (select 1 from business_members m
                  where m.provider_id = provider_ledger.provider_id
                    and m.business_id = auth.uid()))
);


-- ------------------------------------------------------------
-- 12. Ratings — credit the technician AND the business
-- ------------------------------------------------------------
-- The review row still carries provider_id, so it credits the technician
-- exactly as today. The business aggregate is JOB-SCOPED: only reviews on
-- jobs this business actually dispatched.
--
-- Not scoped to current members, which would be gameable — invite one
-- 5-star pro, never dispatch them, inherit their rating — and would make a
-- business's public rating lurch whenever a technician left. Job-scoping is
-- the only reading that survives a technician leaving mid-history, and it
-- matches the same "freeze the facts on the job" principle as the money.
create or replace function on_review_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.provider_id, old.provider_id);
        bid uuid;
begin
  update providers set
    rating_avg = coalesce((select round(avg(rating)::numeric, 1)
                             from reviews where provider_id = pid), 0),
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
end; $$;

-- Public window, mirroring public_provider_profiles: name, avatar, blurb,
-- aggregates, areas, and a team COUNT. No phone, no member identities, no
-- job or ledger data.
--
-- `biz_read` deliberately has no public branch, so this is the only way a
-- business's name or rating reaches anyone outside it — /businesses/view
-- reads it, and nothing else may read `businesses` directly.
create or replace view public_business_profiles as
  select b.profile_id as id,
         pr.full_name,
         pr.avatar_url,
         b.about,
         b.rating_avg,
         b.jobs_completed,
         b.service_areas,
         (select count(*) from business_members m
           where m.business_id = b.profile_id and m.status = 'active') as team_size
  from businesses b
  join profiles pr on pr.id = b.profile_id
  where b.status = 'active';

do $$
begin
  execute 'alter view public_business_profiles set (security_invoker = off)';
exception when others then
  raise notice 'security_invoker unsupported here; owner rights are the default';
end $$;

grant select on public_business_profiles to anon, authenticated;

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

do $$
begin
  execute 'alter view public_business_reviews set (security_invoker = off)';
exception when others then
  raise notice 'security_invoker unsupported here; owner rights are the default';
end $$;

grant select on public_business_reviews to anon, authenticated;


-- ------------------------------------------------------------
-- 13. RPCs — every membership and dispatch write goes through one of these
-- ------------------------------------------------------------
-- SECURITY DEFINER, matching record_settlement's existing shape: the
-- authorization check lives inside, in one auditable place. auth.uid() still
-- returns the caller inside a definer function (it reads a JWT claim), which
-- is what makes this safe.

-- Admin grants a business account. Refuses a profile that is an approved
-- provider: rule 6 says a business never works jobs, and roleOf() resolves
-- 'business' ahead of 'provider', so granting one to a working pro would
-- strip them of their own dashboard.
create or replace function grant_business_account(p_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if exists (select 1 from providers p
             where p.profile_id = p_profile and p.status = 'approved') then
    raise exception 'That account is an approved technician. A business is a dispatcher and cannot also work jobs.';
  end if;
  insert into businesses(profile_id) values (p_profile)
    on conflict (profile_id) do update set status = 'active';
  update profiles set role = 'business' where id = p_profile;
end; $$;

create or replace function set_business_status(p_profile uuid, p_status business_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  update businesses set status = p_status where profile_id = p_profile;
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

-- The null test is separate: `null < 0 or null > 1` is NULL, not TRUE, so a
-- combined guard would pass it through to a NOT NULL violation.
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
create or replace function business_settle_with_tech(p_provider uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare biz uuid := auth.uid();
begin
  if not is_active_business() then raise exception 'Not a business account'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if not exists (select 1 from business_members m
                 where m.business_id = biz and m.provider_id = p_provider) then
    raise exception 'Not one of your technicians';
  end if;

  insert into provider_ledger(provider_id, job_id, type, amount, balance) values
    (p_provider, null, 'business_share',  p_amount, 0),   -- clears their debt
    (biz,        null, 'business_share', -p_amount, 0);   -- clears the receivable
end; $$;

-- Dispatch. Row-locks the job so two dispatcher tabs cannot claim the same
-- one. business_id/tech_share are stamped by jobs_stamp_business(), not here,
-- so the money facts are computed in exactly one place.
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
-- null -> not-null, so BOTH technicians are told explicitly here — the one
-- losing the job most of all, since they may already be on their way.
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
-- awards normally and the stamp trigger does the rest.
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

revoke all on function grant_business_account(uuid)                       from public;
revoke all on function set_business_status(uuid, business_status)         from public;
revoke all on function business_invite_technician(text, numeric)          from public;
revoke all on function business_respond_invite(uuid, boolean)             from public;
revoke all on function business_set_share(uuid, numeric)                  from public;
revoke all on function business_remove_member(uuid)                       from public;
revoke all on function business_assign_job(uuid, uuid)                    from public;
revoke all on function business_reassign_job(uuid, uuid)                  from public;
revoke all on function business_place_bid(uuid, uuid, numeric, text, int) from public;
revoke all on function business_settle_with_tech(uuid, numeric)             from public;

grant execute on function grant_business_account(uuid)                       to authenticated, service_role;
grant execute on function set_business_status(uuid, business_status)         to authenticated, service_role;
grant execute on function business_invite_technician(text, numeric)          to authenticated, service_role;
grant execute on function business_respond_invite(uuid, boolean)             to authenticated, service_role;
grant execute on function business_set_share(uuid, numeric)                  to authenticated, service_role;
grant execute on function business_remove_member(uuid)                       to authenticated, service_role;
grant execute on function business_assign_job(uuid, uuid)                    to authenticated, service_role;
grant execute on function business_reassign_job(uuid, uuid)                  to authenticated, service_role;
grant execute on function business_place_bid(uuid, uuid, numeric, text, int) to authenticated, service_role;
grant execute on function business_settle_with_tech(uuid, numeric)             to authenticated, service_role;


-- ------------------------------------------------------------
-- 14. Realtime
-- ------------------------------------------------------------
do $$ begin alter publication supabase_realtime add table business_members;
exception when duplicate_object then null; end $$;


-- ============================================================
-- Verify
-- ============================================================
--   select enum_range(null::user_role), enum_range(null::ledger_type);
--     -> 'business' and 'business_share' present.
--   select conname, confrelid::regclass from pg_constraint
--    where conrelid = 'provider_ledger'::regclass and contype = 'f';
--     -> points at `profiles`.
--
-- This patch makes NO visible change on its own: no businesses row exists
-- yet, business_id/tech_share are null everywhere, and is_attached_tech() is
-- false for everyone. The app can be deployed before or after it.
