import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getLoyaltyConfig } from "@/lib/loyalty";
import { issueRewardVoucher } from "@/lib/rewards-vouchers";

/** A coupon voucher with the fields needed to compute its discount. */
export type CouponVoucher = {
  id: string;
  code: string;
  customer_id: string | null;
  status: string;
  reward_type: string;
  reward_amount: number | null;
  reward_label: string | null;
  discount_percent: number | null;
  max_discount: number | null;
  min_spend: number | null;
  reward_product_id: string | null;
  reward_category_id: string | null;
  excludes_mission: boolean;
  expires_at: string | null;
};

// ============================================================================
// Coupon engine (Smart Loyalty Fasa 2).
//
// Coupons are auto-issued after a qualifying purchase as `vouchers` rows
// (source='coupon', excludes_mission=true). Redemption reuses redeem_voucher_code
// and the discount is computed by computeVoucherDiscount(). Gated by
// loyalty_config.couponsEnabled (default OFF — money-affecting, owner opts in).
// ============================================================================

function isMissingRelationError(message: string | null | undefined) {
  const text = String(message || "").toLowerCase();
  return text.includes("does not exist") || text.includes("schema cache");
}

type CouponTemplate = {
  code: string;
  discount_type: string; // percent | fixed
  discount_value: number;
  max_discount: number | null;
  applies_to: string; // all | product | category
  product_id: string | null;
  category_id: string | null;
  min_spend: number;
  validity_days: number;
  issue_min_spend: number;
  one_active_per_customer: boolean;
};

/**
 * Auto-issue coupons to a customer after a paid order. Best-effort & idempotent
 * (issue_event_key = coupon:{code}:{orderId}). No-op when couponsEnabled is off.
 */
export async function issueCouponsOnPaid(
  orderId: string,
  _createdBy: string | null
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const config = await getLoyaltyConfig();
  if (!config.couponsEnabled) return;

  const { data: order } = await supabase
    .from("orders")
    .select("id,customer_id,total")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || !order.customer_id) return;

  const customerId = String(order.customer_id);
  const total = Number(order.total || 0);

  const { data: templates, error } = await supabase
    .from("coupon_templates")
    .select(
      "code,discount_type,discount_value,max_discount,applies_to,product_id,category_id,min_spend,validity_days,issue_min_spend,one_active_per_customer"
    )
    .eq("active", true)
    .eq("issue_trigger", "on_paid");
  if (error) return; // schema missing / read error → skip

  for (const t of (templates || []) as CouponTemplate[]) {
    try {
      if (total < Number(t.issue_min_spend || 0)) continue;

      // Respect "one active per customer".
      if (t.one_active_per_customer) {
        const { data: active } = await supabase
          .from("vouchers")
          .select("id")
          .eq("customer_id", customerId)
          .eq("source", "coupon")
          .eq("source_ref", t.code)
          .eq("status", "issued")
          .limit(1);
        if (active && active.length > 0) continue;
      }

      const expiresAt = new Date(
        Date.now() + Number(t.validity_days || 14) * 24 * 60 * 60 * 1000
      ).toISOString();
      const isPercent = t.discount_type === "percent";

      await issueRewardVoucher({
        customerId,
        source: "coupon",
        sourceRef: t.code,
        rewardType: isPercent ? "percent" : "amount",
        rewardLabel: couponLabel(t),
        rewardAmount: isPercent ? 0 : Number(t.discount_value || 0),
        discountPercent: isPercent ? Number(t.discount_value || 0) : null,
        maxDiscount: t.max_discount ?? null,
        rewardProductId: t.applies_to === "product" ? t.product_id : null,
        rewardCategoryId: t.applies_to === "category" ? t.category_id : null,
        minSpend: Number(t.min_spend || 0),
        excludesMission: true, // coupon use excludes the order from missions
        issueEventKey: `coupon:${t.code}:${orderId}`,
        expiresAt,
      });
    } catch {
      continue;
    }
  }
}

/**
 * Auto-issue "welcome" coupons the moment someone becomes a member.
 *
 * Called from the sign-in completion routes (Google callback, OTP verify,
 * phone link) rather than from /api/public/me, so it runs once per sign-in
 * instead of on every page load. Idempotent via
 * issue_event_key = coupon:{code}:signup:{customerId}, so repeat sign-ins and
 * retries never mint a second voucher.
 *
 * Scope guard: only customers who have never had a paid order. That keeps this
 * a genuine new-member offer instead of handing every one of the existing
 * walk-in customers a discount the first time they open the app. To turn it
 * into an app-adoption push later, drop the hasOrdered check below.
 */
