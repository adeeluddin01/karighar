-- ============================================================
-- KARIGHAR — patch v17: stop self-approval and self-rating (SECURITY)
-- Run ONCE in the Supabase SQL editor. Idempotent & self-contained.
--
-- The problem
-- -----------
-- `providers` and `customers` each have exactly one policy and NO triggers:
--
--     create policy prov_self on providers for all
--       using (profile_id = auth.uid() or is_admin())
--       with check (profile_id = auth.uid() or is_admin());
--
-- RLS is row-level, not column-level, so the owner may write EVERY column of
-- their own row. That means a self-registered provider can run
--
--     update providers set status = 'approved', verified_at = now()
--      where profile_id = auth.uid();
--
-- and skip admin verification entirely. `jobs_select` and `jobs_claim` both
-- gate the open job pool on `providers.status = 'approved'`, so this hands
-- out real customer jobs — name, address, phone — with no vetting.
--
-- The same row holds `rating_avg` and `jobs_completed`, which feed
-- `public_provider_profiles`. So a provider can also publish a fabricated
-- 5.0 rating and job count to customers on the pro profile and on Home's
-- "Top-rated near you" rail.
--
-- `customers` has the identical hole: `cust_self` is also `for all` with no
-- trigger, `on_customer_review_change` maintains `rating_avg`/`jobs_rated`,
-- and `public_customer_ratings` shows those to a pro deciding whether to
-- accept a job. A customer can self-set a 5.0.
--
-- The fix — and why it COERCES instead of raising
-- -----------------------------------------------
-- /pro/onboarding upserts `status: 'pending'` on every save, unconditionally
-- (src/app/pro/onboarding/page.tsx), without checking whether the pro is
-- already approved. So a guard that RAISES on a status write would turn that
-- form into a hard error for every provider.
--
-- Coercing the protected columns back to their old values instead:
--   * leaves the form working untouched, and
--   * fixes a live bug in passing — today an APPROVED pro who edits their
--     bio silently demotes themselves to 'pending' and loses the dashboard
--     until an admin re-approves them.
--
-- INSERT is guarded as well as UPDATE: that call is an upsert, so an insert
-- setting `status = 'approved'` outright would sail past an UPDATE-only
-- trigger.
--
-- Why the escape keys on current_user and NOT auth.uid()
-- ------------------------------------------------------
-- `on_review_change()` and `on_customer_review_change()` are SECURITY
-- DEFINER triggers that legitimately write exactly these columns. SECURITY
-- DEFINER changes `current_user` to the function owner, but it does NOT
-- change `auth.uid()`, which reads a JWT claim and still returns the
-- REVIEWING CUSTOMER. (Proof of that behaviour in this very schema:
-- `record_settlement` is SECURITY DEFINER and relies on `is_admin()`, which
-- is itself auth.uid()-based.)
--
-- So an escape written as `auth.uid() is null or is_admin()` would NOT fire
-- for the aggregate triggers: it would coerce rating_avg/jobs_completed back
-- to OLD on every review and freeze every rating in the system forever.
-- Keying on `current_user` is both correct and simpler — the aggregate
-- functions need no change at all.
--
-- ASSUMPTION TO VERIFY: PostgREST runs end-user requests as the role
-- `authenticated`. Check with `select current_user;` issued from the app. If
-- it differs in this project, swap the first line of each guard for a
-- transaction-local flag set by the two aggregate functions:
--     perform set_config('karighar.platform_write','on',true);   -- in them
--     if coalesce(current_setting('karighar.platform_write',true),'')='on'   -- here
-- ============================================================


-- ------------------------------------------------------------
-- 1. providers: verification + reputation are platform-owned
-- ------------------------------------------------------------
create or replace function providers_guard_trusted_cols()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Not an end-user write: SECURITY DEFINER triggers (on_review_change),
  -- service_role, and psql all land here and are left alone.
  if current_user is distinct from 'authenticated' then return new; end if;
  if is_admin() then return new; end if;

  if tg_op = 'INSERT' then
    new.status         := 'pending';
    new.verified_at    := null;
    new.rating_avg     := 0;
    new.jobs_completed := 0;
  else
    new.status         := old.status;
    new.verified_at    := old.verified_at;
    new.rating_avg     := old.rating_avg;
    new.jobs_completed := old.jobs_completed;
  end if;
  return new;
end; $$;

drop trigger if exists providers_guard_cols on providers;
create trigger providers_guard_cols before insert or update on providers
  for each row execute function providers_guard_trusted_cols();


-- ------------------------------------------------------------
-- 2. customers: the same hole, the same shape
-- ------------------------------------------------------------
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

drop trigger if exists customers_guard_cols on customers;
create trigger customers_guard_cols before insert or update on customers
  for each row execute function customers_guard_trusted_cols();


-- ============================================================
-- Verify
-- ============================================================
-- Run these FROM THE APP (so current_user is `authenticated`), as a provider:
--
--   update providers set status = 'approved', rating_avg = 5
--    where profile_id = auth.uid();
--   select status, rating_avg from providers where profile_id = auth.uid();
--     -> unchanged. The update is a silent no-op, not an error.
--
-- Then, and this is the regression that matters most: leave a real review on
-- a completed job as a customer, and confirm the provider's rating_avg still
-- moves. If it does not, the current_user assumption above is wrong for this
-- project — use the GUC fallback described in the header.
--
-- Also confirm /pro/onboarding still saves for both a new and an already
-- approved provider, and that the approved one STAYS approved.
