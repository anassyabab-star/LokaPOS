import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "").trim();
}

function isMissingRelationError(message: string | null | undefined) {
  const m = String(message || "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache");
}

const LOYALTY_POINTS_EXPIRY_DAYS = 365;
const LOYALTY_EXPIRING_SOON_DAYS = 30;

type LedgerRow = {
  points_change: number | null;
  created_at: string;
};

function calculateLoyaltySnapshot(rows: LedgerRow[]) {
  const now = Date.now();
  const soonCutoff = now - (LOYALTY_POINTS_EXPIRY_DAYS - LOYALTY_EXPIRING_SOON_DAYS) * 24 * 60 * 60 * 1000;
  const lots: Array<{ remaining: number; createdAtMs: number }> = [];

  for (const row of rows) {
    const change = Number(row.points_change || 0);
    const createdAtMs = new Date(row.created_at).getTime();
    if (!Number.isFinite(createdAtMs)) continue;

    if (change > 0) {
      lots.push({ remaining: change, createdAtMs });
      continue;
    }

    if (change < 0) {
      let redeem = Math.abs(change);
      while (redeem > 0 && lots.length > 0) {
        const lot = lots[0];
        const used = Math.min(lot.remaining, redeem);
        lot.remaining -= used;
        redeem -= used;
        if (lot.remaining <= 0) lots.shift();
      }
    }
  }

  const points = lots.reduce((sum, lot) => sum + lot.remaining, 0);
  const expiringSoon = lots
    .filter(lot => lot.createdAtMs <= soonCutoff)
    .reduce((sum, lot) => sum + lot.remaining, 0);

  return { points, expiringSoon };
}

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

    const cutoffIso = new Date(
      Date.now() - LOYALTY_POINTS_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    let loyaltyPoints = 0;
    const { data: loyaltyRows, error: loyaltyError } = await supabase
      .from("loyalty_ledger")
      .select("points_change,created_at")
      .eq("customer_id", data.id)
      .gte("created_at", cutoffIso)
      .order("created_at", { ascending: true })
      .limit(5000);

    if (!loyaltyError) {
      const snapshot = calculateLoyaltySnapshot((loyaltyRows || []) as LedgerRow[]);
      loyaltyPoints = snapshot.points;
      const expiringPoints30d = snapshot.expiringSoon;
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
        },
      });
    } else if (!isMissingRelationError(loyaltyError.message)) {
      return NextResponse.json({ error: loyaltyError.message }, { status: 500 });
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
        expiring_points_30d: 0,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to lookup customer";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
