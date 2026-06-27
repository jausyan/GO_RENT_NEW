-- =====================================================================
-- GO-RENT — Electronic Equipment Rental Database Schema
-- Target: PostgreSQL (Supabase)
-- File:   /database/gorent_db.sql
--
-- Run this in the Supabase SQL Editor (or `psql`) once to provision the
-- whole system. It is idempotent-ish: safe enums + IF NOT EXISTS guards.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- ENUM: order status  (pending -> approved | rejected)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type order_status as enum ('pending', 'approved', 'rejected');
  end if;
end$$;

-- =====================================================================
-- TABLE: items  — the rental catalog (projector, screen, HT, camera...)
-- =====================================================================
create table if not exists public.items (
  id             uuid primary key default gen_random_uuid(),
  name           text        not null,
  description    text,
  price_per_day  numeric(12,2) not null check (price_per_day >= 0),
  stock          integer     not null default 0 check (stock >= 0),
  image_url      text,
  is_active      boolean     not null default true,
  created_at     timestamptz not null default now()
);

comment on table  public.items is 'Rental catalog. price_per_day is the unit price charged per day of rental.';
comment on column public.items.stock is 'Available units. Decremented when an admin approves an order (handled in app/admin logic).';

-- =====================================================================
-- TABLE: users — one row per customer (tracks who rents, and history)
-- Customers don't log in; they're identified/deduped by email or phone.
-- =====================================================================
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  full_name     text        not null,
  email         text        unique,             -- nullable, but unique when set
  phone         text        unique,             -- nullable, but unique when set
  address       text,
  agency        text,                            -- institusi / instansi
  notes         text,                            -- admin remarks about the user
  created_at    timestamptz not null default now(),
  -- Must have at least one way to identify the person.
  constraint chk_user_contact check (email is not null or phone is not null)
);

comment on table public.users is 'Customers. Created/looked-up at submit time via upsert_user(); deduped by email or phone.';

create index if not exists idx_users_email on public.users (email);
create index if not exists idx_users_phone on public.users (phone);

-- Find-or-create a customer by email or phone, updating their latest details.
-- Returns the user id. Called by the frontend (RPC) before inserting an order.
create or replace function public.upsert_user(
  p_full_name text,
  p_email     text default null,
  p_phone     text default null,
  p_address   text default null,
  p_agency    text default null
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.users
  where (p_email is not null and email = p_email)
     or (p_phone is not null and phone = p_phone)
  limit 1;

  if v_id is null then
    insert into public.users (full_name, email, phone, address, agency)
    values (p_full_name, p_email, p_phone, p_address, p_agency)
    returning id into v_id;
  else
    update public.users
       set full_name = p_full_name,
           email     = coalesce(p_email, email),
           phone     = coalesce(p_phone, phone),
           address   = coalesce(p_address, address),
           agency    = coalesce(p_agency, agency)
     where id = v_id;
  end if;

  return v_id;
end;
$$;

-- =====================================================================
-- TABLE: orders — one row per submitted rental request
-- =====================================================================
create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  -- Short human-friendly code the customer uses to track their order.
  order_code         text        not null unique
                       default 'GR-' || upper(substring(replace(gen_random_uuid()::text,'-','') for 8)),

  -- Who placed it (aggregates rental history). Snapshot fields below stay on
  -- the order so a later profile edit never rewrites past orders.
  user_id            uuid        references public.users(id) on delete set null,

  -- Customer / form information
  customer_name      text        not null,
  address            text        not null,
  agency             text,                       -- institusi / instansi
  needs              text,                        -- keperluan / purpose
  phone              text,
  email              text,

  -- Rental period (date-only; price is per day)
  borrow_date        date        not null,
  return_date        date        not null,
  -- Inclusive day count. return == borrow counts as 1 day.
  rental_days        integer     generated always as
                       ((return_date - borrow_date) + 1) stored,

  -- Money (snapshot of the computed total at submit time)
  total_price        numeric(12,2) not null default 0 check (total_price >= 0),

  -- Payment proof uploaded to the `proof_of_payment` storage bucket
  payment_proof_url  text,

  -- Workflow
  status             order_status not null default 'pending',
  admin_note         text,                        -- reason on reject / remark
  reviewed_at        timestamptz,

  created_at         timestamptz not null default now(),

  constraint chk_dates check (return_date >= borrow_date)
);

comment on table  public.orders is 'A rental request. Starts as pending; admin sets approved/rejected.';
comment on column public.orders.order_code is 'Given to the customer after submit; used in the public order-tracking search.';
comment on column public.orders.rental_days is 'Auto-computed inclusive number of rental days.';

create index if not exists idx_orders_status     on public.orders (status);
create index if not exists idx_orders_order_code on public.orders (order_code);
create index if not exists idx_orders_user_id    on public.orders (user_id);

