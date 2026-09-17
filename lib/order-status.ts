// ============================================================================
// LokaPOS — Order status state machine (SERVER ONLY).
//
// The single writer for `orders.status` transitions, used by:
//   • POST /api/admin/orders/[id]/status   (KDS lanes, POS Orders tab, admin)
//   • POST /api/admin/orders/[id]/ready    (POS "Notify Sedia")
//   • POST /api/pos/orders/[id]/pay        (cashier collects payment)
//   • lib/order-expiry.ts                  (auto-cancel unpaid orders)
//
// Pipeline:  awaiting_payment → pending → preparing → ready → completed
//            cancelled is reachable ONLY through cancelOrder() (void/refund/expiry)
//
// It also keeps the customer-facing journey columns in sync
// (`fulfillment_stage`, `ready_at`, `picked_up_at`, `completed_at`) so the KDS
// "Siap!" tap is what the customer's phone sees — previously the two axes never
// met.
// ============================================================================

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeWhatsAppTo, orderNotificationsEnabled, sendOrderReadyMessage } from "@/lib/whatsapp";
import { reverseOrderLoyalty } from "@/lib/customer-order-payment";
import {
  FORWARD_ORDER,
  normalizeOrderStatus,
  orderTarget,
  shortOrderNumber,
  type OrderStatus,
} from "@/lib/order-flow";

export type TransitionVia = "status" | "ready" | "pay" | "system";
export type ActorRole = "admin" | "cashier" | "system";
export type TransitionActor = { userId: string | null; role: ActorRole };

export type OrderStatusRow = {
  id: string;
  receipt_number: string | null;
  status: string | null;
  payment_status: string | null;
  customer_id: string | null;
  customer_name: string | null;
  total: number | null;
  fulfillment_stage?: string | null;
  ready_at?: string | null;
  picked_up_at?: string | null;
  order_type?: string | null;
  table_number?: string | null;
  buzzer_number?: string | null;
  paid_at?: string | null;
  completed_at?: string | null;
};

export type OrderNotification =
  | { attempted: false; reason: string }
  | { attempted: true; sent: boolean; error: string | null; to: string | null };

export type TransitionError = { ok: false; httpStatus: number; error: string };
export type TransitionSuccess = {
  ok: true;
  status: OrderStatus;
  noop: boolean;
  notification: OrderNotification | null;
  order: OrderStatusRow;
};
export type TransitionResult = TransitionSuccess | TransitionError;

type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
  consent_whatsapp: boolean | null;
};

// ---------------------------------------------------------------------------
// Loading (tolerant of un-migrated databases)
// ---------------------------------------------------------------------------

const BASE_COLS = "id,receipt_number,status,payment_status,customer_id,customer_name,total";
const JOURNEY_COLS = ",fulfillment_stage,ready_at,picked_up_at";
const FLOW_COLS = ",order_type,table_number,buzzer_number,paid_at,completed_at";
const FLOW_KEYS = ["order_type", "table_number", "buzzer_number", "paid_at", "completed_at"];
const JOURNEY_KEYS = ["fulfillment_stage", "ready_at", "picked_up_at", "reviewed_at"];

export function isMissingColumnError(message: string | null | undefined) {
  const m = String(message || "").toLowerCase();
  return (
    (m.includes("column") && m.includes("does not exist")) ||
    m.includes("could not find") ||
    m.includes("schema cache")
  );
}

type LoadedOrder = {
  order: OrderStatusRow | null;
  error: string | null;
  hasJourney: boolean;
  hasFlow: boolean;
};

async function loadOrder(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  orderId: string
): Promise<LoadedOrder> {
  const attempts = [
    { cols: BASE_COLS + JOURNEY_COLS + FLOW_COLS, hasJourney: true, hasFlow: true },
    { cols: BASE_COLS + JOURNEY_COLS, hasJourney: true, hasFlow: false },
    { cols: BASE_COLS, hasJourney: false, hasFlow: false },
  ];
  let lastError: string | null = null;
  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from("orders")
      .select(attempt.cols)
      .eq("id", orderId)
      .maybeSingle();
    if (!error) {
      return {
        order: (data as unknown as OrderStatusRow | null) || null,
        error: null,
        hasJourney: attempt.hasJourney,
        hasFlow: attempt.hasFlow,
      };
    }
    lastError = error.message;
    if (!isMissingColumnError(error.message)) break;
  }
  return { order: null, error: lastError || "Failed to load order", hasJourney: false, hasFlow: false };
}

