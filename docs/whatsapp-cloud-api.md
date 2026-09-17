# WhatsApp Cloud API (rasmi) — setup

LokaPOS menghantar semua mesej transaksi melalui `lib/whatsapp.ts`. Bila
`WHATSAPP_CLOUD_ACCESS_TOKEN` dan `WHATSAPP_CLOUD_PHONE_NUMBER_ID` ditetapkan,
mesej keluar melalui **WhatsApp Cloud API** (Meta) sebagai **template**; kalau
tidak, ia jatuh balik ke Murpati (gateway tidak rasmi). Kempen marketing kekal
di Murpati (mesej bebas).

## 1. Akaun Meta

1. [business.facebook.com](https://business.facebook.com) → buat / pilih **Meta Business Portfolio** untuk Cafe Loka. Lengkapkan **Business Verification** (SSM + bil utiliti/bank) — tanpa ini had 250 mesej/hari dan nama paparan tak sah.
2. [developers.facebook.com](https://developers.facebook.com) → **Create App** → jenis *Business* → tambah produk **WhatsApp**.
3. WhatsApp → **API Setup**: tambah nombor telefon kedai (nombor yang **belum** dipakai WhatsApp biasa/Business App, atau padam akaun WhatsApp nombor itu dulu). Sahkan OTP.
4. Salin **Phone number ID** (bukan WABA ID) → `WHATSAPP_CLOUD_PHONE_NUMBER_ID`.
5. Token kekal: Business Settings → **System Users** → Add (Admin) → **Generate token** untuk app ini dengan permission `whatsapp_business_messaging` + `whatsapp_business_management`, tempoh *Never expire* → `WHATSAPP_CLOUD_ACCESS_TOKEN`.
6. Tambah kaedah bayaran di WhatsApp Manager (mesej utility/authentication dikenakan bayaran per perbualan, ~RM0.08 di Malaysia).

## 2. Env (Vercel + `.env.local`)

```
WHATSAPP_PROVIDER=auto                 # auto | cloud | murpati
WHATSAPP_CLOUD_ACCESS_TOKEN=...
WHATSAPP_CLOUD_PHONE_NUMBER_ID=...
WHATSAPP_CLOUD_WABA_ID=...             # pilihan: papar status kelulusan template di kad admin
WHATSAPP_CLOUD_API_VERSION=v22.0
WHATSAPP_TEMPLATE_LANG=ms
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<rentetan rawak>
WHATSAPP_APP_SECRET=<App Dashboard → Settings → Basic → App Secret>
```

Nama template boleh diubah dengan `WHATSAPP_TEMPLATE_OTP`,
`WHATSAPP_TEMPLATE_ORDER_RECEIVED`, `WHATSAPP_TEMPLATE_ORDER_PAID`,
`WHATSAPP_TEMPLATE_ORDER_READY`, `WHATSAPP_TEMPLATE_POINTS_RECEIPT`.

## 3. Webhook (pilihan, untuk status hantar/terima)

Meta App → WhatsApp → **Configuration** → Callback URL
`https://pos.lokacafe.my/api/webhooks/whatsapp`, Verify token = `WHATSAPP_WEBHOOK_VERIFY_TOKEN`,
subscribe field `messages`. Route hanya log status; ia tidak wajib untuk menghantar.

## 4. Template yang perlu dibuat (WhatsApp Manager → Message templates)

Bahasa: **Bahasa Melayu (ms)**. Guna parameter **bernombor** (`{{1}}`, `{{2}}`…), bukan bernama. Parameter mesti mengikut **urutan** di bawah —
`lib/whatsapp.ts` menghantar dalam urutan ini. Nilai parameter tidak boleh ada
baris baru; kod dah bersihkan.

### `loka_otp` — kategori **Authentication**
Bahasa boleh English atau Melayu — app kesan bahasa template secara automatik dari WABA (atau set `WHATSAPP_TEMPLATE_OTP_LANG=en_US`). Meta jana badan tetap. Pilihan: ✅ *Add security recommendation*, ✅ *Add expiry
time* (5 minit), butang **Copy code**. Dihantar dengan `{{1}}` = kod dan
parameter butang = kod.

### `loka_order_received` — kategori **Utility**
```
Hai {{1}}, order #{{2}} ({{3}}) diterima — {{4}}.
Item: {{5}}
Jumlah: RM{{6}}
{{7}}
```
| # | nilai |
|---|---|
| 1 | nama customer |
| 2 | Order ID pendek, cth `042` |
| 3 | nombor resit penuh |
| 4 | `Dine In · Meja 7` / `Take Away` |
| 5 | ringkasan item, cth `2× Latte (Iced), 1× Mocha` |
| 6 | jumlah, cth `12.50` |
| 7 | langkah seterusnya (`Sila ke kaunter dan sebut Order ID #042 untuk bayar.` / `Selesaikan bayaran online…`) |

### `loka_order_paid` — kategori **Utility**
```
✅ Bayaran diterima untuk order #{{1}} ({{2}}).
Jumlah: RM{{3}}
{{4}}
Terima kasih — {{5}} ☕
```
1 Order ID pendek · 2 resit · 3 jumlah · 4 baris sasaran (`Pesanan akan dihantar ke Meja 7.` / `Buzzer 12 akan berbunyi bila pesanan siap.` / `Kami maklumkan bila pesanan siap.`) · 5 nama kedai

### `loka_order_ready` — kategori **Utility**
```
Hai {{1}}, order #{{2}} ({{3}}) dari {{4}} dah siap! ☕
{{5}}
Total: RM{{6}}
Terima kasih.
```
1 nama · 2 Order ID pendek · 3 resit · 4 nama kedai · 5 baris sasaran (`Kami hantar ke Meja 7.` / `Buzzer 12 akan berbunyi — sila ambil di kaunter.` / `Sila ambil di kaunter.`) · 6 jumlah

### `loka_points_receipt` — kategori **Utility**
```
Terima kasih {{1}}! 🎉
📅 {{2}} · Pembelian RM{{3}}
{{4}}
🏆 Jumlah points: {{5}} pts (boleh ditukar RM{{6}})
⏳ Luput: {{7}}
— {{8}}
```
1 nama · 2 tarikh · 3 jumlah · 4 baris points (`Points diterima: +12 pts` / `Points ditukar: -100 pts`) · 5 baki points · 6 nilai RM · 7 tarikh luput · 8 nama kedai

Semasa template masih **Pending** kelulusan, penghantaran Cloud akan gagal dan
sistem jatuh balik ke Murpati (jika masih dikonfigurasi). Uji di Admin →
Campaigns → kad **WhatsApp Cloud API**: butang *hello_world* menguji token dan
nombor; butang *OTP contoh* menguji template `loka_otp`.

## 5. Bila boleh matikan Murpati

Selepas kelima-lima template diluluskan dan ujian OTP + order berjaya: buang
`MURPATI_*` dari Vercel (atau set `WHATSAPP_PROVIDER=cloud`). Kempen marketing
perlu template kategori *Marketing* — buat kemudian jika perlu.

## 6. Format parameter: bernombor atau bernama

Masa cipta template, Meta minta pilih format parameter. Kod menyokong kedua-dua:

- **Bernombor** (`{{1}}`, `{{2}}`…) — lalai. Ikut urutan dalam Bahagian 4.
- **Bernama** — set `WHATSAPP_TEMPLATE_PARAMS=named` dan guna nama ini (ikut urutan):
  - `loka_order_received`: `{{nama}} {{order_id}} {{resit}} {{lokasi}} {{item}} {{jumlah}} {{langkah}}`
  - `loka_order_paid`: `{{order_id}} {{resit}} {{jumlah}} {{sasaran}} {{kedai}}`
  - `loka_order_ready`: `{{nama}} {{order_id}} {{resit}} {{kedai}} {{sasaran}} {{jumlah}}`
  - `loka_points_receipt`: `{{nama}} {{tarikh}} {{jumlah}} {{points}} {{baki_points}} {{baki_rm}} {{luput}} {{kedai}}`
  - `loka_otp` (Authentication) sentiasa bernombor — Meta yang tetapkan.

## 7. Nota pinjam WABA Syabab Fresh (2026-09-16)

Buat sementara LokaPOS guna nombor +60 11-5681 6392 (nama paparan **Syabab Fresh**).
Customer akan nampak mesej datang dari "Syabab Fresh", bukan Loka. Template
`loka_*` perlu dibuat dalam WABA yang sama (WhatsApp Manager → Syabab Fresh →
Message templates). Bila Loka ada nombor sendiri, cukup tukar
`WHATSAPP_CLOUD_PHONE_NUMBER_ID` (dan buat semula template dalam WABA baru).

## 8. Matikan notifikasi order (jimat kos)

Set `WHATSAPP_ORDER_NOTIFICATIONS=off` — mesej order diterima / bayaran / siap /
resit mata tidak dihantar langsung (tiada percubaan Cloud atau Murpati), butang
"Notify Sedia" di POS disembunyikan, dan customer ikut status di web app
(`/order/<id>`, bergetar bila Sedia). OTP `loka_otp` kekal berfungsi. Untuk
hidupkan semula, buat 4 template Utility (Bahagian 4) dan set semula ke `on`.