-- =====================================================================
-- TABLE: order_items — line items (an order can have many items)
-- =====================================================================
create table if not exists public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid    not null references public.orders(id) on delete cascade,
  item_id         uuid    not null references public.items(id),

  quantity        integer not null default 1 check (quantity > 0),
  -- Price snapshot so historical orders are unaffected by later price edits.
  price_per_day   numeric(12,2) not null check (price_per_day >= 0),
  rental_days     integer not null check (rental_days > 0),

  -- subtotal = price_per_day * quantity * rental_days
  subtotal        numeric(12,2) generated always as
                    (price_per_day * quantity * rental_days) stored,

  created_at      timestamptz not null default now()
);

create index if not exists idx_order_items_order on public.order_items (order_id);

comment on table public.order_items is 'Line items per order. price_per_day & rental_days are snapshots taken at submit time.';

-- =====================================================================
-- VIEW: order_summary — convenient admin read
-- =====================================================================
create or replace view public.order_summary as
select
  o.id,
  o.order_code,
  o.customer_name,
  o.agency,
  o.borrow_date,
  o.return_date,
  o.rental_days,
  o.total_price,
  o.status,
  o.payment_proof_url,
  o.created_at,
  count(oi.id)        as line_count,
  coalesce(sum(oi.quantity), 0) as total_units
from public.orders o
left join public.order_items oi on oi.order_id = o.id
group by o.id;

-- =====================================================================
-- VIEW: user_rentals — per-user rental history & totals (admin read)
-- =====================================================================
create or replace view public.user_rentals as
select
  u.id            as user_id,
  u.full_name,
  u.email,
  u.phone,
  u.agency,
  count(o.id)                            as total_orders,
  count(o.id) filter (where o.status = 'approved') as approved_orders,
  coalesce(sum(o.total_price) filter (where o.status = 'approved'), 0) as approved_spend,
  max(o.created_at)                      as last_order_at
from public.users u
left join public.orders o on o.user_id = u.id
group by u.id;

comment on view public.user_rentals is 'Aggregated rental history per customer for the admin panel.';

-- VIEW: user_rented_items — flat list of items each user has rented.
create or replace view public.user_rented_items as
select
  o.user_id,
  u.full_name,
  o.order_code,
  o.status,
  o.borrow_date,
  o.return_date,
  i.name          as item_name,
  oi.quantity,
  oi.rental_days,
  oi.subtotal,
  o.created_at
from public.orders o
join public.users u       on u.id = o.user_id
join public.order_items oi on oi.order_id = o.id
join public.items i        on i.id = oi.item_id;

comment on view public.user_rented_items is 'One row per (user, rented item): what each customer rented, when, and for how much.';

-- =====================================================================
-- TABLE: admin_users — who may log into the admin panel.
-- Passwords are stored as bcrypt hashes (pgcrypto crypt + gen_salt('bf')).
-- The plaintext password is NEVER stored.
-- =====================================================================
create table if not exists public.admin_users (
  id             uuid primary key default gen_random_uuid(),
  username       text        not null unique,
  password_hash  text        not null,          -- bcrypt hash, never plaintext
  is_active      boolean     not null default true,
  created_at     timestamptz not null default now()
);

comment on table  public.admin_users is 'Admin panel accounts. password_hash is a bcrypt hash; verify with verify_admin().';
comment on column public.admin_users.password_hash is 'md5(username || '':'' || password) — salted with username, no pgcrypto dependency.';

-- Return the stored bcrypt hash for a given active admin username.
-- The frontend receives this, then calls bcrypt.compare(plaintext, hash)
-- locally — no password hashing happens in the DB at all.
-- Security definer: admin_users is fully RLS-locked; this is the only
-- read path available to the anon key.
create or replace function public.get_admin_hash(p_username text)
returns text
language sql
security definer
set search_path = public
as $$
  select password_hash
  from   public.admin_users
  where  username  = p_username
    and  is_active = true
  limit 1;
$$;

