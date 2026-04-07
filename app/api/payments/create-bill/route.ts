import { NextResponse } from "next/server";
import { requireCustomerApi } from "@/lib/customer-api-auth";
import { resolveOrCreateCustomerForUser } from "@/lib/customer-api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createToyyibBill,
  getToyyibpayConfig,
  getToyyibpayConfigStatus,
} from "@/lib/toyyibpay";
import {
  createBillplzBill,
  getBillplzConfig,
  getBillplzConfigStatus,
} from "@/lib/billplz";
import { createChipPurchase, getChipConfigStatus } from "@/lib/chip";
import { applyCustomerOrderPaidSettlement } from "@/lib/customer-order-payment";

type Provider = "toyyibpay" | "billplz" | "chip";

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

function resolveProvider(bodyProvider: unknown): Provider {
  const fromBody = String(bodyProvider || "").trim().toLowerCase();
  if (fromBody === "chip" || fromBody === "billplz" || fromBody === "toyyibpay") return fromBody as Provider;
  const fromEnv = String(process.env.PAYMENT_PROVIDER || "").trim().toLowerCase();
  if (fromEnv === "chip" || fromEnv === "billplz" || fromEnv === "toyyibpay") return fromEnv as Provider;

  // Auto-detect: prefer CHIP if configured
  const chip = getChipConfigStatus();
  if (chip.configured) return "chip";
  const billplz = getBillplzConfigStatus();
  const toyyib = getToyyibpayConfigStatus();
  if (billplz.configured && !toyyib.configured) return "billplz";
  if (toyyib.configured && !billplz.configured) return "toyyibpay";
  if (billplz.configured && toyyib.configured) return "billplz";
  return "chip";
}

function appendQuery(url: string, entries: Record<string, string>) {
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")
    .trim()
    .replace(/\/+$/, "");
  const parsed = new URL(url, siteUrl);
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

  const provider = resolveProvider(body?.provider);
  const providerStatus =
    provider === "chip" ? getChipConfigStatus() :
    provider === "billplz" ? getBillplzConfigStatus() : getToyyibpayConfigStatus();
  if (!providerStatus.configured) {
    return NextResponse.json(
      {
        error: `${provider} is not configured`,
        provider,
        details: providerStatus,
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
    if (!["fpx", "card", "chip", "qr"].includes(paymentMethod)) {
      return NextResponse.json(
        { error: "create-bill is only allowed for online payment methods" },
        { status: 400 }
      );
    }

    const paymentStatus = String(order.payment_status || "").toLowerCase();
    if (paymentStatus === "paid") {
      return NextResponse.json({
        success: true,
        provider,
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
        provider,
        already_paid: true,
        reason: "No payment needed for zero-value order",
        order_id: order.id,
      });
    }

    const orderNumber = String(order.receipt_number || order.id.slice(0, 8));

    // CHIP Collect
    if (provider === "chip") {
      const purchase = await createChipPurchase({
        amount: total,
        orderId: order.id,
        orderNumber,
        customerName: String(customer.name || order.customer_name || "Customer"),
        customerEmail: customer.email || null,
        customerPhone: customer.phone || null,
      });

      return NextResponse.json({
        success: true,
        provider: "chip",
        order_id: order.id,
        order_number: orderNumber,
        payment: {
          provider: "chip",
          purchase_id: purchase.purchaseId,
          payment_url: purchase.checkoutUrl,
        },
      });
    }

    if (provider === "billplz") {
      const config = getBillplzConfig();
      const returnUrl = appendQuery(config.returnUrlDefault, {
        tab: "orders",
        order_id: order.id,
      });
      const callbackQuery: Record<string, string> = { order_id: order.id };
      if (config.callbackToken) callbackQuery.token = config.callbackToken;
      const callbackUrl = appendQuery(config.callbackUrlDefault, callbackQuery);

      const bill = await createBillplzBill({
        name: String(customer.name || order.customer_name || "Customer"),
        description: `Loka POS order ${orderNumber}`,
        amountRm: total,
        email: customer.email,
        mobile: customer.phone,
        callbackUrl,
        redirectUrl: returnUrl,
        orderId: order.id,
      });

      return NextResponse.json({
        success: true,
        provider: "billplz",
        order_id: order.id,
        order_number: orderNumber,
        payment: {
          provider: "billplz",
          bill_id: bill.billId,
          payment_url: bill.paymentUrl,
        },
      });
    }

    const config = getToyyibpayConfig();
    const returnUrl = appendQuery(config.returnUrlDefault, {
      tab: "orders",
      order_id: order.id,
    });
    const callbackQuery: Record<string, string> = { order_id: order.id };
    if (config.callbackToken) callbackQuery.token = config.callbackToken;
    const callbackUrl = appendQuery(config.callbackUrlDefault, callbackQuery);

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
      provider: "toyyibpay",
      order_id: order.id,
      order_number: orderNumber,
      payment: {
        provider: "toyyibpay",
        bill_code: bill.billCode,
        payment_url: bill.paymentUrl,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create payment bill";
    if (
      provider === "billplz" &&
      /access denied|unauthorized|invalid api key|invalid collection/i.test(message)
    ) {
      return NextResponse.json(
        {
          error:
            "Billplz access denied. Check BILLPLZ_BASE_URL matches your key environment (sandbox vs live), and BILLPLZ_COLLECTION_ID belongs to the same Billplz account.",
          details: message,
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
