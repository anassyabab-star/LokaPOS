import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// POST { order_id, phone } — customer confirms they've collected the order.
// Phone proves ownership (matches the order's customer).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const orderId = String(body?.order_id || "").trim();
  const phone = String(body?.phone || "").replace(/[^\d+]/g, "");
  if (!orderId || !phone) {
    return NextResponse.json({ error: "order_id & phone diperlukan" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (!customer?.id) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const { data: order } = await supabase
    .from("orders")
    .select("id, customer_id, fulfillment_stage")
    .eq("id", orderId)
    .eq("customer_id", customer.id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // Idempotent: only advance if not already picked up / reviewed.
  if (order.fulfillment_stage !== "picked_up" && order.fulfillment_stage !== "reviewed") {
    await supabase
      .from("orders")
      .update({ fulfillment_stage: "picked_up", picked_up_at: new Date().toISOString() })
      .eq("id", orderId);
  }

  return NextResponse.json({ success: true, fulfillment_stage: "picked_up" });
}
