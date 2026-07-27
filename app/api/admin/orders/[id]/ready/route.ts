import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";
import { normalizeWhatsappNumber, sendMurpatiText } from "@/app/api/admin/campaigns/murpati";

// POST — staff mark an order "ready" and notify the customer on WhatsApp.
// This works regardless of KDS state (with KDS off, paid orders skip the normal
// pending→ready path, so this is how the ready-notification gets sent).
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const orderId = String(id || "").trim();
  if (!orderId) return NextResponse.json({ error: "Invalid order id" }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, receipt_number, customer_name, customer_id, total")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  await supabase
    .from("orders")
    .update({ fulfillment_stage: "ready", ready_at: new Date().toISOString() })
    .eq("id", orderId);

  // WhatsApp notify (best-effort; only when the customer consented + has a phone).
  let notified = false;
  let reason: string | null = null;
  if (order.customer_id) {
    const { data: customer } = await supabase
      .from("customers")
      .select("name, phone, consent_whatsapp")
      .eq("id", order.customer_id)
      .maybeSingle();
    const waPhone = customer?.phone ? normalizeWhatsappNumber(customer.phone) : null;
    if (customer && customer.consent_whatsapp && waPhone) {
      const storeName = String(process.env.STORE_NAME || "Loka").trim() || "Loka";
      const template = String(process.env.ORDER_READY_TEMPLATE || "").trim();
      const orderNumber = String(order.receipt_number || order.id.slice(0, 8));
      const name = String(customer.name || order.customer_name || "Customer").trim() || "Customer";
      const message = template
        ? template
            .replaceAll("{{name}}", name)
            .replaceAll("{{order_number}}", orderNumber)
            .replaceAll("{{store_name}}", storeName)
            .replaceAll("{{total}}", `RM${Number(order.total || 0).toFixed(2)}`)
        : `Hi ${name}, order #${orderNumber} dari ${storeName} dah siap. Terima kasih! ☕`;
      try {
        const result = await sendMurpatiText({ to: waPhone, message });
        notified = Boolean(result?.ok ?? true);
      } catch {
        reason = "send_failed";
      }
    } else {
      reason = !customer?.consent_whatsapp ? "no_consent" : "no_phone";
    }
  } else {
    reason = "no_customer";
  }

  return NextResponse.json({ success: true, notified, reason });
}
