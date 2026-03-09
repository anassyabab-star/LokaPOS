import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ProductJoin = { name?: string | null } | Array<{ name?: string | null }> | null;
type OrderItemJoinRow = {
  qty: number | string | null;
  products: ProductJoin;
};

function getMYDate(date: Date) {
  return date.toLocaleDateString("sv-SE", {
    timeZone: "Asia/Kuala_Lumpur",
  });
}

export async function GET(req: NextRequest) {
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

    // =========================
    // ORDERS
    // =========================
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id,total,payment_method,date_key,created_at")
      .eq("status", "completed")
      .gte("date_key", start)
      .lte("date_key", end);

    if (ordersError) throw ordersError;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getMYDate(yesterday);

    const { data: yesterdayOrders, error: yesterdayError } = await supabase
      .from("orders")
      .select("total")
      .eq("status", "completed")
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
      .eq("orders.status", "completed")
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

    return NextResponse.json({
      orders: orders || [],
      topProducts,
      yesterdaySales,
      bestHour,
      bestHourSales,
      paymentMix,
      lowStock: lowStockRows || [],
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
      },
      { status: 500 }
    );
  }
}
