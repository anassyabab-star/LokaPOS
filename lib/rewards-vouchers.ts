import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateVoucherCode } from "@/lib/loyalty";

// ============================================================================
// Non-points reward vouchers (mission free-cup, coupons, review rewards).
//
// This is the sibling of issue_loyalty_voucher (lib/loyalty.ts / RPC): it issues
// a redeemable `vouchers` row WITHOUT moving any loyalty points, and is idempotent
// via `issue_event_key`. Redemption still flows through redeem_voucher_code
// (app/api/pos/voucher/route.ts), so free-cup/coupon vouchers inherit the mature
// issued→redeemed transition, expiry handling and customer display.
// ============================================================================

export type RewardVoucherInput = {
  customerId: string;
  /** provenance: 'mission' | 'coupon' | 'review' */
  source: string;
  /** e.g. mission/coupon code */
  sourceRef?: string | null;
  /** 'amount' | 'free_product' | 'percent' */
  rewardType: "amount" | "free_product" | "percent";
  rewardLabel: string;
  rewardAmount?: number;
  rewardProductId?: string | null;
  rewardCategoryId?: string | null;
  discountPercent?: number | null;
  maxDiscount?: number | null;
  minSpend?: number;
  /** Coupons set this true so the mission engine skips orders that redeem them. */
  excludesMission?: boolean;
  /** Unique idempotency key — a repeat call with the same key issues nothing new. */
  issueEventKey: string;
  /** ISO timestamp; null = never expires. */
  expiresAt?: string | null;
};

export type VoucherRow = {
  id: string;
  code: string;
  customer_id: string | null;
  status: string;
  reward_type: string;
  reward_amount: number;
  reward_label: string | null;
  source: string | null;
  source_ref: string | null;
  excludes_mission: boolean;
  expires_at: string | null;
};

const VOUCHER_SELECT =
  "id,code,customer_id,status,reward_type,reward_amount,reward_label,source,source_ref,excludes_mission,expires_at";

function mentions(message: string | null | undefined, needle: string) {
  return String(message || "").toLowerCase().includes(needle);
}

export type CartItemLite = { product_id: string | null; line_total: number };

export type DiscountVoucher = {
  reward_type: string;
  reward_amount?: number | null;
  discount_percent?: number | null;
  max_discount?: number | null;
  reward_product_id?: string | null;
  reward_category_id?: string | null;
  min_spend?: number | null;
};

/**
 * RM discount a percent/amount voucher (coupon) grants against a cart.
 * `free_product` returns 0 here (redeemed at the counter, not as an RM discount).
 * `categoryByProductId` is only needed for category-scoped coupons.
 * Returns a non-negative amount rounded to 2 decimals, never exceeding subtotal.
 */
export function computeVoucherDiscount(
  voucher: DiscountVoucher,
  items: CartItemLite[],
  subtotal: number,
  categoryByProductId?: Map<string, string | null>
): number {
  if (subtotal <= 0) return 0;
  if (Number(voucher.min_spend || 0) > subtotal) return 0;

  // Base the discount applies to.
  let base = subtotal;
  if (voucher.reward_product_id) {
    base = items
      .filter(i => i.product_id === voucher.reward_product_id)
      .reduce((s, i) => s + Number(i.line_total || 0), 0);
  } else if (voucher.reward_category_id) {
    base = items
      .filter(i => i.product_id && categoryByProductId?.get(i.product_id) === voucher.reward_category_id)
      .reduce((s, i) => s + Number(i.line_total || 0), 0);
  }
  if (base <= 0) return 0;

  let discount = 0;
  if (voucher.reward_type === "percent") {
    const pct = Math.max(0, Number(voucher.discount_percent || 0));
    discount = base * (pct / 100);
    const cap = Number(voucher.max_discount || 0);
    if (cap > 0) discount = Math.min(discount, cap);
  } else if (voucher.reward_type === "amount") {
    discount = Math.min(Number(voucher.reward_amount || 0), base);
  } else {
    return 0; // free_product handled at POS redemption
  }

  discount = Math.min(discount, subtotal);
  return Math.max(0, Math.round(discount * 100) / 100);
}

/**
 * Issue a non-points reward voucher. Idempotent on `issueEventKey`:
 *   - if a voucher with that key already exists, returns it (no new row);
 *   - retries on voucher-code collisions with a fresh code.
 * Returns the voucher row, or null if the schema isn't ready.
 */
export async function issueRewardVoucher(input: RewardVoucherInput): Promise<VoucherRow | null> {
  const supabase = createSupabaseAdminClient();

  // Fast path: already issued for this event key.
  const { data: existing } = await supabase
    .from("vouchers")
    .select(VOUCHER_SELECT)
    .eq("issue_event_key", input.issueEventKey)
    .maybeSingle();
  if (existing) return existing as VoucherRow;

  const row = {
    customer_id: input.customerId,
    status: "issued",
    points_spent: 0,
    reward_type: input.rewardType,
    reward_amount: input.rewardType === "amount" ? Number(input.rewardAmount || 0) : 0,
    reward_label: input.rewardLabel,
    reward_product_id: input.rewardProductId ?? null,
    reward_category_id: input.rewardCategoryId ?? null,
    discount_percent: input.discountPercent ?? null,
    max_discount: input.maxDiscount ?? null,
    min_spend: Number(input.minSpend || 0),
    source: input.source,
    source_ref: input.sourceRef ?? null,
    excludes_mission: Boolean(input.excludesMission),
    issue_event_key: input.issueEventKey,
    expires_at: input.expiresAt ?? null,
  };

  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await supabase
      .from("vouchers")
      .insert([{ ...row, code: generateVoucherCode() }])
      .select(VOUCHER_SELECT)
      .single();

    if (!error && data) return data as VoucherRow;
    const msg = error?.message;
    // Another writer issued for this key concurrently — return theirs.
    if (mentions(msg, "issue_event_key")) {
      const { data: dup } = await supabase
        .from("vouchers")
        .select(VOUCHER_SELECT)
        .eq("issue_event_key", input.issueEventKey)
        .maybeSingle();
      return (dup as VoucherRow) ?? null;
    }
    // Voucher code collision — retry with a new code.
    if (mentions(msg, "vouchers_code") || (mentions(msg, "code") && mentions(msg, "unique"))) {
      continue;
    }
    // Schema not migrated yet — degrade gracefully.
    if (mentions(msg, "does not exist") || mentions(msg, "schema cache")) return null;
    throw new Error(msg || "Failed to issue reward voucher");
  }
  throw new Error("Failed to issue reward voucher: code collisions exhausted");
}