// ---------------------------------------------------------------------------
// Transition rules (pure)
// ---------------------------------------------------------------------------

export function assertTransition(params: {
  from: OrderStatus;
  to: OrderStatus;
  via: TransitionVia;
  role: ActorRole;
  /** payment_status the row will have AFTER this update. */
  paymentStatusAfter: string;
}): { ok: true; noop: boolean } | TransitionError {
  const { from, to, via, role } = params;
  const paid = params.paymentStatusAfter === "paid";

  if (from === to) return { ok: true, noop: true };

  if (from === "cancelled") {
    return { ok: false, httpStatus: 409, error: "Order telah dibatalkan." };
  }
  if (to === "cancelled") {
    return { ok: false, httpStatus: 400, error: "Guna action void/refund untuk batalkan order." };
  }
  if (to === "awaiting_payment") {
    return { ok: false, httpStatus: 400, error: "Status Belum Bayar tidak boleh ditetapkan secara manual." };
  }

  // Collecting payment may land the order in the kitchen queue (KDS on) or
  // straight at completed (KDS off), from any live status.
  if (via === "pay") {
    if (to === "pending" || to === "completed") return { ok: true, noop: false };
    return { ok: false, httpStatus: 400, error: `Bayaran tidak boleh menetapkan status ${to}.` };
  }

  if (from === "awaiting_payment") {
    return {
      ok: false,
      httpStatus: 409,
      error: "Kutip bayaran dahulu — guna Terima Bayaran di POS.",
    };
  }
  if (to === "completed" && !paid) {
    return { ok: false, httpStatus: 409, error: "Kutip bayaran dahulu sebelum tanda Selesai." };
  }

  const fromIdx = FORWARD_ORDER.indexOf(from);
  const toIdx = FORWARD_ORDER.indexOf(to);

  if (toIdx === fromIdx + 1) return { ok: true, noop: false };

  if (toIdx > fromIdx + 1) {
    // "Notify Sedia" from the POS may skip Preparing.
    if (via === "ready" && from === "pending" && to === "ready") return { ok: true, noop: false };
    return {
      ok: false,
      httpStatus: 409,
      error: `Langkah tidak sah: ${from} → ${to}. Ikut urutan Pending → Preparing → Ready → Completed.`,
    };
  }

  // Backwards
  if (role === "admin") return { ok: true, noop: false };
  return { ok: false, httpStatus: 403, error: "Hanya admin boleh undurkan status order." };
}

// ---------------------------------------------------------------------------
// transitionOrderStatus
// ---------------------------------------------------------------------------

