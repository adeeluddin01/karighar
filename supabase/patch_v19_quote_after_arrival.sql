-- ============================================================
-- KARIGHAR — patch v19: a quote can only be given once the pro is on site
-- Run ONCE in the Supabase SQL editor. Idempotent & self-contained.
--
-- The problem
-- -----------
-- On a quote job the assigned pro sets `jobs.price` themselves. Until now
-- they could do that the moment the job was assigned — before travelling,
-- before seeing anything. `jobs_lock_price` only stopped a price being
-- CHANGED once set, so the first write was unguarded, and once written the
-- customer is locked to it.
--
-- Pricing work you have not looked at is a guess, and the customer carries
-- it. The window is therefore `arrived` and `in_progress`: on site, before
-- the job is finished.
--
-- Why this lives in the same trigger
-- ----------------------------------
-- `jobs_update_provider` is `using/with check (provider_id = auth.uid())`,
-- and RLS is row-level — so the assigned pro may write EVERY column of their
-- own job, `price` included. Hiding the field in /pro/jobs/view is cosmetic;
-- anyone can PATCH the row directly. The rule has to sit next to the price.
--
-- The one path that must stay open
-- --------------------------------
-- The CUSTOMER awarding a bid writes price and status in a single update:
--
--     .update({ provider_id, price: bid.amount, status: 'assigned' })
--
-- That is the customer accepting a figure the pro already quoted, so it is
-- legitimate at 'assigned' and must not be caught. The guard therefore keys
-- on `auth.uid() = new.provider_id` — it applies to the PRO setting their own
-- price, not to the customer agreeing one. Service-role and seed writes have
-- a null auth.uid(), so the comparison is NULL, the condition is not true,
-- and they pass; admins return early as before.
-- ============================================================

create or replace function jobs_lock_price()
returns trigger language plpgsql set search_path = public as $$
begin
  if is_admin() then return new; end if;

  if new.price is distinct from old.price and old.price is not null then
    raise exception 'Price is locked once it has been set';
  end if;

  -- First price, written by the assigned pro: only from on site.
  if old.price is null
     and new.price is not null
     and auth.uid() = new.provider_id
     and new.status not in ('arrived', 'in_progress') then
    raise exception 'Mark yourself arrived before setting the price for this job';
  end if;

  return new;
end; $$;

-- The trigger itself is unchanged; re-stated so a database that somehow lost
-- it comes back consistent.
drop trigger if exists jobs_before_update_price on jobs;
create trigger jobs_before_update_price before update on jobs
  for each row when (new.price is distinct from old.price)
  execute function jobs_lock_price();


-- ============================================================
-- Verify
-- ============================================================
-- As the assigned pro on a quote job still at 'assigned' or 'en_route':
--   update jobs set price = 5000 where id = '<job>';
--     -> refused.
-- Advance to 'arrived', then the same update succeeds, and a second one is
-- refused by the existing immutability rule.
--
-- Regression that matters most: as a CUSTOMER, award a bid on a custom job.
-- That writes price + provider_id + status='assigned' together and must
-- still succeed.
