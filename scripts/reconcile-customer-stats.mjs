// Recomputes customers.total_orders / total_spend from the orders table.
//
//   node scripts/reconcile-customer-stats.mjs          # dry run
//   node scripts/reconcile-customer-stats.mjs --apply
//
// Why: these two columns are a denormalised tally, incremented once per paid
// order by applyCustomerOrderPaidSettlement. An older code path incremented
// them a second time (see the comment at app/api/orders/route.ts:215, "handled
// exclusively by … to avoid double-count"), and cancelling an order did not
// always reverse them. The result is ~3,400 customers whose displayed spend is
// inflated — roughly doubled for most — by about RM60,000 in total.
//
// Loyalty is NOT affected: points come from loyalty_ledger (exactly one earn
// row per paid order, verified) and membership tier recomputes from orders via
// getRolling12mSpend. These two columns are display only — the dashboard
// customer list and the POS member lookup.
//
// Definition used, matching the settlement code: orders with
// payment_status='paid' and status <> 'cancelled'.
// last_order_at is deliberately left alone.

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

async function page(table, query) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${U}/rest/v1/${table}?${query}&order=id&limit=1000&offset=${from}`, { headers: H });
    if (!r.ok) throw new Error(`${r.status} ${table} :: ${(await r.text()).slice(0, 160)}`);
    const j = await r.json();
    if (!j.length) break;
    out.push(...j);
    if (j.length < 1000) break;
  }
  return out;
}

const customers = await page("customers", "select=id,name,phone,total_orders,total_spend");
const orders = await page("orders", "select=customer_id,total,status,payment_status&customer_id=not.is.null&payment_status=eq.paid");

const actual = new Map();
for (const o of orders) {
  if (o.status === "cancelled") continue;
  const a = actual.get(o.customer_id) || { n: 0, sum: 0 };
  a.n += 1;
  a.sum += Number(o.total || 0);
  actual.set(o.customer_id, a);
}

const round2 = v => Math.round(v * 100) / 100;
const changes = [];
for (const c of customers) {
  const a = actual.get(c.id) || { n: 0, sum: 0 };
  const n = a.n, sum = round2(a.sum);
  if (Number(c.total_orders || 0) === n && Math.abs(Number(c.total_spend || 0) - sum) < 0.01) continue;
  changes.push({ id: c.id, name: c.name, phone: c.phone, fromN: Number(c.total_orders || 0), fromRM: Number(c.total_spend || 0), toN: n, toRM: sum });
}

const dOrders = changes.reduce((s, c) => s + (c.fromN - c.toN), 0);
const dSpend = changes.reduce((s, c) => s + (c.fromRM - c.toRM), 0);
console.log(`customers: ${customers.length} | already correct: ${customers.length - changes.length} | to change: ${changes.length}`);
console.log(`removing ${dOrders} phantom orders and RM${dSpend.toFixed(2)} of phantom spend`);
console.log(`under-stated rows (would gain): ${changes.filter(c => c.toN > c.fromN || c.toRM > c.fromRM).length}`);
console.log("\nlargest 10 corrections:");
for (const c of [...changes].sort((a, b) => (b.fromRM - b.toRM) - (a.fromRM - a.toRM)).slice(0, 10)) {
  console.log(`   ${String(c.name).padEnd(18)} ${String(c.phone || "-").padEnd(13)} ${c.fromN}/RM${c.fromRM}  ->  ${c.toN}/RM${c.toRM}`);
}

if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); process.exit(0); }

console.log("\napplying…");
let done = 0;
const QUEUE = [...changes];
const workers = Array.from({ length: 8 }, async () => {
  for (;;) {
    const c = QUEUE.shift();
    if (!c) return;
    const r = await fetch(`${U}/rest/v1/customers?id=eq.${c.id}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ total_orders: c.toN, total_spend: c.toRM }),
    });
    if (!r.ok) throw new Error(`${r.status} ${c.id} :: ${(await r.text()).slice(0, 160)}`);
    if (++done % 500 === 0) console.log(`   ${done}/${changes.length}`);
  }
});
await Promise.all(workers);
console.log(`done — ${done} customers reconciled.`);
