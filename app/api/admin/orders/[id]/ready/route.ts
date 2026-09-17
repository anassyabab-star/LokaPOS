import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff-api-auth";
import { transitionOrderStatus } from "@/lib/order-status";

// POST — staff mark an order "ready" and notify the customer on WhatsApp.
//
// Goes through the shared state machine, so `status`, `fulfillment_stage` and
// `ready_at` all move together. Works regardless of the KDS toggle: on an
// order that is already ready/completed (KDS off) it only (re)sends the
// notification and makes sure the customer's journey shows "ready".
//
// Response: { success, notified, reason, status }
//   reason ∈ no_customer | customer_not_found | no_consent | no_phone | <send error> | null
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const orderId = String(id || "").trim();
  if (!orderId) return NextResponse.json({ error: "Invalid order id" }, { status: 400 });

  const result = await transitionOrderStatus({
    orderId,
    to: "ready",
    via: "ready",
    actor: { userId: auth.user.id, role: auth.role },
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus });
  }

  const n = result.notification;
  const notified = Boolean(n && n.attempted && n.sent);
  const reason = !n
    ? null
    : n.attempted
      ? n.sent
        ? null
        : n.error || "send_failed"
      : n.reason;

  return NextResponse.json({ success: true, notified, reason, status: result.status });
}
