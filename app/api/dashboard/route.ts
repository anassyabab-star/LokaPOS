import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff-api-auth";

const supabase = createSupabaseAdminClient();

type ProductJoin = { name?: string | null } | Array<{ name?: string | null }> | null;
type OrderItemJoinRow = {
  qty: number | string | null;
  products: ProductJoin;
};

type NumericRow = {
  total?: number | string | null;
  amount?: number | string | null;
};

function getMYDate(date: Date) {
  return date.toLocaleDateString("sv-SE", {
    timeZone: "Asia/Kuala_Lumpur",
  });
}

function isMissingRelationError(message: string | null | undefined) {
  const m = String(message || "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache");
}

function myDayStartToUtcIso(dateStr: string) {
  return new Date(`${dateStr}T00:00:00+08:00`).toISOString();
}

/** "YYYY-MM-01" for the month `back` months before the one containing dateStr. */
function monthStartBack(dateStr: string, back: number) {
  const [y, m] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, (m - 1) - back, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Sums `total` over a date_key range, paging past PostgREST's 1,000-row cap.
 * Six months of this cafe is several thousand orders, so a single select would
 * silently truncate and under-report every month.
 */
async function sumOrdersByMonth(fromDateKey: string, toDateKey: string) {
  const byMonth = new Map<string, { sales: number; orders: number }>();
  const PAGE = 1000;
  for (let page = 0; page < 40; page++) {
    const { data, error } = await supabase
      .from("orders")
      .select("date_key,total")
      .in("status", ["pending", "preparing", "ready", "completed"])
      .eq("payment_status", "paid")
      .gte("date_key", fromDateKey)
      .lte("date_key", toDateKey)
      .order("date_key", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    const rows = (data || []) as Array<{ date_key: string | null; total: number | string | null }>;
    for (const r of rows) {
      const key = String(r.date_key || "").slice(0, 7);
      if (!key) continue;
      const b = byMonth.get(key) || { sales: 0, orders: 0 };
      b.sales += Number(r.total || 0);
      b.orders += 1;
      byMonth.set(key, b);
    }
    if (rows.length < PAGE) break;
  }
  return byMonth;
}

function plusDays(dateStr: string, days: number) {
  const date = new Date(`${dateStr}T00:00:00+08:00`);
  date.setDate(date.getDate() + days);
  return getMYDate(date);
}

export async function GET(req: NextRequest) {
  // BUG-11 FIX: Require staff auth for dashboard data
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "today";

    const now = new Date();
    const todayStr = getMYDate(now);

    let start = todayStr;
    let end = todayStr;

    if (range === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      start = getMYDate(y);
      end = start;
    }

    if (range === "7days") {
      const past = new Date(now);
      past.setDate(past.getDate() - 6);
      start = getMYDate(past);
      end = todayStr;
    }

    if (range === "month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      start = getMYDate(first);
      end = todayStr;
    }

    const monthStart = `${todayStr.slice(0, 7)}-01`;
    const monthEndExclusive = plusDays(todayStr, 1);

    // =========================
    // ORDERS
    // =========================
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id,total,payment_method,date_key,created_at")
      .in("status", ["pending", "preparing", "ready", "completed"]).eq("payment_status", "paid")
      .gte("date_key", start)
      .lte("date_key", end);

    if (ordersError) throw ordersError;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getMYDate(yesterday);

    const { data: yesterdayOrders, error: yesterdayError } = await supabase
      .from("orders")
      .select("total")
      .in("status", ["pending", "preparing", "ready", "completed"]).eq("payment_status", "paid")
      .eq("date_key", yesterdayStr);

    if (yesterdayError) throw yesterdayError;

    // =========================
    // TOP PRODUCTS (JOIN VERSION)
    // =========================
    const { data: items, error: itemsError } = await supabase
      .from("order_items")
      .select(`
        qty,
        orders!inner(date_key,status),
        products!inner(name)
      `)
      .in("orders.status", ["pending", "preparing", "ready", "completed"]).eq("orders.payment_status", "paid")
      .gte("orders.date_key", start)
      .lte("orders.date_key", end);

    if (itemsError) throw itemsError;

    const productMap: Record<string, number> = {};

    (items as OrderItemJoinRow[] | null)?.forEach((item) => {
      const productValue = Array.isArray(item.products)
        ? item.products[0]
        : item.products;
      const name = productValue?.name || "Unknown";
      productMap[name] =
        (productMap[name] || 0) + Number(item.qty);
    });

    const topProducts = Object.entries(productMap)
      .map(([product_name, total_qty]) => ({
        product_name,
        total_qty,
      }))
      .sort((a, b) => b.total_qty - a.total_qty)
      .slice(0, 5);

    const paymentMix = (orders || []).reduce(
      (acc, order) => {
        const method = String(order.payment_method || "other").toLowerCase();
        acc[method] = (acc[method] || 0) + Number(order.total || 0);
        return acc;
      },
      {} as Record<string, number>
    );

    const hourMap: Record<string, number> = {};
    (orders || []).forEach(order => {
      if (!order.created_at) return;
      const hour = new Date(order.created_at).toLocaleString("en-GB", {
        timeZone: "Asia/Kuala_Lumpur",
        hour: "2-digit",
        hour12: false,
      });
      hourMap[hour] = (hourMap[hour] || 0) + Number(order.total || 0);
    });

    let bestHour: string | null = null;
    let bestHourSales = 0;
    Object.entries(hourMap).forEach(([hour, total]) => {
      if (total > bestHourSales) {
        bestHour = hour;
        bestHourSales = total;
      }
    });

    const yesterdaySales = (yesterdayOrders || []).reduce(
      (sum, row) => sum + Number(row.total || 0),
      0
    );

    const { data: lowStockRows, error: lowStockError } = await supabase
      .from("products")
      .select("id,name,stock")
      .eq("is_active", true)
      .lte("stock", 10)
      .order("stock", { ascending: true })
      .limit(5);

    if (lowStockError) throw lowStockError;

    // =========================
    // MONTHLY P/L SNAPSHOT
    // =========================
    const { data: monthSalesRows, error: monthSalesError } = await supabase
      .from("orders")
      .select("total")
      .in("status", ["pending", "preparing", "ready", "completed"]).eq("payment_status", "paid")
      .gte("date_key", monthStart)
      .lte("date_key", todayStr);

    if (monthSalesError) throw monthSalesError;

    const monthSales = ((monthSalesRows || []) as NumericRow[]).reduce(
      (sum, row) => sum + Number(row.total || 0),
      0
    );

    let monthExpenses = 0;
    const { data: monthExpenseRows, error: monthExpenseError } = await supabase
      .from("expenses")
      .select("amount")
      .gte("expense_date", monthStart)
      .lte("expense_date", todayStr);

    if (!monthExpenseError) {
      monthExpenses = ((monthExpenseRows || []) as NumericRow[]).reduce(
        (sum, row) => sum + Number(row.amount || 0),
        0
      );
    } else if (!isMissingRelationError(monthExpenseError.message)) {
      throw monthExpenseError;
    }

    let monthPaidOut = 0;
    const { data: monthPaidOutRows, error: monthPaidOutError } = await supabase
      .from("paid_outs")
      .select("amount")
      .gte("created_at", myDayStartToUtcIso(monthStart))
      .lt("created_at", myDayStartToUtcIso(monthEndExclusive));

    if (!monthPaidOutError) {
      monthPaidOut = ((monthPaidOutRows || []) as NumericRow[]).reduce(
        (sum, row) => sum + Number(row.amount || 0),
        0
      );
    } else if (!isMissingRelationError(monthPaidOutError.message)) {
      throw monthPaidOutError;
    }

    const monthOutflow = monthExpenses + monthPaidOut;
    const monthProfitLoss = monthSales - monthOutflow;

    // =========================
    // LAST 6 MONTHS
    // =========================
    // Independent of the range selector — the owner wants the shape of the
    // year so far, not of today.
    const trendFrom = monthStartBack(todayStr, 5);
    const salesByMonth = await sumOrdersByMonth(trendFrom, todayStr);

    const expensesByMonth = new Map<string, number>();
    const { data: trendExpenseRows, error: trendExpenseError } = await supabase
      .from("expenses")
      .select("expense_date,amount")
      .gte("expense_date", trendFrom)
      .lte("expense_date", todayStr)
      .limit(10000);
    if (!trendExpenseError) {
      for (const r of (trendExpenseRows || []) as Array<{ expense_date: string | null; amount: number | string | null }>) {
        const key = String(r.expense_date || "").slice(0, 7);
        if (!key) continue;
        expensesByMonth.set(key, (expensesByMonth.get(key) || 0) + Number(r.amount || 0));
      }
    } else if (!isMissingRelationError(trendExpenseError.message)) {
      throw trendExpenseError;
    }

    const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const salesTrend6m = Array.from({ length: 6 }, (_, i) => {
      const monthKey = monthStartBack(todayStr, 5 - i).slice(0, 7);
      const bucket = salesByMonth.get(monthKey) || { sales: 0, orders: 0 };
      const expenses = expensesByMonth.get(monthKey) || 0;
      const monthIndex = Number(monthKey.slice(5, 7)) - 1;
      return {
        month: monthKey,
        label: MONTH_LABELS[monthIndex] || monthKey,
        sales: Math.round(bucket.sales * 100) / 100,
        orders: bucket.orders,
        expenses: Math.round(expenses * 100) / 100,
        profit_loss: Math.round((bucket.sales - expenses) * 100) / 100,
        partial: monthKey === todayStr.slice(0, 7),
      };
    });

    return NextResponse.json({
      orders: orders || [],
      topProducts,
      yesterdaySales,
      bestHour,
      bestHourSales,
      paymentMix,
      lowStock: lowStockRows || [],
      monthlyPL: {
        month: monthStart.slice(0, 7),
        sales: monthSales,
        expenses: monthExpenses,
        paid_out: monthPaidOut,
        outflow: monthOutflow,
        profit_loss: monthProfitLoss,
      },
      salesTrend6m,
    });

  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      {
        orders: [],
        topProducts: [],
        yesterdaySales: 0,
        bestHour: null,
        bestHourSales: 0,
        paymentMix: {},
        lowStock: [],
        monthlyPL: {
          month: "",
          sales: 0,
          expenses: 0,
          paid_out: 0,
          outflow: 0,
          profit_loss: 0,
        },
        salesTrend6m: [],
      },
      { status: 500 }
    );
  }
}
