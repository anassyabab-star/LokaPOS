import { NextResponse } from "next/server";
import { canonicalPhone } from "@/lib/phone";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadRedeemableCoupon } from "@/lib/coupons";

// GET ?code=&phone= — validate a customer's coupon before checkout (no redeem).
// Coupons are personal, so the phone identifies the owning customer.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = String(searchParams.get("code") || "").trim().toUpperCase();
  const phone = canonicalPhone(searchParams.get("phone"));
  if (!code) return NextResponse.json({ valid: false, reason: "not_found" });
  if (!phone) return NextResponse.json({ valid: false, reason: "wrong_customer" });

  const supabase = createSupabaseAdminClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (!customer?.id) return NextResponse.json({ valid: false, reason: "wrong_customer" });

  const loaded = await loadRedeemableCoupon(code, String(customer.id));
  if (!loaded.ok) return NextResponse.json({ valid: false, reason: loaded.reason });

  const v = loaded.voucher;
  return NextResponse.json({
    valid: true,
    coupon: {
      code: v.code,
      label: v.reward_label,
      reward_type: v.reward_type,
      discount_percent: v.discount_percent,
      reward_amount: v.reward_amount,
      min_spend: v.min_spend,
      // Needed so checkout can show the real saving instead of a bare
      // "applied" badge. A scoped coupon (product/category) is left for the
      // server to price, since the cart alone cannot resolve categories.
      max_discount: v.max_discount ?? null,
      scoped: Boolean(v.reward_product_id || v.reward_category_id),
      expires_at: v.expires_at,
    },
  });
}
