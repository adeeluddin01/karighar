-- KARIGHAR — patch v25: let a dispatching business see who reviewed its jobs
--
-- Why this exists: `/profile/ratings` shows the reviewer on the owner's own
-- ratings page. For a customer <-> technician pair that already works:
-- `profiles_job_peer` lets job peers read each other's basic profile.
-- A business is neither side of that pair — it dispatched the job — so
-- without this patch a business's ratings page can only label reviewers
-- "Customer". The page code falls back to that label when this patch has
-- not been applied; it never reads `customers` (address/coordinates) directly.
--
-- Scope, deliberately narrow: a business may read a profile row ONLY when
-- that person is the customer on a job the business dispatched. It does not
-- open `customers`, `providers`, or any other table, and it does not change
-- the public pages, which stay anonymous (stars + comment + date, no name).
--
-- Note on what `profiles` carries: name, phone, avatar, role only — the
-- document PII lives on `providers` and stays locked down. The ratings UI
-- selects only id/full_name/avatar_url and never renders a phone number.

create policy profiles_business_review_peer on profiles for select using (
  exists (
    select 1 from jobs j
    where j.business_id = auth.uid()
      and j.customer_id = profiles.id
  )
);
