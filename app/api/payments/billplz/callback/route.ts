import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { applyCustomerOrderPaidSettlement } from "@/lib/customer-order-payment";
import {
  getBillplzConfig,
  isBillplzFailed,
  isBillplzPaid,
  verifyBillplzXSignature,
} from "@/lib/billplz";

type OrderRow = {
  id: string;
  customer_id: string | null;
  receipt_number: string | null;
  total: number | null;
  discount_value: number | null;
  status: string | null;
  payment_status: string | null;
};

function asFlatStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw == null) continue;
    if (Array.isArray(raw)) {
      output[key] = String(raw[0] ?? "").trim();
    } else if (typeof raw === "object") {
      output[key] = JSON.stringify(raw);
    } else {
      output[key] = String(raw).trim();
    }
  }
  return output;
}

async function parseRequestPayload(req: Request) {
  const url = new URL(req.url);
  const query = Object.fromEntries(url.searchParams.entries());

  if (req.method !== "POST") {
    return asFlatStringRecord(query);
  }

  const contentType = String(req.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const body: Record<string, string> = {};
    if (form) {
      for (const [key, raw] of form.entries()) {
        body[key] = String(raw || "").trim();
      }
    }
    return {
      ...asFlatStringRecord(query),
      ...body,
    };
  }

  const json = await req.json().catch(() => ({}));
  return {
    ...asFlatStringRecord(query),
    ...asFlatStringRecord(json),
  };
}

function pickOrderId(payload: Record<string, string>) {
  return String(
    payload.order_id ||
      payload.orderId ||
      payload.reference_1 ||
      payload.reference1 ||
      payload["billplz[reference_1]"] ||
      payload.billExternalReferenceNo ||
      payload.bill_external_reference_no ||
      ""
  ).trim();
}

async function handleCallback(req: Request) {
  try {
    const payload = await parseRequestPayload(req);
    const config = getBillplzConfig();

    if (config.callbackToken) {
      const providedToken = String(payload.token || "").trim();
      if (!providedToken || providedToken !== config.callbackToken) {
        return NextResponse.json({ error: "Invalid callback token" }, { status: 401 });
      }
    }

    if (config.enforceXSignature && config.xSignatureKey) {
      const signatureCheck = verifyBillplzXSignature(payload);
      if (!signatureCheck.skipped && !signatureCheck.verified) {
        return NextResponse.json({ error: "Invalid Billplz x_signature" }, { status: 401 });
      }
    }

    const orderId = pickOrderId(payload);
    if (!orderId) {
      return NextResponse.json({ error: "Missing order reference in callback" }, { status: 400 });
    }

    const isPaid = isBillplzPaid(payload);
    const isFailed = isBillplzFailed(payload);
    const nextPaymentStatus = isPaid ? "paid" : isFailed ? "failed" : "pending";

    const supabase = createSupabaseAdminClient();
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("id,customer_id,receipt_number,total,discount_value,status,payment_status")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }
    if (!orderData) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = orderData as OrderRow;
    const currentPaymentStatus = String(order.payment_status || "").toLowerCase();
    const currentStatus = String(order.status || "").toLowerCase();

    if (currentPaymentStatus === "paid") {
      return NextResponse.json({
        success: true,
        order_id: order.id,
        payment_status: "paid",
        order_status: currentStatus || null,
        already_processed: true,
      });
    }

    const nextOrderStatus =
      nextPaymentStatus === "paid"
        ? currentStatus === "pending"
          ? "preparing"
          : currentStatus || "preparing"
        : currentStatus || "pending";

    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        payment_status: nextPaymentStatus,
        status: nextOrderStatus,
      })
      .eq("id", order.id)
      .neq("payment_status", "paid")
      .select("id,customer_id,receipt_number,total,discount_value")
      .maybeSingle();
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (nextPaymentStatus === "paid" && updatedOrder) {
      await applyCustomerOrderPaidSettlement(
        {
          id: String(updatedOrder.id),
          customer_id: String(updatedOrder.customer_id || "") || null,
          receipt_number: String(updatedOrder.receipt_number || "") || null,
          total: Number(updatedOrder.total || 0),
          discount_value: Number(updatedOrder.discount_value || 0),
        },
        null
      );
    }

    return NextResponse.json({
      success: true,
      order_id: order.id,
      payment_status: nextPaymentStatus,
      order_status: nextOrderStatus,
      bill_id: payload.id || payload.bill_id || payload.billId || payload["billplz[id]"] || null,
      transaction_id:
        payload.transaction_id || payload.transactionId || payload["billplz[transaction_id]"] || null,
      paid: payload.paid || payload["billplz[paid]"] || null,
      paid_amount: payload.paid_amount || payload.paidAmount || payload["billplz[paid_amount]"] || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process Billplz callback";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return handleCallback(req);
}

export async function GET(req: Request) {
  return handleCallback(req);
}
