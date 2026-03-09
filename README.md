# Coffee POS (Next.js + Supabase)

Minimal mobile/tablet-friendly coffee shop POS starter built with Next.js App Router, TypeScript, Tailwind, and Supabase.

## Pages
- `/login`
- `/dashboard`
- `/products`
- `/orders`

## Run
```bash
npm install
npm run dev
```

## Supabase setup
1. Copy env file:
```bash
cp .env.example .env.local
```
2. Add your Supabase project values to `.env.local`.
3. Create tables:
- `products(id, name, category, price, stock)`
- `orders(id, ticket, items, total, status, created_at)`

If Supabase keys are missing or query fails, the app falls back to local mock data.

## Auth + Roles (Phase 1)
This project now uses Supabase Auth for login.

Required role model:
1. Create `profiles` table with columns:
- `id uuid primary key` (same as `auth.users.id`)
- `role text not null` (`admin`, `cashier`, `customer`)
2. Set role for each user (e.g. insert/update row in `profiles`).

Routing behavior:
- `admin` -> `/dashboard`
- `cashier` -> `/pos`

Protected routes:
- `/dashboard/*` admin only
- `/pos` admin + cashier

Signup request + approval flow:
- New signup creates `pending` record in `public.signup_requests` (not immediate account creation)
- Admin reviews in dashboard: `/dashboard/signups`
- On approve:
  - Supabase invite email is sent
  - `profiles(id, role)` is upserted automatically
  - user role metadata is set
- On reject:
  - request status is marked `rejected`

Required setup for signup requests:
1. Run SQL in Supabase SQL editor:
```sql
-- file: sql/signup_requests.sql
```
2. Ensure env is set in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL` (example: `http://localhost:3000`)

## POS Shift Opening/Closing (Safe Model)
This app now supports server-based shift control (safe for phone/device switching):
- Staff must `Start Shift` before taking orders
- Any logged-in staff device can continue the open shift
- `Close Shift` records expected cash vs counted cash

Required setup:
1. Run SQL in Supabase SQL editor:
```sql
-- file: sql/pos_shifts.sql
```

## Customer Database + Consent
This app now captures customer consent data at POS checkout:
- `name`
- `phone`
- `email`
- `consent_whatsapp`
- `consent_email`

Admin can view customer CRM data at:
- `/dashboard/customers`

Required setup:
1. Run SQL in Supabase SQL editor:
```sql
-- file: sql/customers.sql
```
