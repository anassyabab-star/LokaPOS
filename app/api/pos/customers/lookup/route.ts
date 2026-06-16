import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";
import { calculateLoyaltySnapshot, computeMembershipTier, getLoyaltyConfig } from "@/lib/loyalty";

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "").trim();
}

function isMissingRelationError(message: string | null | undefined) {
  const m = String(message || "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache");
}

type LedgerRow = {
  points_change: number | null;
  created_at: string;
};

export async function GET(req: Request) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const phoneRaw = String(searchParams.get("phone") || "").trim();
  const phone = normalizePhone(phoneRaw);

  if (!phone) {
    return NextResponse.json({ error: "Phone is required" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("customers")
      .select(
        "id,name,phone,email,consent_whatsapp,consent_email,total_orders,total_spend,last_order_at"
      )
      .eq("phone", phone)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ customer: null });
    }

    const config = await getLoyaltyConfig();
    const yearAgoIso = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

    // Rolling 12-month paid spend → membership tier.
    let spend12m = 0;
    const { data: spendRows } = await supabase
      .from("orders")
      .select("total")
      .eq("customer_id", data.id)
      .eq("payment_status", "paid")
      .gte("created_at", yearAgoIso)
      .limit(10000);
    spend12m = (spendRows || []).reduce((sum, row) => sum + Number(row.total || 0), 0);
    const tier = computeMembershipTier(spend12m, config);

    let loyaltyPoints = 0;
    let expiringPoints30d = 0;
    const { data: loyaltyRows, error: loyaltyError } = await supabase
      .from("loyalty_ledger")
      .select("points_change,created_at")
      .eq("customer_id", data.id)
      .order("created_at", { ascending: true })
      .limit(10000);

    if (loyaltyError && !isMissingRelationError(loyaltyError.message)) {
      return NextResponse.json({ error: loyaltyError.message }, { status: 500 });
    }
    if (!loyaltyError) {
      const snapshot = calculateLoyaltySnapshot((loyaltyRows || []) as LedgerRow[], config);
      loyaltyPoints = snapshot.pointsAvailable;
      expiringPoints30d = snapshot.expiringPoints30d;
    }

    return NextResponse.json({
      customer: {
        id: data.id,
        name: data.name,
        phone: data.phone,
        email: data.email,
        consent_whatsapp: Boolean(data.consent_whatsapp),
        consent_email: Boolean(data.consent_email),
        total_orders: Number(data.total_orders || 0),
        total_spend: Number(data.total_spend || 0),
        last_order_at: data.last_order_at,
        loyalty_points: loyaltyPoints,
        expiring_points_30d: expiringPoints30d,
        tier: tier.name,
        spend_12m: spend12m,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to lookup customer";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
