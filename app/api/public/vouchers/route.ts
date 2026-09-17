import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { canonicalPhone, phoneVariants } from "@/lib/phone";

// GET ?phone= — the customer's usable vouchers, for checkout to list.
//
// Checkout used to offer a bare "COUPON CODE" box, so redeeming points meant
// remembering a generated code from the rewards screen. Nothing told the
// customer that was even the mechanism — the wallet says "Show at counter".
//
// `applies_here` says whether the web checkout can price it. A free-product
// reward (mission cup) cannot: computeVoucherDiscount returns 0 for it by
// design and it is redeemed at the till, so we list it and say so rather than
// letting someone apply it for RM0.00.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const phone = canonicalPhone(searchParams.get("phone"));
  if (!phone) return NextResponse.json({ vouchers: [] });

  try {
    const supabase = createSupabaseAdminClient();
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .in("phone", phoneVariants(phone))
      .limit(1)
      .maybeSingle();
    if (!customer?.id) return NextResponse.json({ vouchers: [] });

    const { data, error } = await supabase
      .from("vouchers")
      .select("code,reward_type,reward_amount,reward_label,discount_percent,max_discount,min_spend,expires_at")
      .eq("customer_id", customer.id)
      .eq("status", "issued")
      .order("issued_at", { ascending: false })
      .limit(20);
    if (error) return NextResponse.json({ vouchers: [] });

    const now = Date.now();
    const vouchers = (data || [])
      .filter(v => !v.expires_at || new Date(v.expires_at).getTime() > now)
      .map(v => ({
        code: v.code,
        label: v.reward_label || (v.reward_type === "amount" ? `RM${Number(v.reward_amount || 0).toFixed(2)} off` : "Reward"),
        reward_type: v.reward_type,
        min_spend: Number(v.min_spend || 0),
        expires_at: v.expires_at,
        applies_here: v.reward_type === "amount" || v.reward_type === "percent",
      }));

    return NextResponse.json({ vouchers });
  } catch {
    return NextResponse.json({ vouchers: [] });
  }
}
