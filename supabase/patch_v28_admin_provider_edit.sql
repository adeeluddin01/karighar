-- ============================================================
-- KARIGHAR — patch v28: an admin can fix a technician's name and phone
-- Run ONCE in the Supabase SQL editor. Idempotent.
-- Independent of patch_v27 — apply in either order. The length rules below
-- deliberately mirror v27's profiles_full_name_len so the two agree.
--
-- WHY THIS FUNCTION EXISTS
--
-- Everything else the admin verification screen writes needs no new SQL:
-- `prov_self` and `provsvc_self` both carry an `or is_admin()` branch, and
-- `providers_guard_trusted_cols` early-returns on `if is_admin()`. So an
-- admin can already write every column of `providers` and every row of
-- `provider_services` straight from the browser.
--
-- `profiles` is the one exception:
--
--     create policy profiles_upd on profiles for update using (id = auth.uid());
--
-- No is_admin() branch, and no `with check`. An admin updating ANOTHER
-- user's profiles row therefore matches zero rows — and a zero-row UPDATE is
-- not an error, so the screen would cheerfully report a save that changed
-- nothing at all.
--
-- Widening profiles_upd to admins was the alternative, and it is worse: it
-- would hand every admin blanket write access to `role` on every account,
-- which is exactly what profiles_guard_role exists to keep narrow. One
-- named, validated, auditable entry point instead.
--
-- SECURITY DEFINER for the same reason as grant_business_account, which
-- already writes profiles.role this way (schema.sql:1200): the function
-- owner is not subject to profiles_upd, while auth.uid() inside the body
-- still resolves to the CALLING admin because it reads a JWT claim rather
-- than the database role. That is what makes the is_admin() guard below
-- mean anything.
--
-- It deliberately cannot touch `role`. profiles_guard_role is a
-- `when (old.role is distinct from new.role)` trigger, so it never fires
-- here — and an admin cannot promote anyone, or de-admin themselves,
-- through this path.
-- ============================================================

create or replace function admin_update_provider_contact(
  p_profile   uuid,
  p_full_name text,
  p_phone     text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  nm     text := btrim(coalesce(p_full_name, ''));
  digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  tel    text;
begin
  if not is_admin() then raise exception 'admins only'; end if;

  -- Narrowed to accounts that actually have a technician record. This is a
  -- provider-review tool, not a general "rewrite any user's identity"
  -- endpoint, and the review modal can only ever be opened on such a row.
  -- Mirrors update_business_details' 'No such business'.
  if not exists (select 1 from providers where profile_id = p_profile) then
    raise exception 'No such technician';
  end if;

  -- 2..80 mirrors validateName() in src/lib/validate.ts and patch_v27's
  -- profiles_full_name_len. A name cannot be cleared: rows predating this
  -- already show as "Unnamed" on the admin list, and there is no reason to
  -- manufacture more of them.
  if length(nm) < 2 then
    raise exception 'Enter the technician''s full name';
  end if;
  if length(nm) > 80 then
    raise exception 'That name is too long (max 80 characters)';
  end if;

  -- Blank clears the phone; anything else must be a real Pakistani mobile.
  -- Normalised to +923XXXXXXXXX HERE rather than trusting the client, so the
  -- stored form is canonical no matter which screen last wrote it — the same
  -- digit surgery as normalizePkPhone() in src/lib/validate.ts. phoneKey()
  -- based admin search depends on this staying consistent.
  if digits = '' then
    tel := null;
  else
    if    left(digits, 4) = '0092' then digits := substr(digits, 5);
    elsif left(digits, 2) = '92'   then digits := substr(digits, 3);
    elsif left(digits, 1) = '0'    then digits := substr(digits, 2);
    end if;
    if digits !~ '^3[0-9]{9}$' then
      raise exception 'Enter a valid Pakistani mobile number, e.g. 0300 1234567';
    end if;
    tel := '+92' || digits;
  end if;

  update profiles set full_name = nm, phone = tel where id = p_profile;
end; $$;

-- revoke BEFORE the grant. patch_v26 skipped this step and left its
-- functions carrying the default PUBLIC execute privilege, i.e. callable by
-- the anon role; patch_v27 section 5 cleans that up. Don't recreate it here.
revoke all on function admin_update_provider_contact(uuid, text, text) from public;
grant execute on function admin_update_provider_contact(uuid, text, text)
  to authenticated, service_role;

-- ------------------------------------------------------------
-- Verifying this landed
--
--   select proname, prosecdef from pg_proc
--    where proname = 'admin_update_provider_contact';
--   -- expect one row, prosecdef = true
--
--   -- as a NON-admin, this must raise 'admins only':
--   select admin_update_provider_contact(
--     '<some provider uuid>', 'Test Name', '03001234567');
-- ------------------------------------------------------------
