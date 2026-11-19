-- ============================================================
-- KARIGHAR — patch v35: a sub-service can carry its own icon
-- Run ONCE in the Supabase SQL editor. Idempotent.
-- Applies on top of patch_v33 (catalog photos), which it completes.
--
-- WHAT CHANGES, AND WHY
--
-- `service_categories.icon` has existed since schema.sql: a short slug
-- ("ac", "bolt") that each lane maps onto its own icon set. `services` never
-- had one, so every sub-service borrowed its category's glyph. On a category
-- like "Electrician" that covers fan installation, wiring and generator
-- repair, all three drew the same bolt.
--
-- The catalog editor now offers a picture-or-icon choice per row, which
-- needs somewhere to put the icon. So: one nullable column, mirroring the
-- one on service_categories.
--
-- THE ICON IS A FALLBACK, NOT AN ALTERNATIVE. Both lanes layer the photo
-- OVER the glyph (see components/Shot.tsx), so a row with a picture still
-- wants an icon: it is what renders while the photo loads, if the URL 404s,
-- and on any surface too small for art. Null here means "use the
-- category's", which is exactly what every existing row gets.
--
-- WHY A SLUG AND NOT AN ICON NAME: lib/catalogIcons.ts holds one map per
-- lane and catalogIcons.test.ts proves every offered slug resolves in both.
-- Storing "bolt" keeps that guarantee; storing "Zap" would bind the
-- database to the web lane's icon library.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The column
-- ------------------------------------------------------------
-- Nullable, no backfill: null falls through to the category's icon, which
-- is the behaviour every row has today.
alter table services add column if not exists icon text;

-- Length cap in the spirit of patch_v27 — this is an anon-key database, so
-- an uncapped text column is a self-serve way to push large rows. The
-- longest slug in CATEGORY_ICON_CHOICES is 9 characters; 40 is generous and
-- still refuses anything that is not a slug. Named rather than anonymous so
-- a re-run raises duplicate_object and no-ops.
do $$
begin
  alter table services add constraint services_icon_len
    check (icon is null or length(icon) <= 40);
exception when duplicate_object then
  raise notice 'services_icon_len already present';
end $$;


-- ============================================================
-- Verify
-- ============================================================
--   select column_name from information_schema.columns
--    where table_name = 'services' and column_name = 'icon';
--   -- expect 1 row
--
--   -- every existing row inherits, nothing is stranded:
--   select count(*) from services where icon is null;
--   -- expect: all of them, immediately after this patch
--
-- NOT CHANGED BY THIS PATCH:
-- `svc_admin` is `for all using (is_admin())`, so it already covers the new
-- column — no policy change is needed. `svc_read` is `using (true)`, so the
-- icon is world-readable like the rest of the price list.
