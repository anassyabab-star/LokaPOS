import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";
import { normalizeWhatsappNumber, sendMurpatiText } from "@/app/api/admin/campaigns/murpati";

type AllowedOrderStatus = "pending" | "preparing" | "ready" | "completed" | "cancelled";
type OrderAction = "void" | "refund";
type ApprovalLevel = "auto" | "manager_pin" | "admin";

type OrderRow = {
  id: string;
  receipt_number: string | null;
  status: string | null;
  payment_status: string | null;
  customer_id: string | null;
  customer_name: string | null;
  total: number | null;
};

type OrderItemRow = {
  product_id: string | null;
  qty: number | null;
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
const ALLOWED_ACTIONS: OrderAction[] = ["void", "refund"];

const ORDER_VOID_AUTO_MAX_RM = Number(process.env.ORDER_VOID_AUTO_MAX_RM || 80);
const ORDER_REFUND_AUTO_MAX_RM = Number(process.env.ORDER_REFUND_AUTO_MAX_RM || 20);
const ORDER_REFUND_MANAGER_MAX_RM = Number(process.env.ORDER_REFUND_MANAGER_MAX_RM || 150);
const MANAGER_OVERRIDE_PIN = String(process.env.MANAGER_OVERRIDE_PIN || "").trim();

function isAllowedStatus(value: string): value is AllowedOrderStatus {
  return ALLOWED_STATUSES.includes(value as AllowedOrderStatus);
}

function isAllowedAction(value: string): value is OrderAction {
  return ALLOWED_ACTIONS.includes(value as OrderAction);
}

function formatMoney(value: number | null | undefined) {
  return `RM ${Number(value || 0).toFixed(2)}`;
}

function isMissingRelationError(message: string | null | undefined) {
  const lower = String(message || "").toLowerCase();
  return lower.includes("relation") && lower.includes("does not exist");
}

function normalizePaymentStatus(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function resolveApprovalLevel(params: {
  action: OrderAction;
  amount: number;
  userRole: "admin" | "cashier";
  managerPin: string;
}) {
  const amount = Number(params.amount || 0);

  if (params.action === "void") {
    if (amount <= ORDER_VOID_AUTO_MAX_RM) {
      return { ok: true as const, level: "auto" as ApprovalLevel };
    }
    if (params.userRole === "admin") {
      return { ok: true as const, level: "admin" as ApprovalLevel };
    }
    if (!MANAGER_OVERRIDE_PIN) {
      return {
        ok: false as const,
        error: `Void above RM ${ORDER_VOID_AUTO_MAX_RM.toFixed(2)} requires admin (manager PIN not configured).`,
      };
    }
    if (params.managerPin && params.managerPin === MANAGER_OVERRIDE_PIN) {
      return { ok: true as const, level: "manager_pin" as ApprovalLevel };
    }
    return {
      ok: false as const,
      error: `Void above RM ${ORDER_VOID_AUTO_MAX_RM.toFixed(2)} requires manager PIN or admin.`,
    };
  }

  if (amount <= ORDER_REFUND_AUTO_MAX_RM) {
    return { ok: true as const, level: "auto" as ApprovalLevel };
  }
  if (params.userRole === "admin") {
    return { ok: true as const, level: "admin" as ApprovalLevel };
  }
  if (!MANAGER_OVERRIDE_PIN) {
    return {
      ok: false as const,
      error: `Refund above RM ${ORDER_REFUND_AUTO_MAX_RM.toFixed(2)} requires admin (manager PIN not configured).`,
    };
  }
  if (amount > ORDER_REFUND_MANAGER_MAX_RM) {
    return {
      ok: false as const,
      error: `Refund above RM ${ORDER_REFUND_MANAGER_MAX_RM.toFixed(2)} requires admin.`,
    };
  }
  if (params.managerPin && params.managerPin === MANAGER_OVERRIDE_PIN) {
    return { ok: true as const, level: "manager_pin" as ApprovalLevel };
  }
  return {
    ok: false as const,
    error: `Refund above RM ${ORDER_REFUND_AUTO_MAX_RM.toFixed(2)} requires manager PIN or admin.`,
  };
}

async function writeAdjustmentLog(payload: {
  orderId: string;
  action: OrderAction;
  amount: number;
  reason: string;
  approvedBy: string;
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
      metadata: {
        manager_pin_used: payload.managerPinUsed,
      },
    },
  ]);
  if (error && !isMissingRelationError(error.message)) {
    throw error;
  }
}

