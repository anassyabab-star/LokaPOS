import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { calculateLoyaltySnapshot, getLoyaltyConfig } from "@/lib/loyalty";

type LedgerRow = { customer_id: string; points_change: number | null; created_at: string };

function isMissingRelationError(message: string | null | undefined) {
  const m = String(message || "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache");
}

function isUnique(message: string | null | undefined) {
  const m = String(message || "").toLowerCase();
  return m.includes("duplicate key") || m.includes("unique");
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const config = await getLoyaltyConfig();
  const nowIso = new Date().toISOString();
  const todayMyt = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" });
  const thisYear = todayMyt.slice(0, 4);

  let expiredCustomers = 0;
  let expiredPointsTotal = 0;
  let birthdayAwards = 0;
  let vouchersExpired = 0;

  try {
    // ── 1. Points expiry: FIFO per customer, write a negative 'expiry' adjust
    //       for lots older than expiryDays that remain. Idempotent per day. ──
    const { data: ledgerRows, error: ledgerError } = await supabase
      .from("loyalty_ledger")
      .select("customer_id,points_change,created_at")
      .order("created_at", { ascending: true })
      .limit(100000);

    if (ledgerError && !isMissingRelationError(ledgerError.message)) {
      throw new Error(ledgerError.message);
    }

    const byCustomer = new Map<string, LedgerRow[]>();
    for (const row of (ledgerRows || []) as LedgerRow[]) {
      if (!row.customer_id) continue;
      const list = byCustomer.get(row.customer_id) || [];
      list.push(row);
      byCustomer.set(row.customer_id, list);
    }

    for (const [customerId, rows] of byCustomer.entries()) {
      const snapshot = calculateLoyaltySnapshot(rows, config);
      if (snapshot.expiredPoints <= 0) continue;

      const { error: insertError } = await supabase.from("loyalty_ledger").insert([
        {
          customer_id: customerId,
          entry_type: "adjust",
          points_change: -snapshot.expiredPoints,
          source: "expiry",
          note: `Points expired (>${config.expiryDays}d)`,
          event_key: `expiry:${customerId}:${todayMyt}`,
          created_by: null,
        },
      ]);
      if (insertError) {
        if (isUnique(insertError.message)) continue; // already expired today
        if (isMissingRelationError(insertError.message)) break;
        console.error("[loyalty-expiry] insert error:", insertError.message);
        continue;
      }
      expiredCustomers += 1;
      expiredPointsTotal += snapshot.expiredPoints;
    }

    // ── 2. Voucher expiry ──
    const { data: expiredVouchers, error: voucherError } = await supabase
      .from("vouchers")
      .update({ status: "expired" })
      .eq("status", "issued")
      .lt("expires_at", nowIso)
      .select("id");
    if (voucherError && !isMissingRelationError(voucherError.message)) {
      console.error("[loyalty-expiry] voucher expiry error:", voucherError.message);
    } else {
      vouchersExpired = (expiredVouchers || []).length;
    }

    // ── 3. Birthday bonus (once per year, idempotent via event_key) ──
    if (config.birthdayPoints > 0) {
      const { data: birthdayCustomers, error: birthdayError } = await supabase
        .from("customers")
        .select("id,birth_date")
        .not("birth_date", "is", null)
        .limit(100000);

      if (birthdayError && !isMissingRelationError(birthdayError.message)) {
        console.error("[loyalty-expiry] birthday query error:", birthdayError.message);
      } else {
        const todayMonthDay = todayMyt.slice(5); // MM-DD
        const expiresAt = new Date(Date.now() + config.expiryDays * 24 * 60 * 60 * 1000).toISOString();
        for (const cust of (birthdayCustomers || []) as Array<{ id: string; birth_date: string }>) {
          const bd = String(cust.birth_date || "");
          if (bd.length < 10 || bd.slice(5, 10) !== todayMonthDay) continue;
          const { error: insertError } = await supabase.from("loyalty_ledger").insert([
            {
              customer_id: cust.id,
              entry_type: "earn",
              points_change: config.birthdayPoints,
              source: "birthday",
              note: `Birthday bonus ${thisYear}`,
              event_key: `birthday:${cust.id}:${thisYear}`,
              created_by: null,
              expires_at: expiresAt,
            },
          ]);
          if (!insertError) birthdayAwards += 1;
          else if (!isUnique(insertError.message) && !isMissingRelationError(insertError.message)) {
            console.error("[loyalty-expiry] birthday insert error:", insertError.message);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      expired_customers: expiredCustomers,
      expired_points: expiredPointsTotal,
      vouchers_expired: vouchersExpired,
      birthday_awards: birthdayAwards,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[loyalty-expiry] fatal:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
