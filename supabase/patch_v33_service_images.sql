-- ============================================================
-- KARIGHAR — patch v33: catalog photos
-- Run ONCE in the Supabase SQL editor. Idempotent.
--
-- What changes, and why
-- ---------------------
-- The service cards on Home and /book are image-first now: a photo panel
-- with the name and price under it. Until this patch the only art a
-- category had was a 24px line icon (`service_categories.icon`, mapped in
-- lib/catalogIcons.ts) — a glyph, not a picture.
--
-- So: one nullable column on each catalog table, and a public bucket that
-- an ADMIN — not an account owner — may write.
--
-- NOT THE `avatars` SHAPE. An avatar belongs to the account that uploaded
-- it, so its policies key on `auth.uid()` and its path is a folder per
-- user. A catalog photo belongs to the platform: there is no uid to key on
-- and no "owner" to scope a folder to. The policies key on is_admin()
-- instead, which is why the path can be keyed on the row id.
--
-- PUBLIC ON PURPOSE. Home and /book are browsable logged-out, so <img src>
-- has to work without a signed token. Nothing sensitive goes in here — it
-- is marketing art for a public price list. Identity documents stay in
-- `verification`, which keeps its own private, owner-only policies.
-- ============================================================


-- ------------------------------------------------------------
-- 1. The columns
-- ------------------------------------------------------------
-- Nullable on purpose: nothing has to be backfilled. A service with no
-- photo falls back to its category's, and a category with none falls back
-- to the icon it already renders today.
alter table services           add column if not exists image_url text;
alter table service_categories add column if not exists image_url text;

-- Length caps in the spirit of patch_v27. This is a public (anon-key)
-- database, so an uncapped text column is a self-serve way to push
-- multi-MB rows. A Supabase public object URL plus the ?v= cache-bust is
-- ~140 characters; 500 is generous. Named rather than anonymous so that
-- running this over a schema.sql-built database raises duplicate_object
-- and no-ops, instead of silently adding a second identical constraint.
do $$
begin
  alter table services add constraint services_image_url_len
    check (image_url is null or length(image_url) <= 500);
exception when duplicate_object then
  raise notice 'services_image_url_len already present';
end $$;

do $$
begin
  alter table service_categories add constraint service_categories_image_url_len
    check (image_url is null or length(image_url) <= 500);
exception when duplicate_object then
  raise notice 'service_categories_image_url_len already present';
end $$;


-- ------------------------------------------------------------
-- 2. The bucket
-- ------------------------------------------------------------
-- `public = true` makes object URLs readable without a signed token, which
-- is what lets <img src> work for a logged-out visitor browsing /book.
insert into storage.buckets (id, name, public)
  values ('catalog', 'catalog', true)
  on conflict (id) do update set public = true;


-- ------------------------------------------------------------
-- 3. Policies
-- ------------------------------------------------------------
-- `storage` lives outside the public schema, so these survive a
-- `drop schema public cascade` reset — dropped first so a re-run doesn't
-- fail. is_admin() in a storage policy is not new here: `verif_read`
-- already uses it to let admins read every provider's documents.
drop policy if exists catalog_read   on storage.objects;
drop policy if exists catalog_write  on storage.objects;
drop policy if exists catalog_update on storage.objects;
drop policy if exists catalog_delete on storage.objects;

-- Anyone, signed in or not. Mirrors the catalog tables themselves, which
-- are already world-readable (cat_read / svc_read).
create policy catalog_read on storage.objects for select
  using (bucket_id = 'catalog');

create policy catalog_write on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog' and is_admin());

-- Needed as well as insert: the client uploads with `upsert: true`, which
-- is an UPDATE once the object already exists.
create policy catalog_update on storage.objects for update to authenticated
  using (bucket_id = 'catalog' and is_admin())
  with check (bucket_id = 'catalog' and is_admin());

-- Used by uploadServiceImage() to clear the stale sibling when an admin
-- replaces a .jpg with a .png. There is no cleanup job in this project, so
-- without this every superseded photo would sit in the bucket forever.
create policy catalog_delete on storage.objects for delete to authenticated
  using (bucket_id = 'catalog' and is_admin());


-- ============================================================
-- Verify
-- ============================================================
--   select table_name, column_name from information_schema.columns
--    where column_name = 'image_url'
--      and table_name in ('services','service_categories');
--   -- expect 2 rows
--
--   select id, public from storage.buckets where id = 'catalog';
--   -- expect: catalog | t
--
--   select policyname from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and policyname like 'catalog%';
--   -- expect 4 rows
--
-- As an admin, uploading to `catalog/services/<uuid>.jpg` must succeed.
-- As a signed-in non-admin, the same upload must fail.
--
-- NOT CHANGED BY THIS PATCH:
-- `cat_admin` and `svc_admin` are `for all using (is_admin())`, so they
-- already cover the new column — no table policy is needed. The
-- `verification` bucket is untouched and stays private.
