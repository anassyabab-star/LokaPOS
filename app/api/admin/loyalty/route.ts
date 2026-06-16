import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { calculateLoyaltySnapshot, getLoyaltyConfig } from "@/lib/loyalty";

type LedgerRow = {
  customer_id: string;
  entry_type: string;
  points_change: number | null;
  source: string | null;
  created_at: string;
};

function isMissingRelationError(message: string | null | undefined) {
  const m = String(message || "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache");
}

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const rangeDays = Math.min(365, Math.max(1, Number(searchParams.get("range") || 30)));
  const sinceMs = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();

  try {
    const supabase = createSupabaseAdminClient();
    const config = await getLoyaltyConfig();

    // Pull the full ledger (bounded) and aggregate in-process.
    const { data: ledgerData, error: ledgerError } = await supabase
      .from("loyalty_ledger")
      .select("customer_id,entry_type,points_change,source,created_at")
      .order("created_at", { ascending: true })
      .limit(200000);

    if (ledgerError && !isMissingRelationError(ledgerError.message)) {
      return NextResponse.json({ error: ledgerError.message }, { status: 500 });
    }
    const rows = (ledgerData || []) as LedgerRow[];

    // ── Liability: sum of available (non-expired, FIFO) points per customer ──
    const byCustomer = new Map<string, LedgerRow[]>();
    for (const row of rows) {
      if (!row.customer_id) continue;
      const list = byCustomer.get(row.customer_id) || [];
      list.push(row);
      byCustomer.set(row.customer_id, list);
    }
    let liabilityPoints = 0;
    const memberAvailable: Array<{ customer_id: string; points: number }> = [];
    for (const [customerId, custRows] of byCustomer.entries()) {
      const snapshot = calculateLoyaltySnapshot(custRows, config);
      if (snapshot.pointsAvailable > 0) {
        liabilityPoints += snapshot.pointsAvailable;
        memberAvailable.push({ customer_id: customerId, points: snapshot.pointsAvailable });
      }
    }

    // ── Issued vs redeemed within range ──
    let pointsIssued = 0;
    let pointsRedeemed = 0;
    const checkinByDay = new Map<string, number>();
    for (const row of rows) {
      const ts = new Date(row.created_at).getTime();
      const change = Number(row.points_change || 0);
      if (ts >= sinceMs) {
        if (change > 0) pointsIssued += change;
        else if (change < 0 && row.entry_type === "redeem") pointsRedeemed += Math.abs(change);
      }
      if (row.source === "checkin" && ts >= Date.now() - 14 * 24 * 60 * 60 * 1000) {
        const day = new Date(row.created_at).toISOString().slice(0, 10);
        checkinByDay.set(day, (checkinByDay.get(day) || 0) + 1);
      }
    }

    // ── Top members ──
    const topIds = memberAvailable
      .sort((a, b) => b.points - a.points)
      .slice(0, 10);
    const topMembers: Array<{ id: string; name: string; phone: string | null; points: number }> = [];
    if (topIds.length > 0) {
      const { data: custRows } = await supabase
        .from("customers")
        .select("id,name,phone")
        .in("id", topIds.map(t => t.customer_id));
      const nameById = new Map((custRows || []).map(c => [c.id, c]));
      for (const t of topIds) {
        const c = nameById.get(t.customer_id);
        topMembers.push({
          id: t.customer_id,
          name: c?.name || "—",
          phone: c?.phone || null,
          points: t.points,
        });
      }
    }

    // ── Check-in trend (last 14 days, chronological) ──
    const checkinTrend: Array<{ date: string; count: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      checkinTrend.push({ date: day, count: checkinByDay.get(day) || 0 });
    }

    // ── Voucher status counts ──
    const voucherCounts = { issued: 0, redeemed: 0, expired: 0 };
    const { data: voucherRows, error: voucherError } = await supabase
      .from("vouchers")
      .select("status")
      .limit(100000);
    if (!voucherError) {
      for (const v of voucherRows || []) {
        const s = String(v.status || "");
        if (s in voucherCounts) voucherCounts[s as keyof typeof voucherCounts] += 1;
      }
    }

    return NextResponse.json({
      range_days: rangeDays,
      since: sinceIso,
      liability: {
        points: liabilityPoints,
        value_rm: Number((liabilityPoints * config.redeemRmPerPoint).toFixed(2)),
        members: memberAvailable.length,
      },
      points_issued: pointsIssued,
      points_redeemed: pointsRedeemed,
      top_members: topMembers,
      checkin_trend: checkinTrend,
      voucher_counts: voucherCounts,
      config,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load loyalty summary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
