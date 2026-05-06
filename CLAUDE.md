# LokaPOS — Claude Code Instructions

## Project
Next.js 15 App Router + Supabase. Coffee shop POS system with customer-facing PWA.

## Design System

### Colors
- Primary: `#7F1D1D` (dark red/maroon)
- Primary hover: `#6B1818`
- Primary light: `#7F1D1D/10`
- Background: `#FDF8F4` (warm off-white, customer app)
- Admin background: dark sidebar (`#111827`-ish, uses Tailwind dark theme)

### Aesthetic
- Clean, premium, minimal — think Stripe dashboard meets specialty coffee brand
- No clutter. Whitespace is intentional.
- Cards: `rounded-2xl`, `border border-gray-100`, `shadow-sm`
- Buttons: `rounded-xl` or `rounded-2xl`, bold labels
- Typography: tight hierarchy — bold headings, muted subtext (`text-gray-400`)

### Admin Dashboard Style
- Full-width content area, not floating card in center
- Section headers: large bold title + muted subtitle below
- Data cards: white bg, border, subtle shadow — NOT modal-style
- Tables: clean rows with hover states
- Toggles: use pill-style toggle switches (not checkboxes)
- Status badges: small rounded-full pills with matching color bg

### Customer App Style (app/customer/page.tsx)
- Mobile-first, max-w-lg centered
- Hero sections use red gradient (`#7F1D1D → #B91C1C`)
- Dot pattern overlay on heroes (`opacity-[0.07]`)
- Bottom nav: SVG icons + English labels
- Sheets/modals: slide up from bottom with `rounded-t-3xl`
- Success screens: full-page centered with animated checkmark

### Component Patterns
- Empty states: large emoji + muted text + action button
- Loading: skeleton placeholders (animate-pulse gray blocks)
- Error: warning icon + message + retry button
- Forms: labeled inputs with `focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20`
- Toggles for on/off settings (not checkboxes)
- Confirmation: bottom sheet modal, not browser confirm()

## Code Conventions
- All API routes use `requireAdminApi()` / `requireStaffApi()` / public (no auth)
- Public customer routes live under `/api/public/`
- Supabase admin client: `createSupabaseAdminClient()` from `@/lib/supabase/admin`
- Phone normalization: `phone.replace(/[^\d+]/g, "")`
- loyalty_ledger entry_type allowed values: `'earn'`, `'redeem'`, `'adjust'`
- Payment methods stored in `store_settings` table (JSONB), fetched via `/api/public/store-status`

## Key Files
- Customer app: `app/customer/page.tsx` (single-file SPA)
- Admin nav: `app/dashboard/admin-nav.tsx` — update BOTH `NAV_ITEMS` and `MOBILE_MORE` arrays
- Store settings: `app/api/admin/settings/route.ts`
- Middleware: lightweight cookie-check only, Node.js runtime (`experimental.nodeMiddleware: true`)

## Working Directory
Always work from `~/Developer/LokaPOS` — NOT `~/Documents/LokaPOS` (iCloud, causes webpack errors)
