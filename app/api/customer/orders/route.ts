import { NextResponse } from "next/server";
import { requireCustomerApi } from "@/lib/customer-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  customerApiError,
  resolveOrCreateCustomerForUser,
} from "@/lib/customer-api";
import {
  calculateCustomerOrderItems,
  calculateRedeem,
  formatSugarLevel,
  generateOrderNumber,
  getLoyaltyPoints1y,
  insertOrderItemAddonsWithFallback,
  LOYALTY_REDEEM_MIN_POINTS,
} from "@/lib/customer-orders";
import { applyCustomerOrderPaidSettlement } from "@/lib/customer-order-payment";

type OrderListRow = {
  id: string;
  receipt_number: string | null;
  created_at: string;
  status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  subtotal: number | null;
  discount_value: number | null;
  total: number | null;
};

type OrderItemCountRow = {
  order_id: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMissingColumnError(message: string | null | undefined, column: string) {
  const m = String(message || "").toLowerCase();
  const col = column.toLowerCase();
  return (
    (m.includes("could not find") && m.includes(col)) ||
    (m.includes("column") && m.includes(col) && m.includes("does not exist"))
  );
}

function asValidPaymentMethod(value: unknown) {
  const method = String(value || "fpx").trim().toLowerCase();
  if (!method) return "fpx";
  return method;
}

function isPaymentPaid(paymentMethod: string) {
  return paymentMethod === "cash" || paymentMethod === "card" || paymentMethod === "qr";
}

export async function GET(req: Request) {
  const auth = await requireCustomerApi();
  if (!auth.ok) return auth.response;

  try {
    const customer = await resolveOrCreateCustomerForUser(auth.user, {
      allowCreate: true,
    });
    if (!customer) {
      return customerApiError(404, "Customer profile not found", "NOT_FOUND");
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 20)));
    const offset = Math.max(0, Number(searchParams.get("offset") || 0));

    const supabase = createSupabaseAdminClient();
    const { data, error, count } = await supabase
      .from("orders")
      .select(
        "id,receipt_number,created_at,status,payment_status,payment_method,subtotal,discount_value,total",
        { count: "exact" }
      )
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return customerApiError(500, error.message, "INTERNAL_ERROR");
    }

    const rows = (data || []) as OrderListRow[];
    const orderIds = rows.map(row => row.id);
    const itemCountMap = new Map<string, number>();

    if (orderIds.length > 0) {
      const { data: itemRows, error: itemError } = await supabase
        .from("order_items")
        .select("order_id")
        .in("order_id", orderIds);
      if (itemError) {
        return customerApiError(500, itemError.message, "INTERNAL_ERROR");
      }
      for (const row of (itemRows || []) as OrderItemCountRow[]) {
        itemCountMap.set(row.order_id, (itemCountMap.get(row.order_id) || 0) + 1);
      }
    }

    return NextResponse.json({
      orders: rows.map(row => ({
        id: row.id,
        order_number: row.receipt_number || row.id.slice(0, 8),
        created_at: row.created_at,
        status: row.status,
        payment_status: row.payment_status,
        payment_method: row.payment_method,
        subtotal: Number(row.subtotal || 0),
        discount: Number(row.discount_value || 0),
        total: Number(row.total || 0),
        item_count: itemCountMap.get(row.id) || 0,
      })),
      paging: {
        limit,
        offset,
        total: Number(count || 0),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load customer orders";
    return customerApiError(500, message, "INTERNAL_ERROR");
  }
}

export async function POST(req: Request) {
  const auth = await requireCustomerApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!isPlainObject(body)) {
    return customerApiError(400, "Invalid request body", "VALIDATION_ERROR");
  }

  try {
    const customer = await resolveOrCreateCustomerForUser(auth.user, {
      allowCreate: true,
    });
    if (!customer) {
      return customerApiError(404, "Customer profile not found", "NOT_FOUND");
    }

    const requestItems = Array.isArray(body.items) ? body.items : null;
    if (!requestItems || requestItems.length === 0) {
      return customerApiError(400, "At least one item is required", "VALIDATION_ERROR");
    }

    const parsedItems = requestItems.map(raw => ({
      product_id: String((raw as Record<string, unknown>).product_id || "").trim(),
      variant_id: String((raw as Record<string, unknown>).variant_id || "").trim() || null,
      addon_ids: Array.isArray((raw as Record<string, unknown>).addon_ids)
        ? ((raw as Record<string, unknown>).addon_ids as unknown[]).map(v => String(v || "").trim())
        : [],
      sugar_level: String((raw as Record<string, unknown>).sugar_level || "").trim() || null,
      qty: Number((raw as Record<string, unknown>).qty || 0),
    }));

    const calculated = await calculateCustomerOrderItems(parsedItems);
    const paymentMethod = asValidPaymentMethod(body.payment_method);
    const paidNow = isPaymentPaid(paymentMethod);
    const requestedRedeemPoints = Math.max(0, Math.floor(Number(body.redeem_points || 0)));
    const availablePoints = await getLoyaltyPoints1y(customer.id);

    if (requestedRedeemPoints > 0 && availablePoints < LOYALTY_REDEEM_MIN_POINTS) {
      return customerApiError(
        409,
        "Minimum points not reached for redeem",
        "CONFLICT",
        { min_points: LOYALTY_REDEEM_MIN_POINTS, available_points: availablePoints }
      );
    }

    const redeem = calculateRedeem(requestedRedeemPoints, availablePoints, calculated.subtotal);
    const total = Math.max(0, calculated.subtotal - redeem.redeem_amount);

    const numbering = await generateOrderNumber();
    const supabase = createSupabaseAdminClient();

    const orderInsertBasePayload = {
      receipt_number: numbering.orderNumber,
      date_key: numbering.dateKey,
      customer_id: customer.id,
      customer_name: customer.name,
      subtotal: calculated.subtotal,
      discount_type: redeem.redeem_amount > 0 ? "fixed" : "none",
      discount_value: redeem.redeem_amount,
      total,
      payment_method: paymentMethod,
      cash_received: 0,
      balance: 0,
      status: paidNow ? "preparing" : "pending",
      payment_status: paidNow ? "paid" : "pending",
    };

    let orderInsert = await supabase
      .from("orders")
      .insert([
        {
          ...orderInsertBasePayload,
          order_source: "customer_web",
        },
      ])
      .select("id")
      .single();

    if (orderInsert.error && isMissingColumnError(orderInsert.error.message, "order_source")) {
      orderInsert = await supabase
        .from("orders")
        .insert([orderInsertBasePayload])
        .select("id")
        .single();
    }

    const { data: order, error: orderError } = orderInsert;

    if (orderError || !order) {
      return customerApiError(
        500,
        orderError?.message || "Failed to create order",
        "INTERNAL_ERROR"
      );
    }

    for (const item of calculated.items) {
      let insertItemResult = await supabase
        .from("order_items")
        .insert([
          {
            order_id: order.id,
            product_id: item.product_id,
            product_name_snapshot: item.product_name_snapshot,
            variant_id: item.variant_id,
            sugar_level: item.sugar_level,
            price: item.unit_price,
            qty: item.qty,
            line_total: item.line_total,
          },
        ])
        .select("id")
        .single();

      if (
        insertItemResult.error &&
        insertItemResult.error.message.toLowerCase().includes("sugar_level")
      ) {
        const legacyPayload = {
          order_id: order.id,
          product_id: item.product_id,
          product_name_snapshot: item.product_name_snapshot,
          variant_id: item.variant_id,
          price: item.unit_price,
          qty: item.qty,
          line_total: item.line_total,
        };
        insertItemResult = await supabase
          .from("order_items")
          .insert([legacyPayload])
          .select("id")
          .single();
      }

      if (insertItemResult.error) {
        return customerApiError(500, insertItemResult.error.message, "INTERNAL_ERROR");
      }

      if (insertItemResult.data && item.addon_snapshots.length > 0) {
        await insertOrderItemAddonsWithFallback(insertItemResult.data.id, item.addon_snapshots);
      }
    }

    // Reserve stock immediately to avoid oversell while payment integration is pending.
    for (const [productId, requestedQty] of calculated.requestedQtyByProductId.entries()) {
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("stock")
        .eq("id", productId)
        .single();
      if (productError || !product) {
        return customerApiError(
          500,
          productError?.message || "Failed to update stock",
          "INTERNAL_ERROR"
        );
      }

      const updatedStock = Math.max(0, Number(product.stock || 0) - requestedQty);
      const { error: updateStockError } = await supabase
        .from("products")
        .update({ stock: updatedStock })
        .eq("id", productId);
      if (updateStockError) {
        return customerApiError(500, updateStockError.message, "INTERNAL_ERROR");
      }
    }

    if (paidNow) {
      await applyCustomerOrderPaidSettlement(
        {
          id: order.id,
          customer_id: customer.id,
          receipt_number: numbering.orderNumber,
          total,
          discount_value: redeem.redeem_amount,
        },
        auth.user.id
      );
    }

    return NextResponse.json({
      success: true,
      order_id: order.id,
      order_number: numbering.orderNumber,
      subtotal: calculated.subtotal,
      discount: redeem.redeem_amount,
      total,
      payment: {
        status: paidNow ? "paid" : "pending",
        provider: "to-be-integrated",
      },
      items: calculated.items.map(item => ({
        product_id: item.product_id,
        name:
          `${item.product_name_snapshot}${item.variant_name ? ` (${item.variant_name})` : ""}` +
          `${item.addon_snapshots.length > 0 ? ` + ${item.addon_snapshots.map(v => v.name).join(", ")}` : ""}` +
          ` • Sugar: ${formatSugarLevel(item.sugar_level)}`,
        qty: item.qty,
        unit_price: item.unit_price,
        line_total: item.line_total,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create customer order";
    if (message.toLowerCase().includes("stock")) {
      return customerApiError(409, message, "CONFLICT");
    }
    if (message.toLowerCase().includes("required") || message.toLowerCase().includes("invalid")) {
      return customerApiError(400, message, "VALIDATION_ERROR");
    }
    return customerApiError(500, message, "INTERNAL_ERROR");
  }
}