export async function transitionOrderStatus(params: {
  orderId: string;
  to: OrderStatus;
  via: TransitionVia;
  actor: TransitionActor;
  /** Extra columns written in the same UPDATE (e.g. payment fields from /pay). */
  extraUpdate?: Record<string, unknown>;
  /** Send the WhatsApp "ready" notification (default true). */
  notify?: boolean;
}): Promise<TransitionResult> {
  const supabase = createSupabaseAdminClient();
  const orderId = String(params.orderId || "").trim();
  if (!orderId) return { ok: false, httpStatus: 400, error: "Invalid order id" };

  const loaded = await loadOrder(supabase, orderId);
  if (loaded.error) return { ok: false, httpStatus: 500, error: loaded.error };
  if (!loaded.order) return { ok: false, httpStatus: 404, error: "Order not found" };

  const order = loaded.order;
  const from: OrderStatus = normalizeOrderStatus(order.status) || "pending";
  const to = params.to;
  const via = params.via;
  const now = new Date().toISOString();
  const notify = params.notify !== false;

  const extra: Record<string, unknown> = { ...(params.extraUpdate || {}) };
  if (!loaded.hasFlow) {
    for (const key of FLOW_KEYS) {
      if (key in extra) {
        console.warn(`[order-status] dropping ${key}: run migration 20260915_order_flow_pay_at_counter.sql`);
        delete extra[key];
      }
    }
  }
  if (!loaded.hasJourney) {
    for (const key of JOURNEY_KEYS) delete extra[key];
  }

  const stage = String(order.fulfillment_stage || "").toLowerCase();

  // "Notify Sedia" on an order that is already ready/completed (e.g. KDS off):
  // do not touch `status`, just make sure the journey says ready and re-notify.
  if (via === "ready" && to === "ready" && (from === "ready" || from === "completed")) {
    if (loaded.hasJourney && (!stage || stage === "received")) {
      await supabase
        .from("orders")
        .update({ fulfillment_stage: "ready", ready_at: order.ready_at || now })
        .eq("id", orderId);
      order.fulfillment_stage = "ready";
      order.ready_at = order.ready_at || now;
    }
    const notification = notify ? await notifyOrderReady(order) : null;
    return { ok: true, status: from, noop: false, notification, order };
  }

  const paymentStatusAfter = String(
    extra.payment_status ?? order.payment_status ?? ""
  ).toLowerCase();

  const verdict = assertTransition({
    from,
    to,
    via,
    role: params.actor.role,
    paymentStatusAfter,
  });
  if (!verdict.ok) return verdict;

  // Same status and nothing else to write → nothing to do.
  if (verdict.noop && Object.keys(extra).length === 0) {
    return { ok: true, status: from, noop: true, notification: null, order };
  }

  const payload: Record<string, unknown> = { ...extra };
  if (!verdict.noop) payload.status = to;

  if (!verdict.noop && to === "ready" && loaded.hasJourney && (!stage || stage === "received")) {
    payload.fulfillment_stage = "ready";
    payload.ready_at = now;
  }

  if (!verdict.noop && to === "completed") {
    if (loaded.hasFlow) payload.completed_at = now;
    // Staff handed the order over. (A pay→completed with KDS off means the drink
    // is not even made yet — leave the journey alone in that case.)
    if (via !== "pay" && loaded.hasJourney && (!stage || stage === "received" || stage === "ready")) {
      payload.fulfillment_stage = "picked_up";
      payload.picked_up_at = now;
    }
  }

  if (!verdict.noop && from === "completed" && to !== "completed" && loaded.hasFlow) {
    payload.completed_at = null;
  }

  // Optimistic concurrency: only apply if nobody moved the order meanwhile.
  let update = supabase.from("orders").update(payload).eq("id", orderId);
  update = order.status == null ? update.is("status", null) : update.eq("status", order.status);
  const { data: updatedRow, error: updateError } = await update.select("id").maybeSingle();

  if (updateError) return { ok: false, httpStatus: 500, error: updateError.message };
  if (!updatedRow) {
    return { ok: false, httpStatus: 409, error: "Status order telah berubah — sila refresh." };
  }

  const merged: OrderStatusRow = { ...order, ...(payload as Partial<OrderStatusRow>) };
  const finalStatus: OrderStatus = verdict.noop ? from : to;

  let notification: OrderNotification | null = null;
  if (!verdict.noop && to === "ready" && notify) {
    notification = await notifyOrderReady(merged);
  }

  return { ok: true, status: finalStatus, noop: verdict.noop, notification, order: merged };
}

// ---------------------------------------------------------------------------
// WhatsApp "order ready" notification
// ---------------------------------------------------------------------------

function formatMoney(value: number | null | undefined) {
  return `RM ${Number(value || 0).toFixed(2)}`;
}

export function buildReadyMessage(order: OrderStatusRow, customer: { name: string | null }) {
  const template = String(process.env.ORDER_READY_TEMPLATE || "").trim();
  const storeName = String(process.env.STORE_NAME || "Loka").trim() || "Loka";
  const orderNumber = String(order.receipt_number || order.id.slice(0, 8));
  const short = shortOrderNumber(order.receipt_number, order.id);
  const name = String(customer.name || order.customer_name || "Customer").trim() || "Customer";
  const total = formatMoney(order.total);

  const target = orderTarget(order);
  const targetLine =
    target.kind === "table"
      ? `Kami hantar ke ${target.text}.`
      : target.kind === "buzzer"
        ? `${target.text} akan berbunyi — sila ambil di kaunter.`
        : "Sila ambil di kaunter.";

  const defaultMessage =
    `Hi ${name}, order #${short} (${orderNumber}) dari ${storeName} dah siap! ☕\n` +
    `${targetLine}\n` +
    `Total: ${total}\n` +
    "Terima kasih.";

  if (!template) return defaultMessage;

  return template
    .replaceAll("{{name}}", name)
    .replaceAll("{{order_number}}", orderNumber)
    .replaceAll("{{short_number}}", short)
    .replaceAll("{{store_name}}", storeName)
    .replaceAll("{{total}}", total)
    .replaceAll("{{target}}", target.text);
}

