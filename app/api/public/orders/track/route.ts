import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("order_id");
  const rawPhone = searchParams.get("phone");
  const phone = rawPhone ? rawPhone.replace(/[^\d+]/g, "").trim() : null;

  if (!orderId && !phone) {
    return NextResponse.json({ error: "order_id or phone required" }, { status: 400 });
  }

  // Validate phone format (8–15 digits)
  if (phone && (phone.replace(/[^\d]/g, "").length < 8 || phone.replace(/[^\d]/g, "").length > 15)) {
    return NextResponse.json({ error: "No telefon tidak sah" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  // Track single order by ID — require phone to prove ownership
  if (orderId) {
    if (!phone) {
      return NextResponse.json({ error: "phone required to track order" }, { status: 400 });
    }

    const normalized = phone.replace(/[^\d+]/g, "").trim();
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", normalized)
      .maybeSingle();

    if (!customer) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, receipt_number, customer_name, status, payment_status, total, created_at")
      .eq("id", orderId)
      .eq("customer_id", customer.id)
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ order });
  }

  // Track recent orders by phone (last 30 days) — loyalty points require customer auth
  if (phone) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();

    if (!customer) {
      return NextResponse.json({ orders: [], loyalty_points: 0, expiring_points_30d: 0 });
    }

    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: orders }, { data: ledgerRows }, { data: expiringRows }] = await Promise.all([
      supabase
        .from("orders")
        .select("id, receipt_number, customer_name, status, payment_status, total, created_at")
        .eq("customer_id", customer.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("loyalty_ledger")
        .select("points_change")
        .eq("customer_id", customer.id)
        .gte("created_at", oneYearAgo),
      supabase
        .from("loyalty_ledger")
        .select("points_change, expires_at")
        .eq("customer_id", customer.id)
        .gt("points_change", 0)
        .lte("expires_at", thirtyDaysFromNow)
        .gte("expires_at", new Date().toISOString()),
    ]);

    const loyaltyPoints = (ledgerRows || []).reduce(
      (sum: number, row: { points_change: number | null }) => sum + Number(row.points_change || 0),
      0
    );

    const expiringPoints30d = (expiringRows || []).reduce(
      (sum: number, row: { points_change: number | null }) => sum + Number(row.points_change || 0),
      0
    );

    return NextResponse.json({
      orders: orders || [],
      loyalty_points: Math.max(0, loyaltyPoints),
      expiring_points_30d: Math.max(0, expiringPoints30d),
    });
  }

  return NextResponse.json({ orders: [] });
}
