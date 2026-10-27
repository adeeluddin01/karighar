-- ============================================================
-- KARIGHAR — patch v22: a business is a real, located trading entity
-- Run ONCE in the Supabase SQL editor. Idempotent.
--
-- What changes, and why
-- ---------------------
-- patch_v18 modelled a business as a pure dispatcher: "it never works jobs,
-- so it carries no CNIC verification of its own". That was wrong. A business
-- here is a real physical trading entity — premises and a CNIC behind it,
-- exactly as an individual technician has.
--
-- There is deliberately NO self-service onboarding, because there is no
-- self-service signup: a business account exists only because an admin
-- granted it. So the admin supplies the identity and the premises at the
-- moment of granting, and the account is verified by construction. There is
-- nothing to "submit" and nothing to "approve" afterwards.
--
-- That also means these columns are Karighar's, not the account holder's.
-- `businesses_guard_trusted_cols` coerces them back on any self-write, in the
-- same shape as patch_v17 — so a business can edit how it presents itself
-- (`about`, `service_areas`) but cannot restate who it is or where it is.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Identity and premises
-- ------------------------------------------------------------
-- Mirrors `providers`: documents live here, behind biz_read, and never go out
-- through public_business_profiles.
alter table businesses add column if not exists cnic_no          text;
alter table businesses add column if not exists cnic_front_url   text;
alter table businesses add column if not exists cnic_back_url    text;
alter table businesses add column if not exists owner_selfie_url text;
alter table businesses add column if not exists verified_at      timestamptz;

-- A business is a place, unlike a technician, who has `service_areas` but no
-- fixed address.
alter table businesses add column if not exists address text;
alter table businesses add column if not exists lat     double precision;
alter table businesses add column if not exists lng     double precision;


-- ------------------------------------------------------------
-- 2. What a business covers
-- ------------------------------------------------------------
-- The counterpart of `provider_services`. Operational rather than identity,
-- so the business maintains this itself.
create table if not exists business_services (
  business_id uuid references businesses(profile_id) on delete cascade,
  service_id  uuid references services(id) on delete cascade,
  primary key (business_id, service_id)
);
alter table business_services enable row level security;

drop policy if exists bizsvc_self on business_services;
create policy bizsvc_self on business_services for all
  using (business_id = auth.uid() or is_admin())
  with check (business_id = auth.uid() or is_admin());


-- ------------------------------------------------------------
-- 3. Identity and premises are platform-owned
-- ------------------------------------------------------------
-- Without this a business could restate its own CNIC or move its own pin,
-- which defeats the point of the admin being the one who records them.
create or replace function businesses_guard_trusted_cols()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user is distinct from 'authenticated' then return new; end if;
  if is_admin() then return new; end if;

  if tg_op = 'INSERT' then
    raise exception 'Business accounts are granted by Karighar';
  end if;

  new.status           := old.status;
  new.verified_at      := old.verified_at;
  new.rating_avg       := old.rating_avg;
  new.jobs_completed   := old.jobs_completed;
  new.created_at       := old.created_at;
  -- Identity and premises: recorded by the admin who granted the account.
  new.cnic_no          := old.cnic_no;
  new.cnic_front_url   := old.cnic_front_url;
  new.cnic_back_url    := old.cnic_back_url;
  new.owner_selfie_url := old.owner_selfie_url;
  new.address          := old.address;
  new.lat              := old.lat;
  new.lng              := old.lng;
  return new;
end; $$;

drop trigger if exists businesses_guard_cols on businesses;
create trigger businesses_guard_cols before insert or update on businesses
  for each row execute function businesses_guard_trusted_cols();


-- ------------------------------------------------------------
-- 4. Granting now records who and where
-- ------------------------------------------------------------
-- The old two-argument form is dropped: an account could otherwise be created
-- with no CNIC and no premises, which is exactly what this patch is for.
drop function if exists grant_business_account(uuid);

create or replace function grant_business_account(
  p_profile uuid,
  p_cnic    text,
  p_address text,
  p_lat     double precision,
  p_lng     double precision
)
returns void language plpgsql security definer set search_path = public as $$
declare digits text;
begin
  if not is_admin() then raise exception 'admins only'; end if;

  if exists (select 1 from providers p
             where p.profile_id = p_profile and p.status = 'approved') then
    raise exception 'That account is an approved technician. A business is a dispatcher and cannot also work jobs.';
  end if;

  digits := regexp_replace(coalesce(p_cnic, ''), '\D', '', 'g');
  if length(digits) <> 13 then
    raise exception 'A business needs the owner''s 13-digit CNIC';
  end if;
  if coalesce(btrim(p_address), '') = '' then
    raise exception 'A business needs the address of its premises';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'A business needs its premises pinned on the map';
  end if;

  insert into businesses(profile_id, status, cnic_no, address, lat, lng, verified_at)
  values (p_profile, 'active', btrim(p_cnic), btrim(p_address), p_lat, p_lng, now())
  on conflict (profile_id) do update
    set status      = 'active',
        cnic_no     = excluded.cnic_no,
        address     = excluded.address,
        lat         = excluded.lat,
        lng         = excluded.lng,
        verified_at = now();

  update profiles set role = 'business' where id = p_profile;
