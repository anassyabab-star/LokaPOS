# Backend Readiness Sprint

Status: Implemented (code + SQL artifacts ready)

## Deliverables

- DB hardening SQL: `sql/backend_readiness_hardening.sql`
- Core schema baseline: `sql/schema_v1_core.sql`
- POS shift schema: `sql/pos_shifts.sql`
- API contract draft for customer app: `docs/customer-app-api-contract-v1.md`

## What This Sprint Solves

1. Freezes critical columns/indexes for order + loyalty flows
2. Enables RLS on core tables with least-privilege baseline policies
3. Prepares backend contract for customer app ordering without breaking current POS/admin flows

## Required Apply Order (Supabase SQL Editor)

1. `sql/schema_v1_core.sql`
2. `sql/pos_shifts.sql`
3. `sql/backend_readiness_hardening.sql`

All files are idempotent (safe to re-run).

## Important Notes

- Current app APIs mostly use service role server-side, so RLS hardening does not break existing admin/POS behavior.
- Customer app should only use auth session + customer-scoped APIs (never service role in client).
- `orders.customer_id` is now part of backend freeze strategy for customer order history.

## Post-Apply Verification (SQL)

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles','signup_requests','customers','loyalty_ledger','crm_campaigns','crm_campaign_recipients',
    'pos_shifts','orders','order_items','order_item_addons','products','categories','product_variants','product_addons'
  )
order by tablename;
```

```sql
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

## Next Build Step (recommended)

After DB scripts are applied, implement customer API set in this order:

1. `/api/customer/me` (`GET`, `PATCH`)
2. `/api/customer/catalog` (`GET`)
3. `/api/customer/loyalty` (`GET`)
4. `/api/customer/orders` (`POST`, `GET`)
5. `/api/customer/orders/:id` (`GET`)
