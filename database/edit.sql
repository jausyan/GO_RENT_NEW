-- =====================================================================
-- GO-RENT — Incremental DB patch
-- Run this in the Supabase SQL Editor on your existing database.
-- Every statement is safe to re-run (IF NOT EXISTS / CREATE OR REPLACE).
-- =====================================================================


-- -------------------------------------------------------------------
-- 1. NEW TABLE: users
--    Tracks customers; deduped by email or phone via upsert_user().
-- -------------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  full_name   text        not null,
  email       text        unique,
  phone       text        unique,
  address     text,
  agency      text,
  notes       text,
  created_at  timestamptz not null default now(),
  constraint chk_user_contact check (email is not null or phone is not null)
);

create index if not exists idx_users_email on public.users (email);
create index if not exists idx_users_phone on public.users (phone);


-- -------------------------------------------------------------------
-- 2. FUNCTION: upsert_user
--    Find-or-create customer by email/phone; returns user_id.
--    Called by the frontend before inserting an order.
-- -------------------------------------------------------------------
create or replace function public.upsert_user(
  p_full_name text,
  p_email     text default null,
  p_phone     text default null,
  p_address   text default null,
  p_agency    text default null
) returns uuid
language plpgsql
security definer
set search_path = public
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


-- -------------------------------------------------------------------
-- 3. ALTER TABLE orders: add user_id FK (skip if column already exists)
-- -------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'orders'
      and column_name  = 'user_id'
  ) then
    alter table public.orders
      add column user_id uuid references public.users(id) on delete set null;
  end if;
end$$;

create index if not exists idx_orders_user_id on public.orders (user_id);


-- -------------------------------------------------------------------
-- 4. VIEWS: user_rentals and user_rented_items (admin convenience)
-- -------------------------------------------------------------------
create or replace view public.user_rentals as
select
  u.id                                                         as user_id,
  u.full_name,
  u.email,
  u.phone,
  u.agency,
  count(o.id)                                                  as total_orders,
  count(o.id) filter (where o.status = 'approved')            as approved_orders,
  coalesce(sum(o.total_price) filter (where o.status = 'approved'), 0) as approved_spend,
  max(o.created_at)                                            as last_order_at
from public.users u
left join public.orders o on o.user_id = u.id
group by u.id;

create or replace view public.user_rented_items as
select
  o.user_id,
  u.full_name,
  o.order_code,
  o.status,
  o.borrow_date,
  o.return_date,
  i.name       as item_name,
  oi.quantity,
  oi.rental_days,
  oi.subtotal,
  o.created_at
from public.orders o
join public.users       u  on u.id  = o.user_id
join public.order_items oi on oi.order_id = o.id
join public.items       i  on i.id  = oi.item_id;


-- -------------------------------------------------------------------
-- 5. NEW TABLE: admin_users
--    Stores bcrypt password hashes for admin panel accounts.
--    Passwords are hashed on the frontend (bcryptjs) before storage.
-- -------------------------------------------------------------------
create table if not exists public.admin_users (
  id             uuid primary key default gen_random_uuid(),
  username       text not null unique,
  password_hash  text not null,     -- bcrypt hash produced by frontend bcryptjs
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);


-- -------------------------------------------------------------------
-- 6. FUNCTION: get_admin_hash
--    Returns the stored bcrypt hash for a username so the frontend
--    can call bcrypt.compare(plaintext, hash) locally.
--    Security definer keeps admin_users invisible to the anon key.
--
--    Drops old verify_admin / set_admin if they exist from a previous
--    version of this schema.
-- -------------------------------------------------------------------
drop function if exists public.verify_admin(text, text);
drop function if exists public.set_admin(text, text);

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


-- -------------------------------------------------------------------
-- 7. FUNCTION: admin_update_order_status
--    Verifies the caller is an active admin, then updates the order.
--    Security definer so the anon key can trigger it without a direct
--    UPDATE policy on orders.
-- -------------------------------------------------------------------
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
  if not exists (
    select 1 from public.admin_users
    where username = p_username and is_active = true
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


-- -------------------------------------------------------------------
-- 8. KEEPALIVE table + function (anti-pause for free Supabase tier)
-- -------------------------------------------------------------------
create table if not exists public.keepalive (
  id        integer primary key default 1,
  last_ping timestamptz not null default now(),
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


-- -------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY — enable on new tables
-- -------------------------------------------------------------------
alter table public.users       enable row level security;
alter table public.admin_users enable row level security;
alter table public.keepalive   enable row level security;

-- users: no direct public read (privacy). Access only via upsert_user().
-- admin_users: no public policies at all — get_admin_hash() is the only path.
-- keepalive: anon may UPDATE (ping function needs it).
drop policy if exists "public update keepalive" on public.keepalive;
create policy "public update keepalive"
  on public.keepalive for update
  using (true) with check (true);


-- -------------------------------------------------------------------
-- 10. STORAGE policies for proof_of_payment bucket
--     (Skip if the bucket doesn't exist yet — create it in the
--      Supabase dashboard first: Storage → New bucket → proof_of_payment)
-- -------------------------------------------------------------------
drop policy if exists "anon upload proof" on storage.objects;
create policy "anon upload proof"
  on storage.objects for insert
  with check (bucket_id = 'proof_of_payment');

drop policy if exists "anon read proof" on storage.objects;
create policy "anon read proof"
  on storage.objects for select
  using (bucket_id = 'proof_of_payment');


-- -------------------------------------------------------------------
-- 11. GRANT EXECUTE on every RPC the frontend calls with the anon key.
--     Without this Supabase returns 404 on the RPC call.
-- -------------------------------------------------------------------
grant execute on function public.upsert_user(text, text, text, text, text)                 to anon, authenticated;
grant execute on function public.get_admin_hash(text)                                      to anon, authenticated;
grant execute on function public.admin_update_order_status(text, uuid, order_status, text) to anon, authenticated;
grant execute on function public.ping_keepalive()                                          to anon, authenticated;


-- -------------------------------------------------------------------
-- DONE.
--
-- Last step — create your admin account:
--   1. Run:  node scripts/setup-admin.js <username> <password>
--   2. Copy the INSERT SQL it prints and run it here.
-- -------------------------------------------------------------------
