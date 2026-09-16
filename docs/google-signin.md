# Google sign-in (customer app) — setup

Butang **Continue with Google** di `/signin` (app QR ordering, `app/(order)`)
guna Supabase Auth OAuth. Returning customer masuk tanpa kod; kali pertama
sahaja perlu sahkan nombor telefon (OTP WhatsApp) supaya mata loyalti
(yang dikunci pada nombor telefon) tersambung ke akaun Google.

## 1. Google Cloud Console

1. [console.cloud.google.com](https://console.cloud.google.com) → projek baru `Loka POS`.
2. **APIs & Services → OAuth consent screen**: External, nama app `Loka Coffee`, email sokongan, logo (pilihan). Scope default (`email`, `profile`, `openid`) cukup. Publish app (bukan Testing) supaya semua customer boleh log masuk.
3. **Credentials → Create credentials → OAuth client ID** → *Web application*:
   - Authorized JavaScript origins: `https://<domain>` dan `http://localhost:3000`
   - Authorized redirect URIs: `https://fgfnebfazthxrukrujyx.supabase.co/auth/v1/callback`
4. Salin **Client ID** dan **Client secret**.

## 2. Supabase Dashboard

1. **Authentication → Providers → Google**: Enable, tampal Client ID + Secret. Simpan.
2. **Authentication → URL Configuration**:
   - Site URL: `https://<domain>`
   - Redirect URLs: `https://<domain>/auth/callback`, `http://localhost:3000/auth/callback`
3. Run migration `supabase/migrations/20260916_customer_google_auth.sql` (SQL Editor).
   Ia tambah `customers.user_id`, dan **membetulkan default role** pengguna baru
   kepada `customer` (sebelum ini `cashier` — pengguna Google baru boleh masuk POS).

## 3. Aliran

| Keadaan | Apa jadi |
|---|---|
| Google pertama kali | `/auth/callback` → cipta rekod customer → `/signin?stage=link` → masukkan telefon → OTP → nombor diikat pada akaun |
| Google kali seterusnya | `/auth/callback` → sesi telefon dikeluarkan terus dari `customers.phone` → `/rewards` tanpa kod |
| Peranti baru / storage kosong | app panggil `/api/public/me` → pulihkan nama + telefon dari sesi Google |
| Staff guna butang Google | dikesan sebagai staff (role dari `app_metadata` / profil) → `/auth/redirect` |

Log keluar: `/auth/logout?next=/menu` (membuang sesi Supabase **dan** kuki telefon).

## 4. Nota keselamatan

- Hanya `app_metadata.role` (ditulis oleh service role) dipercayai untuk staff;
  `user_metadata` boleh diubah oleh pengguna sendiri dan diabaikan.
- Ikatan telefon ↔ Google hanya melalui `/api/customer/link-phone`, yang
  memerlukan **kedua-dua** sesi Google dan kuki OTP untuk nombor itu.
