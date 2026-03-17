import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyChipPurchase } from "@/lib/chip";
import { applyCustomerOrderPaidSettlement } from "@/lib/customer-order-payment";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const purchaseId = String(body?.id || body?.purchase_id || "").trim();

    if (!purchaseId) {
      return NextResponse.json({ error: "Missing purchase id" }, { status: 400 });
    }

    // Verify with CHIP API
    const purchase = await verifyChipPurchase(purchaseId);

    if (!purchase.is_paid) {
      return NextResponse.json({ status: "not_paid", chip_status: purchase.status });
    }

    const orderId = purchase.reference;
    if (!orderId) {
      return NextResponse.json({ error: "No order reference in purchase" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Update order payment status
    const { data: order, error: updateError } = await supabase
      .from("orders")
      .update({
        payment_status: "paid",
        status: "preparing",
      })
      .eq("id", orderId)
      .neq("payment_status", "paid")
      .select("id, customer_id, receipt_number, total, discount_value")
      .maybeSingle();

    if (updateError) {
      console.error("CHIP callback update error:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Apply loyalty settlement if order was updated
    if (order) {
      try {
        await applyCustomerOrderPaidSettlement(
          {
            id: String(order.id),
            customer_id: String(order.customer_id || "") || null,
            receipt_number: String(order.receipt_number || "") || null,
            total: Number(order.total || 0),
            discount_value: Number(order.discount_value || 0),
          },
          order.customer_id || "system"
        );
      } catch (e) {
        console.error("CHIP callback settlement error:", e);
      }
    }

    return NextResponse.json({ success: true, order_id: orderId });
  } catch (error) {
    console.error("CHIP callback error:", error);
    const message = error instanceof Error ? error.message : "Callback processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Also handle GET for redirect verification
export async function GET(req: Request) {
  return NextResponse.json({ status: "ok" });
}
