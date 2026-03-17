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

## Core Schema v1 (Recommended Baseline)
For a clean project setup (auth role + customer consent + loyalty + CRM foundation), run:
```sql
-- file: sql/schema_v1_core.sql
```

This file is idempotent (safe to re-run) and includes:
- `profiles` + auto sync trigger from `auth.users`
- `signup_requests` enhancement fields
- `customers` + consent fields/indexes
- `loyalty_ledger` + balance views
- `crm_campaigns`, `crm_campaign_recipients`, and `crm_customer_segments` view

## Backend Readiness Sprint (Before Customer Order Webapp)
Apply additional hardening:
```sql
-- file: sql/backend_readiness_hardening.sql
```

What this adds:
- RLS baseline policies (least-privilege) for core tables
- Compatibility + freeze columns for order flow (`orders.customer_id`, `order_items.sugar_level`)
- Defensive indexes for orders, customers, loyalty, and campaign queries

Supporting docs:
- `docs/backend-readiness-sprint.md`
- `docs/customer-app-api-contract-v1.md`

## Murpati WhatsApp (Campaign v1 send)
Set these env vars in `.env.local`:
- `MURPATI_BASE_URL` (default: `https://api.murpati.com`)
- `MURPATI_API_KEY`
- `MURPATI_SESSION_ID`
- `MURPATI_BATCH_LIMIT` (optional, default `50`)

Current v1 behavior:
- Queue recipients by segment in `/dashboard/campaigns`
- Send WhatsApp in batches (`Send WhatsApp Batch`)
- Email channel stays queued (email provider integration is next phase)
