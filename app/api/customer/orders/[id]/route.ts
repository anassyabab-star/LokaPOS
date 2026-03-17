import { NextResponse } from "next/server";
import { requireCustomerApi } from "@/lib/customer-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { customerApiError, resolveOrCreateCustomerForUser } from "@/lib/customer-api";
import { loadOrderItemsWithDisplay } from "@/lib/customer-orders";

type OrderRow = {
  id: string;
  receipt_number: string | null;
  created_at: string;
  customer_id: string | null;
  customer_name: string | null;
  status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  subtotal: number | null;
  discount_value: number | null;
  total: number | null;
};

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireCustomerApi();
  if (!auth.ok) return auth.response;

  try {
    const customer = await resolveOrCreateCustomerForUser(auth.user, {
      allowCreate: true,
    });
    if (!customer) {
      return customerApiError(404, "Customer profile not found", "NOT_FOUND");
    }

    const { id } = await context.params;
    const orderId = String(id || "").trim();
    if (!orderId) {
      return customerApiError(400, "Invalid order id", "VALIDATION_ERROR");
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id,receipt_number,created_at,customer_id,customer_name,status,payment_status,payment_method,subtotal,discount_value,total"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (error) {
      return customerApiError(500, error.message, "INTERNAL_ERROR");
    }
    if (!data) {
      return customerApiError(404, "Order not found", "NOT_FOUND");
    }

    const order = data as OrderRow;
    if (String(order.customer_id || "") !== customer.id) {
      return customerApiError(404, "Order not found", "NOT_FOUND");
    }

    const items = await loadOrderItemsWithDisplay(order.id);

    return NextResponse.json({
      id: order.id,
      order_number: order.receipt_number || order.id.slice(0, 8),
      created_at: order.created_at,
      customer_name: order.customer_name,
      status: order.status,
      payment_status: order.payment_status,
      payment_method: order.payment_method,
      subtotal: Number(order.subtotal || 0),
      discount: Number(order.discount_value || 0),
      total: Number(order.total || 0),
      items,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load order";
    return customerApiError(500, message, "INTERNAL_ERROR");
  }
}

