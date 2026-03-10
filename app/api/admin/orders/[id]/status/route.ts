import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";
import { normalizeWhatsappNumber, sendMurpatiText } from "@/app/api/admin/campaigns/murpati";

type AllowedOrderStatus = "pending" | "preparing" | "ready" | "completed" | "cancelled";

type OrderRow = {
  id: string;
  receipt_number: string | null;
  status: string | null;
  payment_status: string | null;
  customer_id: string | null;
  customer_name: string | null;
  total: number | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
  consent_whatsapp: boolean | null;
};

const ALLOWED_STATUSES: AllowedOrderStatus[] = [
  "pending",
  "preparing",
  "ready",
  "completed",
  "cancelled",
];

function isAllowedStatus(value: string): value is AllowedOrderStatus {
  return ALLOWED_STATUSES.includes(value as AllowedOrderStatus);
}

function formatMoney(value: number | null | undefined) {
  return `RM ${Number(value || 0).toFixed(2)}`;
}

function buildReadyMessage(order: OrderRow, customer: CustomerRow) {
  const template = String(process.env.ORDER_READY_TEMPLATE || "").trim();
  const storeName = String(process.env.STORE_NAME || "Loka POS").trim() || "Loka POS";
  const orderNumber = String(order.receipt_number || order.id.slice(0, 8));
  const customerName = String(customer.name || order.customer_name || "Customer").trim() || "Customer";
  const total = formatMoney(order.total);

  const defaultMessage =
    `Hi ${customerName}, order #${orderNumber} dari ${storeName} dah siap.\n` +
    `Total: ${total}\n` +
    "Terima kasih.";

  if (!template) return defaultMessage;

  return template
    .replaceAll("{{name}}", customerName)
    .replaceAll("{{order_number}}", orderNumber)
    .replaceAll("{{store_name}}", storeName)
    .replaceAll("{{total}}", total);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const orderId = String(id || "").trim();
  if (!orderId) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const nextStatus = String(body?.status || "").trim().toLowerCase();
  if (!isAllowedStatus(nextStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("id,receipt_number,status,payment_status,customer_id,customer_name,total")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }
    if (!orderData) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = orderData as OrderRow;
    const currentStatus = String(order.status || "").toLowerCase();
    if (currentStatus === nextStatus) {
      return NextResponse.json({ success: true, status: nextStatus, notification: null });
    }

    const updatePayload: Record<string, unknown> = {
      status: nextStatus,
    };

    const { error: updateError } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", orderId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    let notification:
      | { attempted: false; reason: string }
      | { attempted: true; sent: boolean; error: string | null; to: string | null }
      | null = null;

    if (nextStatus === "ready") {
      if (!order.customer_id) {
        notification = { attempted: false, reason: "No linked customer" };
      } else {
        const { data: customerData, error: customerError } = await supabase
          .from("customers")
          .select("id,name,phone,consent_whatsapp")
          .eq("id", order.customer_id)
          .maybeSingle();

        if (customerError) {
          notification = { attempted: true, sent: false, error: customerError.message, to: null };
        } else if (!customerData) {
          notification = { attempted: false, reason: "Customer not found" };
        } else {
          const customer = customerData as CustomerRow;
          const normalizedPhone = normalizeWhatsappNumber(String(customer.phone || ""));
          if (!customer.consent_whatsapp || !normalizedPhone) {
            notification = {
              attempted: false,
              reason: !customer.consent_whatsapp
                ? "Customer has not consented to WhatsApp"
                : "Missing valid phone number",
            };
          } else {
            const message = buildReadyMessage(order, customer);
            const result = await sendMurpatiText({
              to: normalizedPhone,
              message,
            });
            notification = {
              attempted: true,
              sent: result.ok,
              error: result.error || null,
              to: normalizedPhone,
            };
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      status: nextStatus,
      notification,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update order status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
