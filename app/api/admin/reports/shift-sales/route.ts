import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type OrderRow = {
  id: string;
  total: number | string | null;
  payment_method: string | null;
  created_at: string;
  status: string | null;
};

type OrderItemRow = {
  product_name_snapshot: string | null;
  qty: number | string | null;
  line_total: number | string | null;
};

type PaidOutRow = {
  amount: number | string | null;
};

function toNum(v: number | string | null | undefined) {
  return Number(v || 0);
}

/**
 * Format a UTC ISO string into Malaysia-time hour label (0-23).
 */
function toMYTHour(isoStr: string): number {
  const d = new Date(isoStr);
  // MYT = UTC+8
  return (d.getUTCHours() + 8) % 24;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const shiftId = searchParams.get("shift_id");

  if (!shiftId) {
    return NextResponse.json({ error: "shift_id is required" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    // ── 1. Load shift ─────────────────────────────────────
    const { data: shiftData, error: shiftError } = await supabase
      .from("pos_shifts")
      .select("id, register_id, opened_by, opened_at, closed_at, status, opening_cash, opening_note, counted_cash, expected_cash, over_short, closing_note")
      .eq("id", shiftId)
      .single();

    if (shiftError || !shiftData) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    }

    const openedAt = shiftData.opened_at as string;
    // If shift is still open, use NOW as the end boundary
    const closedAt = (shiftData.closed_at as string | null) ?? new Date().toISOString();

    // ── 2. Resolve staff name ─────────────────────────────
    const listResult = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const allUsers = listResult.data?.users || [];
    const userMap = new Map(
      allUsers.map(u => [
        u.id,
        { name: u.user_metadata?.full_name || u.email || u.id.slice(0, 8), email: u.email || null },
      ])
    );
    const opener = userMap.get(shiftData.opened_by as string);

    // ── 3. Orders within shift time window ────────────────
    const { data: ordersRaw, error: ordersError } = await supabase
      .from("orders")
      .select("id, total, payment_method, created_at, status")
      .in("status", ["completed", "preparing", "ready"])
      .gte("created_at", openedAt)
      .lte("created_at", closedAt)
      .order("created_at", { ascending: true });

    if (ordersError) throw ordersError;

    const orders = (ordersRaw || []) as OrderRow[];
    const orderIds = orders.map(o => o.id);

    // ── 4. Order items for top-products breakdown ─────────
    let orderItems: OrderItemRow[] = [];
    if (orderIds.length > 0) {
      const CHUNK = 100;
      for (let i = 0; i < orderIds.length; i += CHUNK) {
        const chunk = orderIds.slice(i, i + CHUNK);
        const { data: itemsChunk } = await supabase
          .from("order_items")
          .select("product_name_snapshot, qty, line_total")
          .in("order_id", chunk);
        orderItems = orderItems.concat((itemsChunk || []) as OrderItemRow[]);
      }
    }

    // ── 5. Paid outs within this shift ───────────────────
    let paidOutTotal = 0;
    const { data: paidOutRows, error: paidOutError } = await supabase
      .from("paid_outs")
      .select("amount")
      .eq("shift_id", shiftId);

    if (!paidOutError) {
      paidOutTotal = ((paidOutRows || []) as PaidOutRow[]).reduce(
        (sum, row) => sum + toNum(row.amount),
        0
      );
    }

    // ── 6. Aggregate ──────────────────────────────────────
    const totalSales = orders.reduce((sum, o) => sum + toNum(o.total), 0);
    const orderCount = orders.length;
    const avgSpend = orderCount > 0 ? totalSales / orderCount : 0;

    // Hourly breakdown — keyed 0-23
    const hourlyMap: Record<number, { sales: number; orders: number }> = {};
    for (const o of orders) {
      const h = toMYTHour(o.created_at);
      if (!hourlyMap[h]) hourlyMap[h] = { sales: 0, orders: 0 };
      hourlyMap[h].sales += toNum(o.total);
      hourlyMap[h].orders += 1;
    }

    // Fill contiguous range from shift start hour to end hour
    const startHour = toMYTHour(openedAt);
    const endHour = toMYTHour(closedAt);
    // Build array covering the shift span
    const hourlyArray: Array<{ hour: number; label: string; sales: number; orders: number }> = [];
    // Determine range — handle overnight shifts (e.g. 10pm to 2am)
    let h = startHour;
    const maxTicks = 24;
    let ticks = 0;
    while (ticks < maxTicks) {
      const entry = hourlyMap[h] ?? { sales: 0, orders: 0 };
      hourlyArray.push({ hour: h, label: `${String(h).padStart(2, "0")}:00`, sales: entry.sales, orders: entry.orders });
      if (h === endHour && ticks > 0) break;
      h = (h + 1) % 24;
      ticks++;
    }
    // Append current hour if still within shift
    if (hourlyArray.length === 0) {
      hourlyArray.push({ hour: startHour, label: `${String(startHour).padStart(2, "0")}:00`, sales: 0, orders: 0 });
    }

    // Payment mix
    const paymentMix: Record<string, number> = {};
    for (const o of orders) {
      const method = String(o.payment_method || "other").toLowerCase();
      paymentMix[method] = (paymentMix[method] || 0) + toNum(o.total);
    }

    // Top products
    const productMap: Record<string, { qty: number; revenue: number }> = {};
    for (const item of orderItems) {
      const name = item.product_name_snapshot || "Unknown";
      if (!productMap[name]) productMap[name] = { qty: 0, revenue: 0 };
      productMap[name].qty += toNum(item.qty);
      productMap[name].revenue += toNum(item.line_total);
    }
    const topProducts = Object.entries(productMap)
      .map(([name, stats]) => ({ name, qty: stats.qty, revenue: stats.revenue }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    return NextResponse.json({
      shift: {
        id: shiftData.id,
        register_id: shiftData.register_id,
        opened_at: openedAt,
        closed_at: shiftData.closed_at,
        status: shiftData.status,
        opening_cash: toNum(shiftData.opening_cash),
        opening_note: shiftData.opening_note,
        counted_cash: shiftData.counted_cash == null ? null : toNum(shiftData.counted_cash),
        expected_cash: shiftData.expected_cash == null ? null : toNum(shiftData.expected_cash),
        over_short: shiftData.over_short == null ? null : toNum(shiftData.over_short),
        closing_note: shiftData.closing_note,
        opened_by_name: opener?.name ?? "Unknown",
        opened_by_email: opener?.email ?? null,
      },
      summary: {
        total_sales: totalSales,
        order_count: orderCount,
        avg_spend: avgSpend,
        paid_out_total: paidOutTotal,
        net_sales: totalSales - paidOutTotal,
      },
      hourly: hourlyArray,
      payment_mix: paymentMix,
      top_products: topProducts,
    });
  } catch (err) {
    console.error("[shift-sales report]", err);
    const message = err instanceof Error ? err.message : "Failed to load report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
