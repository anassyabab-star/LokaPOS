import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin-api-auth";

const supabase = createSupabaseAdminClient();

function getMYDate(date: Date) {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" });
}

function escapeCsv(val: string) {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function toCsvRow(values: (string | number | null)[]) {
  return values.map(v => escapeCsv(String(v ?? ""))).join(",");
}

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "sales"; // sales | expenses | daily
  const from = searchParams.get("from") || getMYDate(new Date());
  const to = searchParams.get("to") || from;

  try {
    if (type === "sales") {
      const { data: orders } = await supabase
        .from("orders")
        .select("receipt_number, customer_name, total, subtotal, discount_value, payment_method, payment_status, status, order_source, created_at, date_key")
        .gte("date_key", from)
        .lte("date_key", to)
        .order("created_at", { ascending: true });

      const rows = (orders || []).map(o => toCsvRow([
        o.receipt_number, o.date_key, o.customer_name, o.subtotal, o.discount_value, o.total,
        o.payment_method, o.payment_status, o.status, o.order_source,
        new Date(o.created_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })
      ]));

      const header = "Receipt,Date,Customer,Subtotal,Discount,Total,Payment Method,Payment Status,Status,Source,Time";
      const csv = [header, ...rows].join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="sales_${from}_${to}.csv"`,
        },
      });
    }

    if (type === "expenses") {
      const { data: expenses } = await supabase
        .from("expenses")
        .select("expense_date, amount, category, description, vendor_name, payment_method, invoice_number, notes")
        .gte("expense_date", from)
        .lte("expense_date", to)
        .order("expense_date", { ascending: true });

      const rows = (expenses || []).map(e => toCsvRow([
        e.expense_date, e.amount, e.category, e.description, e.vendor_name, e.payment_method, e.invoice_number, e.notes
      ]));

      const header = "Date,Amount,Category,Description,Vendor,Payment Method,Invoice No,Notes";
      const csv = [header, ...rows].join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="expenses_${from}_${to}.csv"`,
        },
      });
    }

    if (type === "daily") {
      // Combined daily summary
      const { data: orders } = await supabase
        .from("orders")
        .select("total, payment_method, status, date_key")
        .gte("date_key", from)
        .lte("date_key", to)
        .in("status", ["completed", "preparing", "ready"]);

      const { data: expenses } = await supabase
        .from("expenses")
        .select("expense_date, amount")
        .gte("expense_date", from)
        .lte("expense_date", to);

      // Group by date
      const dateMap = new Map<string, { sales: number; orders: number; cash: number; nonCash: number; expenses: number }>();

      for (const o of orders || []) {
        const d = o.date_key;
        if (!dateMap.has(d)) dateMap.set(d, { sales: 0, orders: 0, cash: 0, nonCash: 0, expenses: 0 });
        const entry = dateMap.get(d)!;
        const total = Number(o.total || 0);
        entry.sales += total;
        entry.orders += 1;
        if (o.payment_method === "cash") entry.cash += total; else entry.nonCash += total;
      }

      for (const e of expenses || []) {
        const d = e.expense_date;
        if (!dateMap.has(d)) dateMap.set(d, { sales: 0, orders: 0, cash: 0, nonCash: 0, expenses: 0 });
        dateMap.get(d)!.expenses += Number(e.amount || 0);
      }

      const sortedDates = [...dateMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const rows = sortedDates.map(([date, d]) => toCsvRow([
        date, d.orders, d.sales.toFixed(2), d.cash.toFixed(2), d.nonCash.toFixed(2), d.expenses.toFixed(2), (d.sales - d.expenses).toFixed(2)
      ]));

      const header = "Date,Orders,Gross Sales,Cash,Non-Cash,Expenses,Net";
      const csv = [header, ...rows].join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="daily_summary_${from}_${to}.csv"`,
        },
      });
    }

    return NextResponse.json({ error: "Invalid type. Use: sales, expenses, daily" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
