import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { LOYALTY_REDEEM_RM_PER_POINT } from "@/lib/customer-orders";

const LOYALTY_EARN_PER_RM = 1;

type OrderSettlementInput = {
  id: string;
  customer_id: string | null;
  receipt_number: string | null;
  total: number | null;
  discount_value: number | null;
};

export async function applyCustomerOrderPaidSettlement(
  order: OrderSettlementInput,
  createdBy: string | null
) {
  if (!order.customer_id) return;

  const supabase = createSupabaseAdminClient();
  const total = Number(order.total || 0);
  const redeemAmount = Math.max(0, Number(order.discount_value || 0));
  const redeemPoints = Math.max(0, Math.round(redeemAmount / LOYALTY_REDEEM_RM_PER_POINT));
  const earnPoints = Math.max(0, Math.floor(total * LOYALTY_EARN_PER_RM));
  const orderLabel = String(order.receipt_number || order.id.slice(0, 8));

  if (redeemPoints > 0) {
    const { error: redeemError } = await supabase.from("loyalty_ledger").insert([
      {
        customer_id: order.customer_id,
        order_id: order.id,
        entry_type: "redeem",
        points_change: -Math.abs(redeemPoints),
        created_by: createdBy,
        note: `Customer redeem on order ${orderLabel}`,
      },
    ]);
    if (redeemError) throw new Error(redeemError.message);
  }

  if (earnPoints > 0) {
    const { error: earnError } = await supabase.from("loyalty_ledger").insert([
      {
        customer_id: order.customer_id,
        order_id: order.id,
        entry_type: "earn",
        points_change: earnPoints,
        created_by: createdBy,
        note: `Earn from order ${orderLabel}`,
      },
    ]);
    if (earnError) throw new Error(earnError.message);
  }

  const { data: customerRow, error: customerReadError } = await supabase
    .from("customers")
    .select("id,total_orders,total_spend")
    .eq("id", order.customer_id)
    .maybeSingle();
  if (customerReadError) throw new Error(customerReadError.message);
  if (!customerRow) return;

  const { error: customerUpdateError } = await supabase
    .from("customers")
    .update({
      total_orders: Number(customerRow.total_orders || 0) + 1,
      total_spend: Number(customerRow.total_spend || 0) + total,
      last_order_at: new Date().toISOString(),
    })
    .eq("id", order.customer_id);
  if (customerUpdateError) throw new Error(customerUpdateError.message);
}
