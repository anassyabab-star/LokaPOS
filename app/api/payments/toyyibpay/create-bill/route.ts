import { NextResponse } from "next/server";
import { requireCustomerApi } from "@/lib/customer-api-auth";
import { resolveOrCreateCustomerForUser } from "@/lib/customer-api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createToyyibBill,
  getToyyibpayConfig,
  getToyyibpayConfigStatus,
} from "@/lib/toyyibpay";
import { applyCustomerOrderPaidSettlement } from "@/lib/customer-order-payment";

type OrderRow = {
  id: string;
  customer_id: string | null;
  receipt_number: string | null;
  customer_name: string | null;
  payment_method: string | null;
  payment_status: string | null;
  status: string | null;
  total: number | null;
  discount_value: number | null;
};

function appendQuery(url: string, entries: Record<string, string>) {
  const config = getToyyibpayConfig();
  const baseForRelative = config.returnUrlDefault.startsWith("http")
    ? config.returnUrlDefault
    : "http://localhost:3000";
  const parsed = new URL(url, baseForRelative);
  for (const [key, value] of Object.entries(entries)) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

export async function POST(req: Request) {
  const auth = await requireCustomerApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const orderId = String(body?.order_id || "").trim();
  if (!orderId) {
    return NextResponse.json({ error: "order_id is required" }, { status: 400 });
  }

  const configStatus = getToyyibpayConfigStatus();
  if (!configStatus.configured) {
    return NextResponse.json(
      {
        error: "ToyyibPay is not configured",
        details: configStatus,
      },
      { status: 400 }
    );
  }

  try {
    const customer = await resolveOrCreateCustomerForUser(auth.user, { allowCreate: true });
    if (!customer) {
      return NextResponse.json({ error: "Customer profile not found" }, { status: 404 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select(
        "id,customer_id,receipt_number,customer_name,payment_method,payment_status,status,total,discount_value"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }
    if (!orderData) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = orderData as OrderRow;
    if (order.customer_id !== customer.id) {
      return NextResponse.json({ error: "Order does not belong to current customer" }, { status: 403 });
    }

    const paymentMethod = String(order.payment_method || "").toLowerCase();
    if (paymentMethod !== "fpx") {
      return NextResponse.json(
        { error: "create-bill is only allowed for FPX payment method" },
        { status: 400 }
      );
    }

    const paymentStatus = String(order.payment_status || "").toLowerCase();
    if (paymentStatus === "paid") {
      return NextResponse.json({
        success: true,
        already_paid: true,
        order_id: order.id,
        order_number: order.receipt_number || order.id.slice(0, 8),
      });
    }

    const total = Number(order.total || 0);
    if (total <= 0) {
      const { data: paidOrder, error: paidError } = await supabase
        .from("orders")
        .update({
          payment_status: "paid",
          status: String(order.status || "").toLowerCase() === "pending" ? "preparing" : order.status,
        })
        .eq("id", order.id)
        .neq("payment_status", "paid")
        .select("id,customer_id,receipt_number,total,discount_value")
        .maybeSingle();
      if (paidError) {
        return NextResponse.json({ error: paidError.message }, { status: 500 });
      }
      if (paidOrder) {
        await applyCustomerOrderPaidSettlement(
          {
            id: String(paidOrder.id),
            customer_id: String(paidOrder.customer_id || "") || null,
            receipt_number: String(paidOrder.receipt_number || "") || null,
            total: Number(paidOrder.total || 0),
            discount_value: Number(paidOrder.discount_value || 0),
          },
          auth.user.id
        );
      }
      return NextResponse.json({
        success: true,
        already_paid: true,
        reason: "No payment needed for zero-value order",
        order_id: order.id,
      });
    }

    const config = getToyyibpayConfig();
    const returnUrl = appendQuery(config.returnUrlDefault, {
      tab: "orders",
      order_id: order.id,
    });

    const callbackQuery: Record<string, string> = { order_id: order.id };
    if (config.callbackToken) {
      callbackQuery.token = config.callbackToken;
    }
    const callbackUrl = appendQuery(config.callbackUrlDefault, callbackQuery);

    const orderNumber = String(order.receipt_number || order.id.slice(0, 8));
    const bill = await createToyyibBill({
      billName: `Order ${orderNumber}`,
      billDescription: `Loka POS order ${orderNumber}`,
      amountRm: total,
      billTo: String(customer.name || order.customer_name || "Customer"),
      billEmail: customer.email,
      billPhone: customer.phone,
      billExternalReferenceNo: order.id,
      billReturnUrl: returnUrl,
      billCallbackUrl: callbackUrl,
    });

    return NextResponse.json({
      success: true,
      order_id: order.id,
      order_number: orderNumber,
      payment: {
        provider: "toyyibpay",
        bill_code: bill.billCode,
        payment_url: bill.paymentUrl,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create ToyyibPay bill";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
