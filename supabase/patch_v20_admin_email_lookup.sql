-- ============================================================
-- KARIGHAR — patch v20: let an admin see the email behind an account
-- Run ONCE in the Supabase SQL editor. Idempotent & self-contained.
--
-- Why this needs a function at all
-- -------------------------------
-- `profiles` has no email column. The address lives in `auth.users`, which
-- the anon key cannot read and should not be able to — so /admin/providers
-- and /admin/businesses could search by name or phone but never by email,
-- which is usually the only thing a support request actually quotes.
--
-- Shape of the fix, and what it deliberately is NOT
-- -------------------------------------------------
-- This takes a list of profile ids and returns their emails. It does NOT
-- take a search string. A function that looked up "find the account for
-- this email" would answer the question "does this person have an account
-- here?" for whoever could call it — an enumeration oracle one RLS mistake
-- away from being public. Taking ids means the caller can only ever learn
-- the email of an account they are already looking at.
--
-- The list is capped. An admin screen pages through a few hundred rows at a
-- time; nothing legitimate asks for the whole user table in one call, and
-- the cap keeps this from quietly becoming an export endpoint.
-- ============================================================

create or replace function admin_emails(p_ids uuid[])
returns table (id uuid, email text)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if p_ids is null or array_length(p_ids, 1) is null then return; end if;
  if array_length(p_ids, 1) > 500 then
    raise exception 'Too many ids in one lookup';
  end if;

  return query
    select u.id, u.email::text
    from auth.users u
    where u.id = any(p_ids);
end; $$;

revoke all on function admin_emails(uuid[]) from public;
grant execute on function admin_emails(uuid[]) to authenticated, service_role;


-- ============================================================
-- Verify
-- ============================================================
--   select * from admin_emails(array[...]::uuid[]);
--     -> as an admin: one row per id that exists.
--     -> as anyone else: 'admins only'.