end; $$;

-- Correcting the record afterwards — a business moves, or a CNIC was mistyped.
-- Admin-only for the same reason the grant is.
create or replace function update_business_details(
  p_profile uuid,
  p_cnic    text,
  p_address text,
  p_lat     double precision,
  p_lng     double precision
)
returns void language plpgsql security definer set search_path = public as $$
declare digits text;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if not exists (select 1 from businesses where profile_id = p_profile) then
    raise exception 'No such business';
  end if;

  digits := regexp_replace(coalesce(p_cnic, ''), '\D', '', 'g');
  if length(digits) <> 13 then raise exception 'Enter the owner''s 13-digit CNIC'; end if;
  if coalesce(btrim(p_address), '') = '' then raise exception 'Enter the premises address'; end if;
  if p_lat is null or p_lng is null then raise exception 'Pin the premises on the map'; end if;

  update businesses
     set cnic_no = btrim(p_cnic), address = btrim(p_address),
         lat = p_lat, lng = p_lng, verified_at = now()
   where profile_id = p_profile;
end; $$;

revoke all on function grant_business_account(uuid, text, text, double precision, double precision) from public;
revoke all on function update_business_details(uuid, text, text, double precision, double precision) from public;
grant execute on function grant_business_account(uuid, text, text, double precision, double precision) to authenticated, service_role;
grant execute on function update_business_details(uuid, text, text, double precision, double precision) to authenticated, service_role;


-- ------------------------------------------------------------
-- 5. Public window gains the premises, never the documents
-- ------------------------------------------------------------
-- lat/lng so a business can be placed on a map; cnic_*, address and
-- verified_at stay behind biz_read, which has no public branch.
drop view if exists public_business_profiles;
create view public_business_profiles as
  select b.profile_id as id,
         pr.full_name,
         pr.avatar_url,
         b.about,
         b.rating_avg,
         b.jobs_completed,
         b.service_areas,
         b.lat,
         b.lng,
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


-- ------------------------------------------------------------
-- 6. What each business covers, publicly
-- ------------------------------------------------------------
-- `business_services` is owner/admin-only (bizsvc_self), the same shape as
-- provider_services. But unlike a technician, a business is a PLACE, and a
-- pin on a map says nothing without the trade behind it — so the association
-- goes out through a view, as `providers` does.
--
-- Nothing here is new information: `services` and `service_categories` are
-- already world-readable (svc_read / cat_read are both `using (true)`). The
-- view publishes only which active business covers which live service.
drop view if exists public_business_services;
create view public_business_services as
  select bs.business_id,
         s.id         as service_id,
         s.name       as service_name,
         c.id         as category_id,
         c.name       as category_name,
         c.icon       as category_icon,
         c.sort_order as category_sort
  from business_services bs
  join businesses b         on b.profile_id = bs.business_id
  join services s           on s.id = bs.service_id
  join service_categories c on c.id = s.category_id
  where b.status = 'active' and s.is_active and c.is_active;

do $$
begin
  execute 'alter view public_business_services set (security_invoker = off)';
exception when others then
  raise notice 'security_invoker unsupported here; owner rights are the default';
end $$;

grant select on public_business_services to anon, authenticated;


-- ============================================================
-- Verify
-- ============================================================
--   select grant_business_account('<uid>', '4210112345671',
--                                 'Shop 12, Block 4, Gulshan', 24.9204, 67.0971);
--   select cnic_no, address, lat, lng, verified_at, status
--     from businesses where profile_id = '<uid>';
--
--   select grant_business_account('<uid>', '123', 'x', 1, 1);   -- raises: CNIC
--   select grant_business_account('<uid>', '4210112345671', '', 1, 1); -- raises: address
--
-- As that business, confirm the identity columns are not self-writable:
--   update businesses set cnic_no = '9999999999999', lat = 0 where profile_id = auth.uid();
--   -- succeeds as a statement, but the row is unchanged: the guard coerces.
--
-- EXISTING ROWS: a business granted before this patch has no CNIC and no
-- premises and stays 'active' — a migration should not cut off an account
-- that is already trading. /admin/businesses flags those as incomplete so
-- they can be filled in with update_business_details.
--
-- NOT CHANGED BY THIS PATCH:
-- `providers` still has no lat/lng at all, and `provider_services` is still
-- owner/admin-only. An individual technician therefore remains unplottable —
-- they have `service_areas`, a list of neighbourhood names, and no address.
-- Only businesses go on a map, which is the honest distinction: a business
-- is a premises, a technician is a person who travels.
