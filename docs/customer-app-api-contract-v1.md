# Customer App API Contract v1

Status: Draft (backend-ready target before customer order web app)

## 1) Auth + Access Model

- Auth provider: Supabase Auth
- Customer app role: `customer`
- Session: Supabase cookie/JWT (authenticated user)
- Rule: customer app must never use `SUPABASE_SERVICE_ROLE_KEY` on client

## 2) Data Model Dependencies (Frozen v1)

These tables/views are required for customer app flows:

- `public.profiles` (`id`, `role`, `status`)
- `public.customers` (`id`, `name`, `phone`, `email`, consent fields, totals)
- `public.loyalty_ledger`
- `public.customer_loyalty_balances`
- `public.customer_loyalty_balances_1y`
- `public.orders` (+ `customer_id`)
- `public.order_items`
- `public.order_item_addons`
- `public.products`, `public.product_variants`, `public.product_addons`, `public.categories`

## 3) Existing Reusable APIs (already in project)

These endpoints already exist and can be reused internally or adapted:

- `GET /api/products` (catalog)
- `POST /api/orders` (staff POS checkout)
- `GET /api/orders/receipt/:id` (receipt HTML)
- `GET /api/pos/customers/lookup?phone=` (staff member lookup)
- `GET /api/auth/role` (resolve signed-in role)

Note: current `POST /api/orders` is staff-only and shift-gated, not customer-app-ready.

## 4) New Customer APIs to Implement Next

### 4.1 Catalog

- `GET /api/customer/catalog`
- Auth: `customer` (or public if you decide guest browsing)
- Response:

```json
{
  "categories": [{ "id": "uuid", "name": "coffee" }],
  "products": [
    {
      "id": "uuid",
      "name": "Americano",
      "price": 9,
      "category": "coffee",
      "variants": [{ "id": "uuid", "name": "hot", "price_adjustment": 0 }],
      "addons": [{ "id": "uuid", "name": "extra shot", "price": 3 }]
    }
  ]
}
```

### 4.2 Customer Profile + Consent

- `GET /api/customer/me`
- `PATCH /api/customer/me`
- Auth: `customer`
- Editable: `name`, `phone`, `email`, `consent_whatsapp`, `consent_email`, `birth_date`

### 4.3 Loyalty

- `GET /api/customer/loyalty`
- Auth: `customer`
- Response:

```json
{
  "points_available": 120,
  "expiring_points_30d": 20,
  "history": [
    {
      "id": "uuid",
      "entry_type": "earn",
      "points_change": 10,
      "order_id": "uuid",
      "created_at": "2026-03-10T08:00:00Z",
      "note": "Earn from order 10032026-001"
    }
  ]
}
```

### 4.4 Customer Order Create

- `POST /api/customer/orders`
- Auth: `customer`
- Request:

```json
{
  "items": [
    {
      "product_id": "uuid",
      "variant_id": "uuid-or-null",
      "addon_ids": ["uuid"],
      "sugar_level": "normal",
      "qty": 2
    }
  ],
  "discount_code": null,
  "redeem_points": 100,
  "payment_method": "fpx"
}
```

- Response:

```json
{
  "success": true,
  "order_id": "uuid",
  "order_number": "10032026-021",
  "subtotal": 25,
  "discount": 5,
  "total": 20,
  "payment": {
    "status": "pending",
    "provider": "to-be-integrated"
  }
}
```

### 4.5 Customer Order History

- `GET /api/customer/orders`
- `GET /api/customer/orders/:id`
- Auth: `customer`
- Return only orders where `orders.customer_id` maps to current customer profile

## 5) Shared Error Shape (standardize now)

All customer endpoints should use:

```json
{
  "error": "Human readable message",
  "code": "MACHINE_CODE",
  "details": null
}
```

Recommended HTTP codes:

- `400` validation
- `401` unauthenticated
- `403` role forbidden
- `404` not found/ownership mismatch
- `409` business conflict (stock, invalid redeem)
- `500` internal

## 6) Non-negotiable Rules

- Validate stock and final price on server only
- Do not trust client subtotal/total
- Record loyalty as ledger transactions (`earn`/`redeem`), not overwrite balance
- Enforce consent before outbound campaign sends
- Attach `orders.customer_id` for customer order history and loyalty dispute tracing

## 7) Rollout Sequence (after this sprint)

1. Implement `GET/PATCH /api/customer/me`
2. Implement `GET /api/customer/catalog`
3. Implement `GET /api/customer/loyalty`
4. Implement `POST /api/customer/orders` + payment placeholder
5. Implement customer order history endpoints
6. Connect payment gateway + webhook confirmation
