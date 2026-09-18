// Marks paid orders that never left the kitchen queue as completed.
//
//   node scripts/complete-stuck-orders.mjs          # dry run
//   node scripts/complete-stuck-orders.mjs --apply
//
// Why this exists: migration 20260915 set store_settings.kds_enabled = true,
// which made statusOnPaid() return 'pending' instead of 'completed'. Every POS
// sale then landed in the kitchen queue expecting someone to tap through
// Preparing -> Ready -> Completed on /kds. Nobody did: from 16 September not a
// single order reached completed, and 662 paid orders (all fulfillment_stage
// 'received', so the display was never touched) piled up going back to April.
//
// The customers were served — only the record is wrong. completed_at is set
// from paid_at, falling back to created_at, so reporting stays truthful rather
// than stamping everything with today's date.
//
// Only paid, non-cancelled orders are touched, and only ever forwards.

import fs from "fs";

const APPLY = process.argv.includes("--apply");

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) { console.error("Missing Supabase env"); process.exit(1); }
const H = { apikey: K, Authorization: "Bearer " + K, "Content-Type": "application/json" };

async function page(query) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${U}/rest/v1/${query}&order=id&limit=1000&offset=${from}`, { headers: H });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
    const j = await r.json();
    if (!j.length) break;
    out.push(...j);
    if (j.length < 1000) break;
  }
  return out;
}

const stuck = await page(
  "orders?select=id,receipt_number,status,payment_status,paid_at,created_at,total,date_key" +
  "&status=in.(pending,preparing,ready)&payment_status=eq.paid"
);

const byStatus = {};
let value = 0;
for (const o of stuck) { byStatus[o.status] = (byStatus[o.status] || 0) + 1; value += Number(o.total || 0); }

console.log(`stuck paid orders: ${stuck.length}`);
console.log(`  by status: ${JSON.stringify(byStatus)}`);
console.log(`  total value: RM${value.toFixed(2)}`);
if (stuck.length) {
  const dates = stuck.map(o => o.date_key).filter(Boolean).sort();
  console.log(`  oldest: ${dates[0]}   newest: ${dates[dates.length - 1]}`);
  console.log(`  missing paid_at (will use created_at): ${stuck.filter(o => !o.paid_at).length}`);
}

if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); process.exit(0); }

console.log("\napplying…");
let done = 0, failed = 0;
const queue = [...stuck];
await Promise.all(Array.from({ length: 8 }, async () => {
  for (;;) {
    const o = queue.shift();
    if (!o) return;
    const at = o.paid_at || o.created_at;
    const r = await fetch(`${U}/rest/v1/orders?id=eq.${o.id}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({
        status: "completed",
        completed_at: at,
        fulfillment_stage: "picked_up",
        picked_up_at: at,
      }),
    });
    if (r.ok) { if (++done % 200 === 0) console.log(`   ${done}/${stuck.length}`); }
    else { failed++; console.warn(`   failed ${o.receipt_number}: ${r.status} ${(await r.text()).slice(0, 100)}`); }
  }
}));
console.log(`done — ${done} completed, ${failed} failed.`);
