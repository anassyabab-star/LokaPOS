import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("order_id");
  const phone = searchParams.get("phone");

  if (!orderId && !phone) {
    return NextResponse.json({ error: "order_id or phone required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  // Track single order by ID
  if (orderId) {
    const { data: order, error } = await supabase
      .from("orders")
      .select("id, receipt_number, customer_name, status, payment_status, total, created_at")
      .eq("id", orderId)
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ order });
  }

  // Track recent orders by phone (last 24h)
  if (phone) {
    const normalized = phone.replace(/[^\d+]/g, "").trim();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Find customer by phone
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", normalized)
      .maybeSingle();

    if (!customer) {
      return NextResponse.json({ orders: [], loyalty_points: 0 });
    }

    const [{ data: orders }, { data: ledgerRows }] = await Promise.all([
      supabase
        .from("orders")
        .select("id, receipt_number, customer_name, status, payment_status, total, created_at")
        .eq("customer_id", customer.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("loyalty_ledger")
        .select("points_change")
        .eq("customer_id", customer.id)
        .gte("created_at", new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const loyaltyPoints = (ledgerRows || []).reduce(
      (sum: number, row: { points_change: number | null }) => sum + Number(row.points_change || 0),
      0
    );

    return NextResponse.json({ orders: orders || [], loyalty_points: Math.max(0, loyaltyPoints) });
  }

  return NextResponse.json({ orders: [] });
}