/** Reason codes: disabled | no_customer | customer_not_found | no_consent | no_phone */
export async function notifyOrderReady(order: OrderStatusRow): Promise<OrderNotification> {
  if (!orderNotificationsEnabled()) return { attempted: false, reason: "disabled" };
  if (!order.customer_id) return { attempted: false, reason: "no_customer" };

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id,name,phone,consent_whatsapp")
    .eq("id", order.customer_id)
    .maybeSingle();

  if (error) return { attempted: true, sent: false, error: error.message, to: null };
  if (!data) return { attempted: false, reason: "customer_not_found" };

  const customer = data as CustomerRow;
  const to = normalizeWhatsAppTo(String(customer.phone || ""));
  if (!customer.consent_whatsapp) return { attempted: false, reason: "no_consent" };
  if (!to) return { attempted: false, reason: "no_phone" };

  try {
    const storeName = String(process.env.STORE_NAME || "Loka").trim() || "Loka";
    const target = orderTarget(order);
    const targetLine =
      target.kind === "table"
        ? `Kami hantar ke ${target.text}.`
        : target.kind === "buzzer"
          ? `${target.text} akan berbunyi — sila ambil di kaunter.`
          : "Sila ambil di kaunter.";
    const result = await sendOrderReadyMessage({
      to,
      name: String(customer.name || order.customer_name || "Customer").trim() || "Customer",
      shortNo: shortOrderNumber(order.receipt_number, order.id),
      receipt: String(order.receipt_number || order.id.slice(0, 8)),
      storeName,
      targetLine,
      total: Number(order.total || 0).toFixed(2),
      text: buildReadyMessage(order, customer),
    });
    return { attempted: true, sent: Boolean(result?.ok), error: result?.error || null, to };
  } catch (err) {
    return { attempted: true, sent: false, error: err instanceof Error ? err.message : "send_failed", to };
  }
}

// ---------------------------------------------------------------------------
// cancelOrder (void / refund / auto-expiry)
// ---------------------------------------------------------------------------

export type CancelAction = "void" | "refund";
export type ApprovalLevel = "auto" | "manager_pin" | "admin";

type OrderItemRow = { product_id: string | null; qty: number | null };

function isMissingRelationError(message: string | null | undefined) {
  const lower = String(message || "").toLowerCase();
  return lower.includes("relation") && lower.includes("does not exist");
}

export async function writeAdjustmentLog(payload: {
  orderId: string;
  action: CancelAction;
  amount: number;
  reason: string;
  approvedBy: string | null;
  approvedRole: string;
  approvalLevel: ApprovalLevel;
  managerPinUsed: boolean;
}) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("order_adjustments").insert([
    {
      order_id: payload.orderId,
      action: payload.action,
      amount: payload.amount,
      reason: payload.reason,
      approved_by: payload.approvedBy,
      approved_role: payload.approvedRole,
      approval_level: payload.approvalLevel,
      metadata: { manager_pin_used: payload.managerPinUsed },
    },
  ]);
  if (error && !isMissingRelationError(error.message)) throw error;
}

export async function restoreOrderStock(orderId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: itemRows, error: itemError } = await supabase
    .from("order_items")
    .select("product_id,qty")
    .eq("order_id", orderId);

  if (itemError) {
    return { ok: false as const, error: itemError.message || "Failed to read order items" };
  }

  const qtyByProduct = new Map<string, number>();
  for (const row of (itemRows || []) as OrderItemRow[]) {
    const productId = String(row.product_id || "").trim();
    const qty = Number(row.qty || 0);
    if (!productId || qty <= 0) continue;
    qtyByProduct.set(productId, (qtyByProduct.get(productId) || 0) + qty);
  }

  for (const [productId, restoreQty] of qtyByProduct.entries()) {
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("stock")
      .eq("id", productId)
      .maybeSingle();

    if (productError || !product) {
      return { ok: false as const, error: productError?.message || `Product ${productId} not found` };
    }

    const currentStock = Number((product as { stock: number | null }).stock || 0);
    const { error: updateError } = await supabase
      .from("products")
      .update({ stock: currentStock + restoreQty })
      .eq("id", productId);
    if (updateError) {
      return { ok: false as const, error: updateError.message || "Failed to restore stock" };
    }
  }

  return { ok: true as const };
}

