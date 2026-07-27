import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  calculateLoyaltySnapshot,
  computeMembershipTier,
  ensureReferralCode,
  getLoyaltyConfig,
} from "@/lib/loyalty";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("order_id");
  const rawPhone = searchParams.get("phone");
  const phone = rawPhone ? rawPhone.replace(/[^\d+]/g, "").trim() : null;

  if (!orderId && !phone) {
    return NextResponse.json({ error: "order_id or phone required" }, { status: 400 });
  }

  // Validate phone format (8–15 digits)
  if (phone && (phone.replace(/[^\d]/g, "").length < 8 || phone.replace(/[^\d]/g, "").length > 15)) {
    return NextResponse.json({ error: "No telefon tidak sah" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  // Track single order by ID — require phone to prove ownership
  if (orderId) {
    if (!phone) {
      return NextResponse.json({ error: "phone required to track order" }, { status: 400 });
    }

    const normalized = phone.replace(/[^\d+]/g, "").trim();
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", normalized)
      .maybeSingle();

    if (!customer) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    let { data: order, error } = await supabase
      .from("orders")
      .select("id, receipt_number, customer_name, status, payment_status, total, created_at, fulfillment_stage, ready_at, picked_up_at, reviewed_at")
      .eq("id", orderId)
      .eq("customer_id", customer.id)
      .maybeSingle();

    // Fallback for DBs where the Fasa-3 journey columns aren't migrated yet.
    if (error && (String(error.message).includes("fulfillment_stage") || String(error.message).includes("does not exist"))) {
      ({ data: order, error } = await supabase
        .from("orders")
        .select("id, receipt_number, customer_name, status, payment_status, total, created_at")
        .eq("id", orderId)
        .eq("customer_id", customer.id)
        .maybeSingle());
    }

    if (error || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ order });
  }

  // Track recent orders by phone (last 30 days) — loyalty points require customer auth
  if (phone) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: customer } = await supabase
      .from("customers")
      .select("id,referral_code")
      .eq("phone", phone)
      .maybeSingle();

    if (!customer) {
      return NextResponse.json({ orders: [], loyalty_points: 0, expiring_points_30d: 0 });
    }

    const config = await getLoyaltyConfig();
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: orders }, { data: ledgerRows }, { data: spendRows }, { data: vouchers }] =
      await Promise.all([
        supabase
          .from("orders")
          .select("id, receipt_number, customer_name, status, payment_status, total, created_at")
          .eq("customer_id", customer.id)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("loyalty_ledger")
          .select("points_change, created_at")
          .eq("customer_id", customer.id)
          .order("created_at", { ascending: true })
          .limit(10000),
        supabase
          .from("orders")
          .select("total")
          .eq("customer_id", customer.id)
          .eq("payment_status", "paid")
          .gte("created_at", oneYearAgo)
          .limit(10000),
        supabase
          .from("vouchers")
          .select("code, reward_label, reward_amount, status, expires_at")
          .eq("customer_id", customer.id)
          .eq("status", "issued")
          .order("issued_at", { ascending: false })
          .limit(20),
      ]);

    // FIFO snapshot — issued vouchers already wrote a redeem entry, so the
    // available balance is naturally net of unused vouchers.
    const snapshot = calculateLoyaltySnapshot(
      (ledgerRows || []) as Array<{ points_change: number | null; created_at: string }>,
      config
    );
    const spend12m = (spendRows || []).reduce((sum, row) => sum + Number(row.total || 0), 0);
    const tier = computeMembershipTier(spend12m, config);

    // Make sure the customer has a referral code to share.
    let referralCode = customer.referral_code ? String(customer.referral_code) : null;
    if (!referralCode) referralCode = await ensureReferralCode(customer.id);

    return NextResponse.json({
      orders: orders || [],
      loyalty_points: Math.max(0, snapshot.pointsAvailable),
      expiring_points_30d: Math.max(0, snapshot.expiringPoints30d),
      tier: tier.name,
      spend_12m: spend12m,
      referral_code: referralCode,
      vouchers: (vouchers || []).map(v => ({
        code: v.code,
        reward_label: v.reward_label,
        reward_amount: Number(v.reward_amount || 0),
        expires_at: v.expires_at,
      })),
    });
  }

  return NextResponse.json({ orders: [] });
}
