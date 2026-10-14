-- ============================================================
-- KARIGHAR — patch v15: new service categories
-- Run ONCE in the Supabase SQL editor. Idempotent & self-contained.
--
-- Adds 5 new parent categories — Carpenter, Painter, Solar Panel Cleaning,
-- Camera Installation, Washing Machine Repair — each with exactly one
-- "On-site Quote" placeholder sub-service (base_price = null). Realistic
-- priced sub-services per category come in a later patch once scoped.
--
-- Neither service_categories.name nor services.name has a unique
-- constraint, and the original seed in schema.sql never used `on conflict`,
-- so this guards every insert with `where not exists (...)` keyed on name
-- instead. Run it twice and the second run is a no-op.
-- ============================================================

insert into service_categories (name, icon, sort_order)
select 'Carpenter', 'carpenter', 4
where not exists (select 1 from service_categories where name = 'Carpenter');

insert into service_categories (name, icon, sort_order)
select 'Painter', 'painter', 5
where not exists (select 1 from service_categories where name = 'Painter');

insert into service_categories (name, icon, sort_order)
select 'Solar Panel Cleaning', 'solar', 6
where not exists (select 1 from service_categories where name = 'Solar Panel Cleaning');

insert into service_categories (name, icon, sort_order)
select 'Camera Installation', 'camera', 7
where not exists (select 1 from service_categories where name = 'Camera Installation');

insert into service_categories (name, icon, sort_order)
select 'Washing Machine Repair', 'washer', 8
where not exists (select 1 from service_categories where name = 'Washing Machine Repair');

-- One "On-site Quote" sub-service per new category, guarded per-row since
-- there is no unique constraint on services.name to key an `on conflict` off.
insert into services (category_id, name, description, base_price, unit, visit_fee)
select c.id, 'On-site Quote', 'Carpenter visits to assess the job and quote a price', null, 'job', 0
from service_categories c
where c.name = 'Carpenter'
  and not exists (select 1 from services s where s.category_id = c.id and s.name = 'On-site Quote');

insert into services (category_id, name, description, base_price, unit, visit_fee)
select c.id, 'On-site Quote', 'Painter visits to assess the job and quote a price', null, 'job', 0
from service_categories c
where c.name = 'Painter'
  and not exists (select 1 from services s where s.category_id = c.id and s.name = 'On-site Quote');

insert into services (category_id, name, description, base_price, unit, visit_fee)
select c.id, 'On-site Quote', 'Technician visits to assess panel access and quote a price', null, 'job', 0
from service_categories c
where c.name = 'Solar Panel Cleaning'
  and not exists (select 1 from services s where s.category_id = c.id and s.name = 'On-site Quote');

insert into services (category_id, name, description, base_price, unit, visit_fee)
select c.id, 'On-site Quote', 'Technician visits to assess cameras needed and quote a price', null, 'job', 0
from service_categories c
where c.name = 'Camera Installation'
  and not exists (select 1 from services s where s.category_id = c.id and s.name = 'On-site Quote');

insert into services (category_id, name, description, base_price, unit, visit_fee)
select c.id, 'On-site Quote', 'Technician visits to diagnose the fault and quote a price', null, 'job', 0
from service_categories c
where c.name = 'Washing Machine Repair'
  and not exists (select 1 from services s where s.category_id = c.id and s.name = 'On-site Quote');
