// Normalises customers.phone to the canonical "0XXXXXXXXX" and merges rows that
// are the same person written two ways. See lib/phone.ts for why.
//
//   node scripts/normalize-customer-phones.mjs          # dry run, writes nothing
//   node scripts/normalize-customer-phones.mjs --apply  # performs the changes
//
// Merge rule: only when exactly one row in the group has an auth account (or
// none does). A group where two different auth users claim the same number is
// reported and left alone — merging would silently break one person's login.

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

const national = p => { let d = String(p || "").replace(/[^\d]/g, ""); if (d.startsWith("60")) d = d.slice(2); else if (d.startsWith("0")) d = d.slice(1); return d; };
const canonical = p => { const d = national(p); return d ? "0" + d : ""; };

const rest = async (path, init) => {
  const r = await fetch(U + "/rest/v1/" + path, { ...init, headers: { ...H, ...(init?.headers || {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${path} :: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
};

async function allCustomers() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const page = await rest(`customers?select=id,name,phone,email,user_id,total_orders,total_spend,last_order_at,created_at&order=id&limit=1000&offset=${from}`);
    if (!page.length) break;
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

const plan = { reformat: [], merges: [], skipped: [] };
const customers = (await allCustomers()).filter(c => String(c.phone || "").trim());

const groups = new Map();
for (const c of customers) {
  const key = national(c.phone);
  if (!key) continue;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(c);
}

for (const [key, rows] of groups) {
  const target = "0" + key;
  if (rows.length === 1) {
    if (rows[0].phone !== target) plan.reformat.push({ id: rows[0].id, from: rows[0].phone, to: target, name: rows[0].name });
    continue;
  }
  const withAuth = rows.filter(r => r.user_id);
  if (withAuth.length > 1) {
    plan.skipped.push({ phone: target, rows: rows.map(r => ({ id: r.id, phone: r.phone, name: r.name, orders: r.total_orders, user_id: r.user_id })) });
    continue;
  }
  // Keep the auth-linked row if there is one, else the one with most history.
  const keep = withAuth[0] || [...rows].sort((a, b) =>
    (b.total_orders || 0) - (a.total_orders || 0) || Number(b.total_spend || 0) - Number(a.total_spend || 0)
  )[0];
  plan.merges.push({ phone: target, keep, absorb: rows.filter(r => r.id !== keep.id) });
}

console.log(`customers with a phone: ${customers.length}`);
console.log(`\n1. reformat only (${plan.reformat.length})`);
for (const r of plan.reformat) console.log(`   ${r.from}  ->  ${r.to}   (${r.name})`);
console.log(`\n2. merge duplicates (${plan.merges.length})`);
for (const m of plan.merges) {
  console.log(`   ${m.phone}`);
  console.log(`      keep   ${m.keep.id}  ${String(m.keep.phone).padEnd(13)} ${m.keep.name} — ${m.keep.total_orders || 0} orders, RM${m.keep.total_spend || 0}`);
  for (const a of m.absorb) console.log(`      absorb ${a.id}  ${String(a.phone).padEnd(13)} ${a.name} — ${a.total_orders || 0} orders, RM${a.total_spend || 0}`);
}
console.log(`\n3. skipped, needs a human (${plan.skipped.length})`);
for (const s of plan.skipped) {
  console.log(`   ${s.phone} — two different accounts claim this number:`);
  for (const r of s.rows) console.log(`      ${r.id}  ${String(r.phone).padEnd(13)} ${r.name} — ${r.orders || 0} orders, auth ${r.user_id}`);
}

if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply to perform it."); process.exit(0); }

console.log("\napplying…");
for (const m of plan.merges) {
  for (const a of m.absorb) {
    // Move every child row onto the kept customer before deleting.
    for (const table of ["orders", "loyalty_ledger", "vouchers", "mission_progress", "order_adjustments"]) {
      try { await rest(`${table}?customer_id=eq.${a.id}`, { method: "PATCH", body: JSON.stringify({ customer_id: m.keep.id }) }); }
      catch (e) { if (!/does not exist|schema cache|column/i.test(String(e))) throw e; }
    }
  }
  // Delete the absorbed rows BEFORE writing the canonical phone onto the kept
  // one. customers.phone carries a unique constraint (customers_phone_uq), and
  // when an absorbed row is the one already holding the canonical value,
  // setting it on the kept row first fails with 23505 and leaves the merge
  // half applied — children moved, rows not collapsed.
  for (const a of m.absorb) await rest(`customers?id=eq.${a.id}`, { method: "DELETE" });

  // Re-read: moving the orders may have fired triggers that already
  // recalculated the kept row's counters, so summing the values we captured
  // before the move would double-count.
  const [fresh] = await rest(`customers?select=total_orders,total_spend,last_order_at&id=eq.${m.keep.id}`);
  const lastOrder = [fresh?.last_order_at, ...m.absorb.map(r => r.last_order_at)].filter(Boolean).sort().pop() || null;
  await rest(`customers?id=eq.${m.keep.id}`, {
    method: "PATCH",
    body: JSON.stringify({ phone: m.phone, last_order_at: lastOrder }),
  });
  console.log(`   merged ${m.phone}: ${m.absorb.length} row(s) absorbed, now ${fresh?.total_orders ?? "?"} orders, RM${fresh?.total_spend ?? "?"}`);
}
for (const r of plan.reformat) {
  await rest(`customers?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ phone: r.to }) });
  console.log(`   reformatted ${r.from} -> ${r.to}`);
}
console.log("done.");
