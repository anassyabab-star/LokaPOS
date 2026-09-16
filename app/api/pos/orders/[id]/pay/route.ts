import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";
import { statusOnPaid } from "@/lib/kds";
import { isMissingColumnError, transitionOrderStatus } from "@/lib/order-status";
import { applyCustomerOrderPaidSettlement } from "@/lib/customer-order-payment";
import {
  normalizeOrderType,
  orderTarget,
  sanitizeTargetLabel,
  shortOrderNumber,
} from "@/lib/order-flow";
import { normalizeWhatsAppTo, sendOrderPaidMessage } from "@/lib/whatsapp";

// ============================================================================
// POST /api/pos/orders/[id]/pay — cashier collects payment for an order the
// customer placed on their phone ("Bayar di kaunter").
//
//   body: { payment_method: "cash"|"qr"|"card", cash_received?: number,
//           order_type?: "dine_in"|"take_away", table_number?, buzzer_number?,
//           register_id?: string }
//
// Atomically: payment_status=paid, payment_method, tender/change, paid_at,
// table/buzzer, and status = statusOnPaid() (pending → KDS BARU lane, or
// completed when the KDS flow is off). Then loyalty settlement + WhatsApp.
// Double-tap safe: an already-paid order returns 200 { already_paid: true }.
// ============================================================================

