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
      .in("status", ["completed", "preparing", "ready"])
      .gte("date_key", start)
      .lte("date_key", end);

    if (ordersError) throw ordersError;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getMYDate(yesterday);

    const { data: yesterdayOrders, error: yesterdayError } = await supabase
      .from("orders")
      .select("total")
      .in("status", ["completed", "preparing", "ready"])
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
      .in("orders.status", ["completed", "preparing", "ready"])
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
      .in("status", ["completed", "preparing", "ready"])
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
      },
      { status: 500 }
    );
  }
}