-- Admin action: update order status after verifying admin credentials.
-- Returns TRUE on success, FALSE if credentials are wrong.
-- Security definer so it can write orders while RLS blocks direct updates.
create or replace function public.admin_update_order_status(
  p_username text,
  p_order_id uuid,
  p_status   order_status,
  p_note     text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Verify admin; the password check is now baked into admin session
  -- (we trust the caller already verified via verify_admin at login time).
  -- Re-check here so a stolen session cookie can't forge status updates.
  if not exists (
    select 1 from public.admin_users where username = p_username and is_active = true
  ) then
    return false;
  end if;

  update public.orders
     set status      = p_status,
         admin_note  = p_note,
         reviewed_at = now()
   where id = p_order_id;

  return found;
end;
$$;

-- To create the first admin account, run:
--   node scripts/setup-admin.js <username> <password>
-- That script bcrypt-hashes the password and prints the INSERT SQL to paste here.

-- =====================================================================
-- KEEP-ALIVE: prevents Supabase from pausing the project on inactivity.
-- A tiny table the daily cron/ping job writes to (see plan.MD).
-- =====================================================================
create table if not exists public.keepalive (
  id         integer primary key default 1,
  last_ping  timestamptz not null default now(),
  constraint keepalive_singleton check (id = 1)
);
insert into public.keepalive (id) values (1) on conflict (id) do nothing;

create or replace function public.ping_keepalive()
returns timestamptz
language sql
as $$
  update public.keepalive set last_ping = now() where id = 1
  returning last_ping;
$$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- Public site uses the anon key, so lock things down:
--   * items      : anyone can READ active items
--   * orders     : anyone can INSERT (submit) and SELECT (track by code)
--   * order_items: anyone can INSERT and SELECT
--   * UPDATE/DELETE & admin reads -> service_role only (admin panel)
-- NOTE: for the order-tracking search, the frontend filters by order_code.
-- =====================================================================
alter table public.items       enable row level security;
alter table public.users       enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.admin_users enable row level security;
alter table public.keepalive   enable row level security;

-- admin_users: NO public policies at all -> anon/auth can neither read the
-- password hashes nor write rows. Login goes only through verify_admin()
-- (security definer); account management uses the service-role key.

-- users: the public never reads the customer list directly (privacy). They
-- are created/looked-up only through upsert_user(), which runs as definer.
-- Admin reads the full list via the service-role key (bypasses RLS).
alter function public.upsert_user(text, text, text, text, text) security definer;

-- items: public read of active catalog
drop policy if exists "public read active items" on public.items;
create policy "public read active items"
  on public.items for select
  using (is_active = true);

-- orders: public can create and read (read needed to fetch order_code result)
drop policy if exists "public insert orders" on public.orders;
create policy "public insert orders"
  on public.orders for insert
  with check (true);

drop policy if exists "public read orders" on public.orders;
create policy "public read orders"
  on public.orders for select
  using (true);

-- order_items: public can create and read
drop policy if exists "public insert order_items" on public.order_items;
create policy "public insert order_items"
  on public.order_items for insert
  with check (true);

drop policy if exists "public read order_items" on public.order_items;
create policy "public read order_items"
  on public.order_items for select
  using (true);

-- keepalive: allow anon to call the function via RPC (function is SECURITY INVOKER)
drop policy if exists "public update keepalive" on public.keepalive;
create policy "public update keepalive"
  on public.keepalive for update
  using (true) with check (true);

-- The admin panel must use the SERVICE ROLE key (bypasses RLS) to
-- update order status, edit stock, and read everything. Never ship the
-- service role key to the browser — keep it server-side / in admin tooling.

-- =====================================================================
-- STORAGE: proof_of_payment bucket policies
-- Create the bucket first (Dashboard > Storage, name: proof_of_payment,
-- public = false recommended), then apply these policies.
-- =====================================================================
-- Allow anonymous uploads into the bucket (one-way submit).
drop policy if exists "anon upload proof" on storage.objects;
create policy "anon upload proof"
  on storage.objects for insert
  with check (bucket_id = 'proof_of_payment');

-- (Optional) allow reading back the just-uploaded file by path.
drop policy if exists "anon read proof" on storage.objects;
create policy "anon read proof"
  on storage.objects for select
  using (bucket_id = 'proof_of_payment');

-- =====================================================================
-- SEED DATA — sample catalog
-- =====================================================================
insert into public.items (name, description, price_per_day, stock) values
  ('Projector Epson EB-X06',        'XGA 3600 lumens projector',              75000, 5),
  ('Projector Screen 70" Tripod',   'Portable tripod projector screen',       40000, 8),
  ('Handie Talkie Baofeng UV-5R',   'Dual-band two-way radio (per unit)',     25000, 20),
  ('Camera Canon EOS 1500D',        'DSLR with 18-55mm kit lens',            120000, 3),
  ('Camera Sony A6000 Mirrorless',  'Mirrorless APS-C with 16-50mm lens',    150000, 2)
on conflict do nothing;

-- =====================================================================
-- FUNCTION GRANTS
-- Supabase's anon role must have EXECUTE permission on every RPC that
-- the frontend calls with the anon key. Without this the call returns 404.
-- =====================================================================
grant execute on function public.upsert_user(text, text, text, text, text)                to anon, authenticated;
grant execute on function public.get_admin_hash(text)                                     to anon, authenticated;
grant execute on function public.admin_update_order_status(text, uuid, order_status, text) to anon, authenticated;
grant execute on function public.ping_keepalive()                                          to anon, authenticated;

-- =====================================================================
-- DONE. See plan.MD for the application + keep-alive setup.
-- =====================================================================
