import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isUniqueConstraintError } from "@/lib/customer-api";
import {
  computeMembershipTier,
  getLoyaltyConfig,
  loyaltyExpiresAt,
  type LoyaltyConfig,
} from "@/lib/loyalty";

type OrderSettlementInput = {
  id: string;
  customer_id: string | null;
  receipt_number: string | null;
  total: number | null;
  discount_value: number | null;
};

function isMissingRelationError(message: string | null | undefined) {
  const text = String(message || "").toLowerCase();
  return text.includes("does not exist") || text.includes("schema cache");
}

/**
 * Insert a loyalty_ledger row keyed by event_key for idempotency.
 * Returns true if a new row was written, false if it already existed
 * (unique-key collision) or the table/columns are missing.
 */
async function insertLedgerEvent(payload: {
  customerId: string;
  orderId?: string | null;
  entryType: "earn" | "redeem" | "adjust";
  pointsChange: number;
  source: string;
  note: string;
  eventKey: string;
  createdBy: string | null;
  expiresAt?: string | null;
}): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("loyalty_ledger").insert([
    {
      customer_id: payload.customerId,
      order_id: payload.orderId ?? null,
      entry_type: payload.entryType,
      points_change: payload.pointsChange,
      source: payload.source,
      note: payload.note,
      event_key: payload.eventKey,
      created_by: payload.createdBy,
      ...(payload.expiresAt ? { expires_at: payload.expiresAt } : {}),
    },
  ]);
  if (!error) return true;
  if (isUniqueConstraintError(error.message)) return false; // already processed
  if (isMissingRelationError(error.message)) return false; // schema not ready
  throw new Error(error.message);
}

/** Rolling 12-month paid spend for a customer (drives membership tier). */
async function getRolling12mSpend(customerId: string): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("orders")
    .select("total")
    .eq("customer_id", customerId)
    .eq("payment_status", "paid")
    .gte("created_at", cutoff)
    .limit(10000);
  if (error) {
    if (isMissingRelationError(error.message)) return 0;
    return 0;
  }
  return (data || []).reduce((sum, row) => sum + Number(row.total || 0), 0);
}

/**
 * Award referral bonuses to both parties the first time a referred customer
 * has a paid order. Idempotent via dedicated event keys, so it fires once.
 */
async function applyReferralBonus(
  customerId: string,
  config: LoyaltyConfig,
  expiresAt: string
) {
  if (config.referralPoints <= 0) return;
  const supabase = createSupabaseAdminClient();
  const { data: customer, error } = await supabase
    .from("customers")
    .select("id,referred_by")
    .eq("id", customerId)
    .maybeSingle();
  if (error || !customer || !customer.referred_by) return;
  const referrerId = String(customer.referred_by);
  if (!referrerId || referrerId === customerId) return;

  // Referred customer's reward.
  await insertLedgerEvent({
    customerId,
    entryType: "earn",
    pointsChange: config.referralPoints,
    source: "referral",
    note: "Referral bonus (welcome)",
    eventKey: `referral-referred:${customerId}`,
    createdBy: null,
    expiresAt,
  });
  // Referrer's reward.
  await insertLedgerEvent({
    customerId: referrerId,
    entryType: "earn",
    pointsChange: config.referralPoints,
    source: "referral",
    note: "Referral bonus (invite)",
    eventKey: `referral-referrer:${customerId}`,
    createdBy: null,
    expiresAt,
  });
}

export async function applyCustomerOrderPaidSettlement(
  order: OrderSettlementInput,
  createdBy: string | null
): Promise<{ earned: number }> {
  if (!order.customer_id) return { earned: 0 };

  const supabase = createSupabaseAdminClient();
  const config = await getLoyaltyConfig();
  const total = Number(order.total || 0);
  const orderLabel = String(order.receipt_number || order.id.slice(0, 8));
  const expiresAt = loyaltyExpiresAt(config);

  // Idempotency guard specific to earn (a redeem row may already exist for this
  // order from order-creation — that must NOT block the earn).
  const { data: existingEarn } = await supabase
    .from("loyalty_ledger")
    .select("id")
    .eq("order_id", order.id)
    .eq("entry_type", "earn")
    .limit(1);
  if (existingEarn && existingEarn.length > 0) return { earned: 0 };

  // Membership-tier earn multiplier (rolling 12-month spend).
  const spend12m = await getRolling12mSpend(order.customer_id);
  const tier = computeMembershipTier(spend12m, config);
  const earnPoints = Math.max(0, Math.floor(total * config.earnPerRM * tier.earnMultiplier));

  // Always write the earn ledger row (even when earnPoints === 0) so the unique
  // event_key is the single idempotency token for BOTH the earn AND the stats
  // bump below. Without this, zero-earn orders (sub-RM1 totals, or earn disabled
  // via earnPerRM=0) would re-bump total_orders/total_spend on every settlement
  // call — and payment webhooks retry. A 0-point row is inert in every
  // aggregation (snapshot/issued only count change > 0); history hides it.
  const inserted = await insertLedgerEvent({
    customerId: order.customer_id,
    orderId: order.id,
    entryType: "earn",
    pointsChange: earnPoints,
    source: "order",
    note: `Earn from order ${orderLabel}`,
    eventKey: `earn:${order.id}`,
    createdBy,
    expiresAt,
  });
  // Concurrent settlement already wrote earn — stop before double-counting stats.
  if (!inserted) return { earned: 0 };

  const { data: customerRow, error: customerReadError } = await supabase
    .from("customers")
    .select("id,total_orders,total_spend")
    .eq("id", order.customer_id)
    .maybeSingle();
  if (customerReadError) throw new Error(customerReadError.message);
  if (!customerRow) return { earned: earnPoints };

  const { error: customerUpdateError } = await supabase
    .from("customers")
    .update({
      total_orders: Number(customerRow.total_orders || 0) + 1,
      total_spend: Number(customerRow.total_spend || 0) + total,
      last_order_at: new Date().toISOString(),
    })
    .eq("id", order.customer_id);
  if (customerUpdateError) throw new Error(customerUpdateError.message);

  // Referral bonus on first paid order (idempotent).
  await applyReferralBonus(order.customer_id, config, expiresAt);

  return { earned: earnPoints };
}