export async function issueCouponsOnSignup(customerId: string | null | undefined): Promise<void> {
  const id = String(customerId || "").trim();
  if (!id) return;

  const supabase = createSupabaseAdminClient();
  const config = await getLoyaltyConfig();
  if (!config.couponsEnabled) return;

  const { data: templates, error } = await supabase
    .from("coupon_templates")
    .select(
      "code,discount_type,discount_value,max_discount,applies_to,product_id,category_id,min_spend,validity_days,issue_min_spend,one_active_per_customer"
    )
    .eq("active", true)
    .eq("issue_trigger", "on_signup");
  if (error || !templates || templates.length === 0) return; // schema missing / nothing to issue

  // New members only.
  const { count: paidOrders } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", id)
    .eq("payment_status", "paid");
  if (Number(paidOrders || 0) > 0) return;

  for (const t of templates as CouponTemplate[]) {
    try {
      if (t.one_active_per_customer) {
        const { data: active } = await supabase
          .from("vouchers")
          .select("id")
          .eq("customer_id", id)
          .eq("source", "coupon")
          .eq("source_ref", t.code)
          .eq("status", "issued")
          .limit(1);
        if (active && active.length > 0) continue;
      }

      const expiresAt = new Date(
        Date.now() + Number(t.validity_days || 14) * 24 * 60 * 60 * 1000
      ).toISOString();
      const isPercent = t.discount_type === "percent";

      await issueRewardVoucher({
        customerId: id,
        source: "coupon",
        sourceRef: t.code,
        rewardType: isPercent ? "percent" : "amount",
        rewardLabel: couponLabel(t),
        rewardAmount: isPercent ? 0 : Number(t.discount_value || 0),
        discountPercent: isPercent ? Number(t.discount_value || 0) : null,
        maxDiscount: t.max_discount ?? null,
        rewardProductId: t.applies_to === "product" ? t.product_id : null,
        rewardCategoryId: t.applies_to === "category" ? t.category_id : null,
        minSpend: Number(t.min_spend || 0),
        excludesMission: true,
        issueEventKey: `coupon:${t.code}:signup:${id}`,
        expiresAt,
      });
    } catch {
      continue;
    }
  }
}

function couponLabel(t: CouponTemplate): string {
  const scope =
    t.applies_to === "product" ? " (produk terpilih)" : t.applies_to === "category" ? " (kategori terpilih)" : "";
  return t.discount_type === "percent"
    ? `${t.discount_value}% off${scope}`
    : `RM${Number(t.discount_value).toFixed(2)} off${scope}`;
}

export type CouponLoadResult =
  | { ok: true; voucher: CouponVoucher }
  | { ok: false; reason: "disabled" | "not_found" | "wrong_customer" | "expired" | "used" };

/**
 * Load a coupon voucher for redemption by a specific customer. Validates status,
 * expiry and ownership. Discount amount is computed separately (needs the cart).
 */
export async function loadRedeemableCoupon(
  code: string,
  customerId: string
): Promise<CouponLoadResult> {
  const config = await getLoyaltyConfig();
  if (!config.couponsEnabled) return { ok: false, reason: "disabled" };

  const supabase = createSupabaseAdminClient();
  const { data: voucher, error } = await supabase
    .from("vouchers")
    .select(
      "id,code,customer_id,status,reward_type,reward_amount,reward_label,discount_percent,max_discount,min_spend,reward_product_id,reward_category_id,source,source_ref,excludes_mission,expires_at"
    )
    .eq("code", code)
    .maybeSingle();
  if (error) {
    if (isMissingRelationError(error.message)) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "not_found" };
  }
  if (!voucher) return { ok: false, reason: "not_found" };
  if (voucher.customer_id && voucher.customer_id !== customerId) {
    return { ok: false, reason: "wrong_customer" };
  }
  if (voucher.status !== "issued") return { ok: false, reason: "used" };
  if (voucher.expires_at && new Date(voucher.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, voucher: voucher as unknown as CouponVoucher };
}

/**
 * Reverse coupons touched by a refunded/voided order:
 *   - expire coupons this order ISSUED (still unredeemed);
 *   - return coupons this order REDEEMED (back to 'issued', if still in date).
 * Idempotent (guarded on current status).
 */
export async function reverseCouponsOnRefund(orderId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  // Coupons issued BY this order that were never used → expire them.
  const { data: issued } = await supabase
    .from("vouchers")
    .select("id,expires_at")
    .eq("source", "coupon")
    .eq("status", "issued")
    .like("issue_event_key", `coupon:%:${orderId}`);
  for (const v of issued || []) {
    await supabase.from("vouchers").update({ status: "expired" }).eq("id", v.id);
  }

  // Coupons redeemed ON this order → give them back if still valid.
  const { data: redeemed } = await supabase
    .from("vouchers")
    .select("id,expires_at")
    .eq("source", "coupon")
    .eq("status", "redeemed")
    .eq("redeemed_order_id", orderId);
  for (const v of redeemed || []) {
    const stillValid = !v.expires_at || new Date(v.expires_at).getTime() > Date.now();
    if (!stillValid) continue;
    await supabase
      .from("vouchers")
      .update({ status: "issued", redeemed_at: null, redeemed_order_id: null })
      .eq("id", v.id);
  }
}