const PAYMENT_METHODS = ["cash", "qr", "card"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const FULL_COLS =
  "id, receipt_number, status, payment_status, payment_method, cash_received, balance, total, subtotal, " +
  "discount_value, customer_id, customer_name, created_at, order_type, table_number, buzzer_number, paid_at, order_source";
const BASE_COLS =
  "id, receipt_number, status, payment_status, payment_method, cash_received, balance, total, subtotal, " +
  "discount_value, customer_id, customer_name, created_at";

type OrderRow = {
  id: string;
  receipt_number: string | null;
  status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  cash_received: number | null;
  balance: number | null;
  total: number | null;
  subtotal: number | null;
  discount_value: number | null;
  customer_id: string | null;
  customer_name: string | null;
  created_at: string;
  order_type?: string | null;
  table_number?: string | null;
  buzzer_number?: string | null;
  paid_at?: string | null;
  order_source?: string | null;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function loadOrder(supabase: ReturnType<typeof createSupabaseAdminClient>, orderId: string) {
  let { data, error } = await supabase.from("orders").select(FULL_COLS).eq("id", orderId).maybeSingle();
  if (error && isMissingColumnError(error.message)) {
    ({ data, error } = await supabase.from("orders").select(BASE_COLS).eq("id", orderId).maybeSingle());
  }
  return { order: (data as unknown as OrderRow | null) || null, error };
}

function shapeOrder(order: OrderRow) {
  return {
    id: order.id,
    receipt_number: order.receipt_number,
    short_number: shortOrderNumber(order.receipt_number, order.id),
    status: order.status,
    payment_status: order.payment_status,
    payment_method: order.payment_method,
    cash_received: Number(order.cash_received || 0),
    balance: Number(order.balance || 0),
    total: Number(order.total || 0),
    subtotal: Number(order.subtotal || 0),
    discount_value: Number(order.discount_value || 0),
    customer_id: order.customer_id,
    customer_name: order.customer_name,
    created_at: order.created_at,
    paid_at: order.paid_at ?? null,
    order_type: order.order_type ?? null,
    table_number: order.table_number ?? null,
    buzzer_number: order.buzzer_number ?? null,
    order_source: order.order_source ?? null,
  };
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const orderId = String(id || "").trim();
  if (!orderId) return NextResponse.json({ error: "Invalid order id" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const paymentMethod = String(body.payment_method || "").trim().toLowerCase() as PaymentMethod;
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    return NextResponse.json({ error: "Kaedah bayaran tidak sah (cash / qr / card)." }, { status: 400 });
  }

  const table = sanitizeTargetLabel(body.table_number);
  const buzzer = sanitizeTargetLabel(body.buzzer_number);
  const orderType = normalizeOrderType(body.order_type) || (table ? "dine_in" : "take_away");
  if (orderType === "dine_in" && !table && !buzzer) {
    return NextResponse.json(
      { error: "Masukkan nombor meja (atau buzzer) untuk order Dine In." },
      { status: 400 }
    );
  }
  const tableNumber = orderType === "dine_in" ? table : null;
  const buzzerNumber = buzzer;

  const registerId = String(body.register_id || "main");

  try {
    const supabase = createSupabaseAdminClient();

    const { data: openShift, error: shiftError } = await supabase
      .from("pos_shifts")
      .select("id")
      .eq("register_id", registerId)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    if (shiftError) return NextResponse.json({ error: shiftError.message }, { status: 500 });
    if (!openShift) {
      return NextResponse.json({ error: "Tiada shift aktif. Sila buka shift dahulu." }, { status: 409 });
    }

    const { order, error: loadError } = await loadOrder(supabase, orderId);
    if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const currentStatus = String(order.status || "").toLowerCase();
    const currentPaymentStatus = String(order.payment_status || "").toLowerCase();

    if (currentStatus === "cancelled") {
      return NextResponse.json({ error: "Order telah dibatalkan." }, { status: 409 });
    }
    if (currentPaymentStatus === "paid") {
      return NextResponse.json({ success: true, already_paid: true, order: shapeOrder(order) });
    }
    if (currentPaymentStatus === "refunded") {
      return NextResponse.json({ error: "Order telah direfund." }, { status: 409 });
    }

    const total = round2(Number(order.total || 0));
    let cashReceived = 0;
    let balance = 0;
    if (paymentMethod === "cash") {
      cashReceived = round2(Number(body.cash_received ?? total));
      if (!Number.isFinite(cashReceived) || cashReceived + 0.005 < total) {
        return NextResponse.json({ error: "Jumlah tunai kurang daripada total." }, { status: 400 });
      }
      balance = round2(cashReceived - total);
    }

    const to = (await statusOnPaid("awaiting_payment")) as "pending" | "completed";
    const now = new Date().toISOString();

    const result = await transitionOrderStatus({
      orderId,
      to,
      via: "pay",
      actor: { userId: auth.user.id, role: auth.role },
      extraUpdate: {
        payment_status: "paid",
        payment_method: paymentMethod,
        cash_received: cashReceived,
        balance,
        paid_at: now,
        order_type: orderType,
        table_number: tableNumber,
        buzzer_number: buzzerNumber,
      },
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.httpStatus });
    }

    // Loyalty earn / stats / referral / missions / coupons (idempotent per order).
    if (order.customer_id) {
      try {
        await applyCustomerOrderPaidSettlement(
          {
            id: order.id,
            customer_id: order.customer_id,
            receipt_number: order.receipt_number,
            total,
            discount_value: Number(order.discount_value || 0),
          },
          auth.user.id
        );
      } catch (settleErr) {
        console.error("[pos/pay] settlement failed:", settleErr);
      }
    }

    // WhatsApp "payment received" — fire-and-forget, consent-gated.
    if (order.customer_id) {
      void (async () => {
        try {
          const { data: customer } = await supabase
            .from("customers")
            .select("name, phone, consent_whatsapp")
            .eq("id", order.customer_id as string)
            .maybeSingle();
          const waPhone = customer?.phone ? normalizeWhatsAppTo(String(customer.phone)) : null;
          if (!customer?.consent_whatsapp || !waPhone) return;
          const short = shortOrderNumber(order.receipt_number, order.id);
          const target = orderTarget({ order_type: orderType, table_number: tableNumber, buzzer_number: buzzerNumber });
          const targetLine =
            target.kind === "table"
              ? `Pesanan akan dihantar ke ${target.text}.`
              : target.kind === "buzzer"
                ? `${target.text} akan berbunyi bila pesanan siap.`
                : "Kami maklumkan bila pesanan siap.";
          const storeName = String(process.env.STORE_NAME || "Loka").trim() || "Loka";
          const receipt = order.receipt_number || order.id.slice(0, 8);
          const message =
            `✅ Bayaran diterima untuk order #${short} (${receipt}).\n` +
            `Jumlah: RM${total.toFixed(2)}\n` +
            `${targetLine}\n` +
            `Terima kasih — ${storeName} ☕`;
          await sendOrderPaidMessage({
            to: waPhone,
            shortNo: short,
            receipt,
            total: total.toFixed(2),
            targetLine,
            storeName,
            text: message,
          });
        } catch {
          /* best-effort */
        }
      })();
    }

    const { order: fresh } = await loadOrder(supabase, orderId);
    return NextResponse.json({ success: true, order: shapeOrder(fresh || { ...order, ...result.order }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to collect payment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