async function restoreOrderStock(orderId: string) {
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
      return {
        ok: false as const,
        error: productError?.message || `Product ${productId} not found`,
      };
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
  const action = String(body?.action || "").trim().toLowerCase();
  const reason = String(body?.reason || "").trim();
  const managerPin = String(body?.manager_pin || "").trim();

  const wantsStatusChange = Boolean(nextStatus);
  const wantsAction = Boolean(action);

  if (!wantsStatusChange && !wantsAction) {
    return NextResponse.json({ error: "Missing status or action" }, { status: 400 });
  }

  if (wantsStatusChange && !isAllowedStatus(nextStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (wantsAction && !isAllowedAction(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (wantsAction && reason.length < 3) {
    return NextResponse.json(
      { error: "Reason is required (at least 3 characters)." },
      { status: 400 }
    );
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
    const currentPaymentStatus = normalizePaymentStatus(order.payment_status);

    let notification:
      | { attempted: false; reason: string }
      | { attempted: true; sent: boolean; error: string | null; to: string | null }
      | null = null;

    if (wantsAction && isAllowedAction(action)) {
      if (action === "void") {
        if (currentStatus === "cancelled") {
          return NextResponse.json({
            success: true,
            action,
            status: currentStatus,
            payment_status: currentPaymentStatus || null,
            already_processed: true,
          });
        }
        if (currentPaymentStatus === "paid" || currentPaymentStatus === "refunded") {
          return NextResponse.json(
            { error: "Paid order cannot be voided. Use refund." },
            { status: 409 }
          );
        }
      }

      if (action === "refund") {
        if (currentPaymentStatus === "refunded") {
          return NextResponse.json({
            success: true,
            action,
            status: currentStatus,
            payment_status: currentPaymentStatus,
            already_processed: true,
          });
        }
        if (currentPaymentStatus !== "paid") {
          return NextResponse.json(
            { error: "Only paid orders can be refunded." },
            { status: 409 }
          );
        }
      }

      const amount = Number(order.total || 0);
      const approval = resolveApprovalLevel({
        action,
        amount,
        userRole: auth.role,
        managerPin,
      });
      if (!approval.ok) {
        return NextResponse.json({ error: approval.error }, { status: 403 });
      }

      const updatePayload: Record<string, unknown> = {
        status: "cancelled",
      };
      if (action === "refund") {
        updatePayload.payment_status = "refunded";
      }

      const { error: updateError } = await supabase
        .from("orders")
        .update(updatePayload)
        .eq("id", orderId);
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      let stockRestoreWarning: string | null = null;
      if (action === "void") {
        const stockRestore = await restoreOrderStock(orderId);
        if (!stockRestore.ok) {
          stockRestoreWarning = stockRestore.error;
        }
      }

      await writeAdjustmentLog({
        orderId,
        action,
        amount,
        reason,
        approvedBy: auth.user.id,
        approvedRole: auth.role,
        approvalLevel: approval.level,
        managerPinUsed: Boolean(managerPin && MANAGER_OVERRIDE_PIN && managerPin === MANAGER_OVERRIDE_PIN),
      });

      return NextResponse.json({
        success: true,
        action,
        status: "cancelled",
        payment_status: action === "refund" ? "refunded" : currentPaymentStatus || null,
        approval_level: approval.level,
        stock_restore_warning: stockRestoreWarning,
      });
    }

    if (wantsStatusChange && isAllowedStatus(nextStatus)) {
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
    }

    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update order status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
