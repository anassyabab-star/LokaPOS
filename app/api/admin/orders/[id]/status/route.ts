import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";
import {
  cancelOrder,
  transitionOrderStatus,
  type ApprovalLevel,
  type CancelAction,
} from "@/lib/order-status";
import { STAFF_SETTABLE_STATUSES, normalizeOrderStatus } from "@/lib/order-flow";

// ============================================================================
// POST /api/admin/orders/[id]/status
//
//   { status: "pending"|"preparing"|"ready"|"completed" }
//       → one step forward along the pipeline (admin may step back).
//         awaiting_payment orders are refused (409): collect payment via
//         POST /api/pos/orders/[id]/pay instead.
//   { action: "void"|"refund", reason, manager_pin? }
//       → cancel with tiered approval, unwinding loyalty / missions / coupons /
//         stock through lib/order-status.cancelOrder().
//
// Transition rules live in lib/order-status.ts (assertTransition).
// ============================================================================

type OrderRow = {
  id: string;
  receipt_number: string | null;
  status: string | null;
  payment_status: string | null;
  customer_id: string | null;
  customer_name: string | null;
  total: number | null;
};

const ALLOWED_ACTIONS: CancelAction[] = ["void", "refund"];

const ORDER_VOID_AUTO_MAX_RM = Number(process.env.ORDER_VOID_AUTO_MAX_RM || 80);
const ORDER_REFUND_AUTO_MAX_RM = Number(process.env.ORDER_REFUND_AUTO_MAX_RM || 20);
const ORDER_REFUND_MANAGER_MAX_RM = Number(process.env.ORDER_REFUND_MANAGER_MAX_RM || 150);
const MANAGER_OVERRIDE_PIN = String(process.env.MANAGER_OVERRIDE_PIN || "").trim();

function isAllowedAction(value: string): value is CancelAction {
  return ALLOWED_ACTIONS.includes(value as CancelAction);
}

function normalizePaymentStatus(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function resolveApprovalLevel(params: {
  action: CancelAction;
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
  const nextStatusRaw = String(body?.status || "").trim().toLowerCase();
  const action = String(body?.action || "").trim().toLowerCase();
  const reason = String(body?.reason || "").trim();
  const managerPin = String(body?.manager_pin || "").trim();

  const wantsStatusChange = Boolean(nextStatusRaw);
  const wantsAction = Boolean(action);

  if (!wantsStatusChange && !wantsAction) {
    return NextResponse.json({ error: "Missing status or action" }, { status: 400 });
  }

  const nextStatus = wantsStatusChange ? normalizeOrderStatus(nextStatusRaw) : null;
  if (wantsStatusChange) {
    if (!nextStatus) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (nextStatus === "cancelled") {
      return NextResponse.json(
        { error: "Guna action void/refund untuk batalkan order." },
        { status: 400 }
      );
    }
    if (!STAFF_SETTABLE_STATUSES.includes(nextStatus)) {
      return NextResponse.json(
        { error: "Status Belum Bayar tidak boleh ditetapkan secara manual." },
        { status: 400 }
      );
    }
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
    if (wantsAction && isAllowedAction(action)) {
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

      const result = await cancelOrder({
        orderId,
        action,
        reason,
        approvedBy: auth.user.id,
        approvedRole: auth.role,
        approvalLevel: approval.level,
        managerPinUsed: Boolean(managerPin && MANAGER_OVERRIDE_PIN && managerPin === MANAGER_OVERRIDE_PIN),
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.httpStatus });
      }

      return NextResponse.json({
        success: true,
        action,
        status: "cancelled",
        payment_status: result.paymentStatus,
        approval_level: approval.level,
        stock_restore_warning: result.stockRestoreWarning,
        already_processed: result.alreadyCancelled,
      });
    }

    if (wantsStatusChange && nextStatus) {
      const result = await transitionOrderStatus({
        orderId,
        to: nextStatus,
        via: "status",
        actor: { userId: auth.user.id, role: auth.role },
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.httpStatus });
      }
      return NextResponse.json({
        success: true,
        status: result.status,
        notification: result.notification,
      });
    }

    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update order status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