export type CancelResult =
  | {
      ok: true;
      alreadyCancelled: boolean;
      status: "cancelled";
      paymentStatus: string | null;
      stockRestoreWarning: string | null;
    }
  | TransitionError;

/**
 * Cancel an order (void = unpaid, refund = paid) and unwind everything it
 * moved: loyalty earn/redeem, missions, coupons, and (void only) stock.
 * Approval decisions are the caller's job; this just executes + logs.
 */
export async function cancelOrder(params: {
  orderId: string;
  action: CancelAction;
  reason: string;
  approvedBy: string | null;
  approvedRole: string;
  approvalLevel: ApprovalLevel;
  managerPinUsed?: boolean;
}): Promise<CancelResult> {
  const supabase = createSupabaseAdminClient();
  const orderId = String(params.orderId || "").trim();

  const { data, error } = await supabase
    .from("orders")
    .select(BASE_COLS)
    .eq("id", orderId)
    .maybeSingle();
  if (error) return { ok: false, httpStatus: 500, error: error.message };
  if (!data) return { ok: false, httpStatus: 404, error: "Order not found" };

  const order = data as unknown as OrderStatusRow;
  const currentPaymentStatus = String(order.payment_status || "").toLowerCase() || null;

  if (String(order.status || "").toLowerCase() === "cancelled") {
    return {
      ok: true,
      alreadyCancelled: true,
      status: "cancelled",
      paymentStatus: currentPaymentStatus,
      stockRestoreWarning: null,
    };
  }

  const payload: Record<string, unknown> = { status: "cancelled" };
  if (params.action === "refund") payload.payment_status = "refunded";

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update(payload)
    .eq("id", orderId)
    .neq("status", "cancelled")
    .select("id")
    .maybeSingle();
  if (updateError) return { ok: false, httpStatus: 500, error: updateError.message };
  if (!updated) {
    return {
      ok: true,
      alreadyCancelled: true,
      status: "cancelled",
      paymentStatus: currentPaymentStatus,
      stockRestoreWarning: null,
    };
  }

  // Reverse loyalty the order moved: claw back earned points + give back any
  // redeemed points (idempotent). Never let a loyalty hiccup fail the cancel.
  try {
    await reverseOrderLoyalty(
      {
        id: order.id,
        customer_id: order.customer_id,
        receipt_number: order.receipt_number,
        total: order.total,
      },
      params.approvedBy
    );
  } catch (reverseErr) {
    console.error("[order-status] loyalty reverse failed:", reverseErr);
  }

  try {
    const { reverseMissionsOnRefund } = await import("@/lib/missions");
    await reverseMissionsOnRefund(order.id, params.approvedBy);
  } catch (missionErr) {
    console.error("[order-status] mission reverse failed:", missionErr);
  }

  try {
    const { reverseCouponsOnRefund } = await import("@/lib/coupons");
    await reverseCouponsOnRefund(order.id);
  } catch (couponErr) {
    console.error("[order-status] coupon reverse failed:", couponErr);
  }

  let stockRestoreWarning: string | null = null;
  if (params.action === "void") {
    const stockRestore = await restoreOrderStock(orderId);
    if (!stockRestore.ok) stockRestoreWarning = stockRestore.error;
  }

  try {
    await writeAdjustmentLog({
      orderId,
      action: params.action,
      amount: Number(order.total || 0),
      reason: params.reason,
      approvedBy: params.approvedBy,
      approvedRole: params.approvedRole,
      approvalLevel: params.approvalLevel,
      managerPinUsed: Boolean(params.managerPinUsed),
    });
  } catch (logErr) {
    console.error("[order-status] adjustment log failed:", logErr);
  }

  return {
    ok: true,
    alreadyCancelled: false,
    status: "cancelled",
    paymentStatus: params.action === "refund" ? "refunded" : currentPaymentStatus,
    stockRestoreWarning,
  };
}
