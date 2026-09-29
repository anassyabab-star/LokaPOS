import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { canonicalPhone, phoneVariants } from "@/lib/phone";
import { calculateLoyaltySnapshot, getLoyaltyConfig } from "@/lib/loyalty";
import { hasPhoneSession } from "@/lib/phone-otp";
import { isMissingColumnError } from "@/lib/order-status";

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
//
// Codes are bearer secrets: whoever holds one can spend it. They are only
// returned to a session verified for this phone — otherwise anyone who knows a
// number (a tournament captain typing in teammates' phones, say) could list and
// spend that customer's vouchers. Without a session: balance only, and a count.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const phone = canonicalPhone(searchParams.get("phone"));
  if (!phone) return NextResponse.json({ vouchers: [], points: 0, earn_per_rm: 1, redeem_tiers: [] });

  try {
    const supabase = createSupabaseAdminClient();
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .in("phone", phoneVariants(phone))
      .limit(1)
      .maybeSingle();
    if (!customer?.id) return NextResponse.json({ vouchers: [], points: 0, earn_per_rm: 1, redeem_tiers: [] });

    type Row = {
      code: string; reward_type: string | null; reward_amount: number | null; reward_label: string | null;
      min_spend: number | null; expires_at: string | null; valid_from?: string | null;
    };
    const COLS = "code,reward_type,reward_amount,reward_label,discount_percent,max_discount,min_spend,expires_at";
    const fetchVouchers = (cols: string) =>
      supabase
        .from("vouchers")
        .select(cols)
        .eq("customer_id", customer.id)
        .eq("status", "issued")
        .order("issued_at", { ascending: false })
        .limit(20);
    // valid_from arrives with the tournament migration; tolerate DBs without it.
    let { data: rows, error } = await fetchVouchers(COLS + ",valid_from");
    if (error && isMissingColumnError(error.message)) ({ data: rows, error } = await fetchVouchers(COLS));
    const data = (rows || []) as unknown as Row[];
    if (error) return NextResponse.json({ vouchers: [], points: 0, earn_per_rm: 1, redeem_tiers: [] });

    // Balance + tiers so checkout can show what the customer has and what it
    // is worth, at the moment they are deciding to pay. Same FIFO snapshot the
    // rewards screen uses, so the two never disagree.
    const config = await getLoyaltyConfig();
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const { data: ledgerRows } = await supabase
      .from("loyalty_ledger")
      .select("points_change, created_at")
      .eq("customer_id", customer.id)
      .gte("created_at", oneYearAgo)
      .limit(10000);
    const snapshot = calculateLoyaltySnapshot(
      (ledgerRows || []) as Array<{ points_change: number | null; created_at: string }>,
      config
    );
    const points = Math.max(0, snapshot.pointsAvailable);

    const now = Date.now();
    const live = data.filter(v => !v.expires_at || new Date(v.expires_at).getTime() > now);
    const verified = hasPhoneSession(req, phone);
    const vouchers = (verified ? live : [])
      .map(v => ({
        code: v.code,
        label: v.reward_label || (v.reward_type === "amount" ? `RM${Number(v.reward_amount || 0).toFixed(2)} off` : "Reward"),
        reward_type: v.reward_type,
        min_spend: Number(v.min_spend || 0),
        expires_at: v.expires_at,
        // Not yet valid (a tournament-day voucher before the day) → listed, not usable.
        valid_from: v.valid_from ?? null,
        applies_here:
          (v.reward_type === "amount" || v.reward_type === "percent") &&
          (!v.valid_from || new Date(v.valid_from).getTime() <= now),
      }));

    return NextResponse.json({
      vouchers,
      locked_vouchers: verified ? 0 : live.length,
      points,
      earn_per_rm: config.earnPerRM,
      redeem_tiers: config.voucherTiers.map(t => ({ points: t.points, amount: t.amount, label: t.label })),
    });
  } catch {
    return NextResponse.json({ vouchers: [], points: 0, earn_per_rm: 1, redeem_tiers: [] });
  }
}
