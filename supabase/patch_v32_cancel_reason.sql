-- ============================================================
-- KARIGHAR — patch v32: the missing cancel_reason column
-- Run ONCE in the Supabase SQL editor. Idempotent and tiny.
--
-- THE SYMPTOM
--
-- A customer cancelling a booking got "Something went wrong. Please try
-- again." — the generic fallback in src/lib/dbErrors.ts, which means the
-- SQLSTATE was one nothing maps.
--
-- THE CAUSE
--
-- Both booking screens send:
--
--     .update({ status: "cancelled", cancel_reason: cancelReason || null })
--
-- and `jobs.cancel_reason` does not exist on this database. PostgREST
-- rejects the whole statement with PGRST204 ("column ... does not exist"),
-- so the status never changed either — the cancel failed in full, which is
-- exactly what it looked like.
--
-- The column comes from patch_v7_provider_profiles.sql:25 and is in
-- schema.sql:284, so it is present on a database built from schema.sql.
-- This one was not: the live `jobs` table runs id … proposed_price with no
-- cancel_reason, which is why every other screen works and only cancelling
-- fails.
--
-- dbErrors.ts now maps PGRST204 as well, so the next missing column says so
-- instead of hiding behind "something went wrong".
-- ============================================================

alter table jobs add column if not exists cancel_reason text;

-- Same cap the client applies (LIMITS.cancelReason), in the same spirit as
-- patch_v27: the reason is free text from a browser with the anon key.
do $$
begin
  alter table jobs add constraint jobs_cancel_reason_len
    check (cancel_reason is null or length(cancel_reason) <= 300);
exception when duplicate_object then
  raise notice 'jobs_cancel_reason_len already present';
end $$;

-- ------------------------------------------------------------
-- Verifying
--
--   select column_name from information_schema.columns
--    where table_name = 'jobs' and column_name = 'cancel_reason';
--   -- expect one row
--
-- Then cancel a booking from the app; it should succeed rather than toast.
--
-- WORTH CHECKING WHILE YOU ARE HERE
-- patch_v7 clearly did not run in full on this database. Its other half is
-- the `public_provider_profiles` view, which the customer-facing provider
-- screens read. If those work, the view exists and only this column was
-- lost; if they are empty, run patch_v7 rather than just this file.
-- ------------------------------------------------------------
