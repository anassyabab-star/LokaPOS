# Loka Coffee — Admin Dashboard Redesign · Context Pack

Attach this file to Claude (claude.ai) together with the redesign prompt and a few
screenshots of the current admin. It gives the real sections, real data shapes, and
brand so the design maps cleanly to the codebase (no invented data models).

---

## Product & users
- **Loka Coffee & Fruits Specialists** — specialty coffee shop, Loka Bangi (Malaysia).
- This is the **back-office admin** for the POS (`/dashboard`). Used by the **owner** (full access) and **staff/cashier/barista** (limited) on **desktop and mobile**.
- Sister surfaces (don't redesign, just align visually): the **POS** (`/pos`, cashier app) and the **customer ordering PWA** (`/menu`, cream/maroon, already redesigned).
- **Current pain:** dark generic theme, cluttered, cold, not premium, not mobile-friendly. Want: **warm, clean, friendly, premium** — Stripe/Linear polish meets specialty-coffee brand.

## Stack (design references only — not production code)
Next.js 15 App Router + Supabase (Postgres) + Tailwind CSS v3. Deliver a **hifi HTML prototype + tokens + per-screen specs**; re-express as Tailwind utilities.

## Brand tokens (reuse exactly — already used in the customer app)
| Token | Hex | Use |
|---|---|---|
| maroon | `#7F1D1D` (hover `#6B1818`) | primary buttons, active nav, key numbers |
| espresso (ink) | `#2A1D16` | primary text / dark surfaces |
| cream | `#F6EFE3` / `#F4ECE1` | warm canvas |
| card | `#FFFFFF` | cards, inputs |
| hairline | `#EADFCD` | borders/dividers |
| muted | `#8A7461` / `#B7A48D` | secondary/tertiary text, uppercase labels |
| melon | `#E8604C` | alerts, low-stock, attention |
| leaf | `#3F7D4F` | positive / paid / success |
- Fonts: **Space Grotesk** (display, numbers, prices, headings) + **DM Sans** (body, labels). Uppercase section labels: DM Sans 600, 12px, tracking 0.16em, muted.
- Cards `rounded-2xl`, subtle border + soft shadow; pill status badges; 44px min tap targets; intentional whitespace.
- Money is **RM** (e.g. `RM 12`, `RM 12.50`) — integers shown without decimals.

---

## Sections (15) — real data & key actions

> Field lists below are the actual Supabase columns. Design realistic rows/forms from them; don't invent new fields.

### 1. Overview (`/dashboard`) — home
KPIs at a glance. Suggested: **today's sales (RM)**, **orders count**, **avg order**, **open shift status + cash**, **top-selling items**, **low-stock alerts**, **new customers**, a sales **trend chart** (by day), recent orders. Range switch (today / 7d / 30d).

### 2. Orders (`/dashboard/orders`)
`orders`: id, receipt_number, date_key, customer_name, subtotal, discount_type, discount_value, total, payment_method, cash_received, balance, **status** (pending/preparing/ready/completed/cancelled), **payment_status** (pending/paid/refunded), order_source (pos/customer_web), created_at, customer_id.
`order_items`: order_id, product_name_snapshot, variant_id, sugar_level, price, qty, line_total.
Actions: filter by status/date/source, view order detail (items), refund/void, advance status. ~2,400 orders — needs good list/table + filters + pagination/search.

### 3. Products (`/dashboard/products`)
`products`: id, name, price, cost, **stock**, category_id, is_active, image_url. `product_variants`: name, price_adjustment. `product_addons`: name, price. ~40 products.
Actions: add/edit product (name, price, cost, stock, category, image, variants, addons), toggle active, low-stock highlight. Table or card grid + add/edit form (modal or page).

### 4. Categories (`/dashboard/categories`)
`categories`: id, name. ~5. Simple CRUD list (reorder optional).

### 5. Reports (`/dashboard/reports`)
Sales analytics from `orders`/`order_items`: revenue over time, by category/product, by payment method, by hour/day; discounts; refunds. Date-range picker + charts + export.

### 6. Shifts (`/dashboard/shifts`)
`pos_shifts`: register_id, opened_by, opened_at, opening_cash, status (open/closed), closed_by, closed_at, counted_cash, expected_cash, **over_short**, notes. ~150. List of shifts + open/close detail, cash reconciliation (expected vs counted vs over/short).

### 7. Timesheets (`/dashboard/timesheets`)
`staff_clockins`: user_id, clock_in_at, clock_out_at, **duration_minutes**, notes. Staff attendance — list by staff/date, total hours, (salary calc exists). 

### 8. Paid Outs (`/dashboard/paid-outs`)
Cash taken out of the till during a shift (petty cash). Amount, reason, by whom, time. (Table currently empty.)

### 9. Expenses (`/dashboard/expenses`)
`expenses`: expense_date, amount, category, description, vendor_name, payment_method, invoice_number, invoice_url/file. ~79. List + add expense form (with invoice upload), filter by category/date, totals.

### 10. Customers (`/dashboard/customers`)
`customers`: id, name, phone, email, birth_date, consent_whatsapp/email, **total_orders**, **total_spend**, last_order_at, notes, referral_code, referred_by. ~2,160. Searchable list + customer detail (orders, loyalty, contact, consent), membership tier.

### 11. Loyalty (`/dashboard/loyalty`)
`loyalty_ledger`: customer_id, order_id, **entry_type** (earn/redeem/adjust), **points_change**, expires_at, note, source (order/checkin/voucher/referral/birthday/manual), created_at. `vouchers` (issued/redeemed/expired). `store_settings.loyalty_config` (earn rate, redeem rate, tiers, voucher tiers, expiry…). 
Dashboard: points liability (RM value), points issued vs redeemed (range), top members, check-in trend, voucher counts. Config is editable in Settings.

### 12. Campaigns (`/dashboard/campaigns`)
WhatsApp blast/marketing to customers (uses `customers` + consent fields). Compose message, pick audience (consented customers / segment), send, track. 

### 13. Users (`/dashboard/users`)
`profiles`: id, full_name, **role** (owner/admin/staff…), status (active/…), last_seen_at. `signup_requests`: email, full_name, requested_role, status, requested_at (staff invite/approval flow — section "Signups"). Manage staff accounts + invite/approve.

### 14. Settings (`/dashboard/settings`)
`store_settings`: **payment_methods** (toggles: fpx/cash/card + custom), **loyalty_config** (JSON: earnPerRM, redeemRmPerPoint, redeemMinPoints, redeemMaxRatio, expiryDays, tiers, voucherTiers…), **Kitchen Display (KDS)** on/off toggle. Pill toggles, grouped sections, "save" affordance.

### 15. POS link
Just a nav link out to `/pos` (the cashier app).

---

## Navigation
Desktop: **left sidebar** with the 15 sections (currently dark `#111827`). Mobile: **bottom nav** (POS, Overview, Orders, Products) + a "More" sheet for the rest. Redesign both. Active item = maroon. Show the signed-in user + role + sign-out.

## Reusable patterns to design (used across every screen)
- KPI **stat card** (label + big Space-Grotesk number + delta/trend)
- **Data table** row (clean rows, hover, status pill, row actions) + filters/search/pagination — used by Orders, Products, Expenses, Customers, Shifts, Timesheets
- **Form / input** (labeled, focus ring maroon) + **toggle switch** (pill) + **modal / bottom-sheet confirm**
- **Status badge** pills (paid=leaf, pending=muted, refunded/cancelled=melon, etc.)
- **Empty / loading (skeleton) / error** states
- **Chart** style for Overview/Reports (line/bar, brand colors)

## Deliverables (ask Claude for, in order)
1. 2–3 **directions** for shell + Overview → pick one.
2. Final **tokens** (color/type/spacing/radius/shadow/motion).
3. **App shell** (sidebar desktop + bottom nav mobile + header).
4. **Hifi screens:** Overview, Orders (list+detail), Products (list+add/edit), Reports, Settings, Customers, Loyalty.
5. **Reusable patterns** above.

Mobile-first responsive + desktop-rich. High fidelity (final copy/spacing/interactions). Implementable with Tailwind utilities, mapped to the real data above.
