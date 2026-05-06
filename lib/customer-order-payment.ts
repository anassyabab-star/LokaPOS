import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
  const earnPoints = Math.max(0, Math.floor(total * LOYALTY_EARN_PER_RM));
  const orderLabel = String(order.receipt_number || order.id.slice(0, 8));

  // Check if loyalty entries already exist for this order to prevent double-processing
  const { data: existingEntries } = await supabase
    .from("loyalty_ledger")
    .select("id")
    .eq("order_id", order.id)
    .limit(1);
  if (existingEntries && existingEntries.length > 0) return;

  // Only write earn entry — redeem was already written at order creation time
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
