# GO-RENT — Build Plan

A simple, elegant web form for renting electronic equipment (projectors,
screens, handie-talkies, cameras). Built to be **easy for one developer to
maintain**.

**Stack:** Vite + React (frontend) · Supabase (PostgreSQL + Storage + Auth).

---

## 1. Flow (the whole product in one picture)

```
USER                                ADMIN
────                                ─────
1. Fill form (name, address,
   agency, needs, dates)
2. Pick items + quantities
3. Days = (return - borrow) + 1
   Price = Σ unit_price × qty × days
4. Upload payment proof  ──────────► proof_of_payment bucket
5. Submit  ────────────────────────► orders table (status = pending)
6. Receive ORDER CODE  (GR-XXXXXXXX)

7. Track status by entering
   the order code  ◄──────────────── admin reviews order + proof
                                      ▼
                                   approve → status = approved
                                   reject  → status = rejected (+ note)
```

Three statuses only: **pending → approved | rejected**.

---

## 2. Database

Full schema lives in [`/database/gorent_db.sql`](database/gorent_db.sql).
Run it once in the Supabase SQL Editor. Tables:

| Table | Purpose |
|-------|---------|
| `items`        | Rental catalog: name, description, `price_per_day`, `stock`, image. |
| `users`        | Customers, deduped by email/phone via `upsert_user()`. Aggregates rental history. |
| `orders`       | One per request: `user_id`, customer snapshot, dates, `rental_days` (auto), `total_price`, `payment_proof_url`, `status`, `order_code`. |
| `order_items`  | Line items: `quantity`, snapshot `price_per_day` + `rental_days`, auto `subtotal`. |
| `admin_users`  | Admin panel accounts: `username` + bcrypt `password_hash`. Login via `verify_admin()`. |
| `keepalive`    | Single-row table the daily ping touches (anti-suspend). |

Helper views for the admin panel: `user_rentals` (per-customer order counts &
spend) and `user_rented_items` (flat list of what each customer rented).

Key design choices (for maintainability):
- **`rental_days` and `subtotal` are GENERATED columns** — the DB computes
  them, so the app can't drift from the formula.
- **Price is snapshotted** into `order_items` at submit time, so editing a
  catalog price later never rewrites old orders.
- **`order_code`** (e.g. `GR-3F9A2B7C`) is the public tracking handle — short
  and safe to share, unlike the internal UUID.
- **RLS** lets the public read the catalog, insert orders, and read by code;
  all status changes require the **service-role** key (admin only).

---

## 3. Supabase setup (one-time)

1. Create a project. Note the **Project URL** + **anon key** (frontend) and
   **service-role key** (admin only — never in browser code).
2. SQL Editor → paste & run `database/gorent_db.sql`.
3. Storage → New bucket → name **`proof_of_payment`** (private). The SQL adds
   the upload/read policies.
4. The SQL seeds one admin account in `admin_users`
   (`admin` / `changeme123`). **Change it immediately:**
   `select public.set_admin('admin','your-strong-password');`

---

## 4. Frontend structure (Vite + React)

```
src/
  lib/supabase.js          # createClient(URL, anonKey)
  pages/
    OrderForm.jsx          # the main rental form (steps below)
    TrackOrder.jsx         # enter order_code -> show status + details
    Admin.jsx              # login + review/approve/reject (service-role)
  components/
    ItemPicker.jsx         # list items, qty selectors, live subtotal
    DateRange.jsx          # borrow/return date pickers + days display
    PriceSummary.jsx       # running total
    ProofUpload.jsx        # file input -> upload to bucket
  App.jsx                  # simple router (/, /track, /admin)
  main.jsx
```

**Order form steps (single page, sectioned):**
1. Customer info — name, address, agency, needs, phone/email.
2. Item selection — fetch `items` (active, stock > 0), choose quantities.
3. Dates — borrow & return; show computed days live.
4. Live price summary — `Σ price_per_day × qty × days`.
5. Upload proof of payment (image).
6. Submit.

**Submit sequence (client, anon key):**
1. Upload image to `proof_of_payment` → get public/path URL.
2. `rpc('upsert_user', {...})` → find-or-create the customer, returns `user_id`.
3. `insert` into `orders` (with `user_id`) → returns `id` + `order_code`.
4. `insert` rows into `order_items` (with price + days snapshots).
5. Show the `order_code` to the user (and the computed total).

> `upsert_user` dedupes returning customers by email/phone, so each person's
> rental history accumulates under one `users` row without any login.

> Keep it simple: compute the total in JS for display, but trust the DB
> generated `subtotal` columns as the source of truth.

**Track page:** input `order_code` → `select` order + items → show status
badge (Pending / Approved / Rejected) and `admin_note` if rejected.

**Admin page:**
- **Login:** call `rpc('verify_admin', { p_username, p_password })`. The DB
  hashes the input with bcrypt and compares it to the stored hash, returning
  only `true`/`false` — the password hash never leaves the database. On `true`,
  start an admin session.
- **Review:** list `order_summary` (filter by status) → open an order, view
  proof image → **Approve** / **Reject + note**. On approve, optionally
  decrement `items.stock`.
- Manage accounts with `set_admin('username','password')` (bcrypt-hashes and
  upserts). Run it via the **service-role key**, never the browser.
- Reads/writes to orders and `admin_users` management require the
  **service-role key**, so serve this page somewhere the key isn't exposed
  publicly (separate deploy / gated tool).

> Security note: `verify_admin` is callable with the anon key, so put basic
> rate-limiting / lockout on the login UI to deter brute force. For stronger
> auth you can later swap to Supabase Auth, but `admin_users` keeps it simple.

---

## 5. Keep-alive (avoid Supabase auto-pause)

Free Supabase projects pause after prolonged inactivity. Keep it warm with a
tiny scheduled ping that calls the `ping_keepalive()` function daily.

**Option A — GitHub Actions (recommended, free):** add
`.github/workflows/keepalive.yml`:

```yaml
name: supabase-keepalive
on:
  schedule:
    - cron: "0 6 * * *"   # every day 06:00 UTC
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping DB
        run: |
          curl -sS -X POST \
            "$SUPABASE_URL/rest/v1/rpc/ping_keepalive" \
            -H "apikey: $SUPABASE_ANON_KEY" \
            -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
            -H "Content-Type: application/json"
    env:
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
```

Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` as repo secrets.

**Option B — Supabase `pg_cron`:** schedule `select public.ping_keepalive();`
daily inside the database (Database → Extensions → enable `pg_cron`). Works
without external infra but a paused project also pauses cron, so Option A is
more reliable for keeping it *awake*.

---

## 6. Build order (suggested milestones)

1. **DB** — run `gorent_db.sql`, confirm seed items + bucket. ✅ schema ready
2. **Scaffold** — `npm create vite@latest gorent -- --template react`,
   add `@supabase/supabase-js`, create `lib/supabase.js`, `.env` with
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
3. **Catalog + form** — OrderForm with item picker and live pricing.
4. **Proof upload + submit** — wire the submit sequence, show order code.
5. **Track page** — lookup by order code.
6. **Admin panel** — auth login, review list, approve/reject.
7. **Keep-alive** — add the GitHub Action.
8. **Polish** — elegant minimal styling (Tailwind or plain CSS), validation,
   empty/error states.

---

## 7. Environment variables

```
# Frontend (.env — safe to ship, anon key is public-by-design)
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...

# Admin only (NEVER in the public frontend bundle)
SUPABASE_SERVICE_ROLE_KEY=...
```

---

That's the whole system. Start at milestone 1 (the DB is already written) and
work down — each milestone is independently testable.
