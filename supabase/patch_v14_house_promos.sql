-- ============================================================
-- KARIGHAR — patch v14: house promo banners
-- Run ONCE in the Supabase SQL editor. Idempotent & self-contained.
--
-- Karighar's own promotions to its users — referral offers, commission
-- promos, feature announcements. Content lives in the database so marketing
-- copy can change from the Supabase table editor without a redeploy, which a
-- static export would otherwise require.
--
-- `audience` means the table can serve the customer Home later; today only
-- the provider dashboard reads it.
-- ============================================================

create table if not exists house_promos (
  id         uuid primary key default gen_random_uuid(),
  audience   text not null default 'provider'
             check (audience in ('provider', 'customer', 'all')),
  eyebrow    text,                       -- small label above the title
  title      text not null,
  body       text,
  cta_label  text,                       -- button text; no button without it
  href       text,                       -- where the button goes
  priority   int not null default 0,     -- highest wins when several are live
  is_active  boolean not null default true,
  starts_at  timestamptz,                -- null = live immediately
  ends_at    timestamptz,                -- null = no end date
  created_at timestamptz not null default now()
);

create index if not exists house_promos_live_idx
  on house_promos(audience, is_active, priority desc);

alter table house_promos enable row level security;

drop policy if exists promo_read  on house_promos;
drop policy if exists promo_admin on house_promos;

-- Readable by everyone, but ONLY while live: the window is enforced in the
-- policy rather than the query, so a draft or an expired promo cannot be
-- pulled out of the table with the anon key by asking differently.
create policy promo_read on house_promos for select using (
  is_active
  and (starts_at is null or starts_at <= now())
  and (ends_at   is null or ends_at   >= now())
);

-- Admins manage them, and (policies being permissive) also see drafts.
create policy promo_admin on house_promos for all
  using (is_admin()) with check (is_admin());

-- One example, deliberately INACTIVE so nothing appears until you choose.
-- Flip is_active to true in the table editor to publish it.
insert into house_promos (audience, eyebrow, title, body, cta_label, href, priority, is_active)
select 'provider', 'Karighar offer', 'Refer a pro, earn Rs 2,000',
       'Know a good technician? When they pass verification and finish their first job, you both get paid.',
       'Invite a pro', '/support', 100, false
where not exists (select 1 from house_promos);
