import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  consent_whatsapp: boolean | null;
  consent_email: boolean | null;
  consent_whatsapp_at: string | null;
  consent_email_at: string | null;
  total_orders: number | null;
  total_spend: number | null;
  last_order_at: string | null;
  created_at: string;
};

type LoyaltyRow = {
  customer_id: string;
  points_change: number | null;
};

const LOYALTY_POINTS_EXPIRY_DAYS = 365;

function isMissingRelationError(message: string | null | undefined) {
  const m = String(message || "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache");
}

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const consent = searchParams.get("consent") || "all";

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("customers")
      .select(
        "id,name,phone,email,consent_whatsapp,consent_email,consent_whatsapp_at,consent_email_at,total_orders,total_spend,last_order_at,created_at"
      )
      .order("last_order_at", { ascending: false, nullsFirst: false })
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = ((data || []) as CustomerRow[]).map(row => ({
      ...row,
      total_orders: Number(row.total_orders || 0),
      total_spend: Number(row.total_spend || 0),
      consent_whatsapp: Boolean(row.consent_whatsapp),
      consent_email: Boolean(row.consent_email),
    }));

    const customerIds = rows.map(row => row.id);
    const pointsByCustomer = new Map<string, number>();
    if (customerIds.length > 0) {
      const cutoffIso = new Date(
        Date.now() - LOYALTY_POINTS_EXPIRY_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();

      const { data: loyaltyRows, error: loyaltyError } = await supabase
        .from("loyalty_ledger")
        .select("customer_id,points_change")
        .in("customer_id", customerIds)
        .gte("created_at", cutoffIso)
        .limit(5000);

      if (loyaltyError && !isMissingRelationError(loyaltyError.message)) {
        return NextResponse.json({ error: loyaltyError.message }, { status: 500 });
      }

      for (const row of (loyaltyRows || []) as LoyaltyRow[]) {
        const current = pointsByCustomer.get(row.customer_id) || 0;
        pointsByCustomer.set(row.customer_id, current + Number(row.points_change || 0));
      }
    }

    const filtered = rows.filter(row => {
      const matchQ =
        !q ||
        row.name.toLowerCase().includes(q) ||
        String(row.phone || "").toLowerCase().includes(q) ||
        String(row.email || "").toLowerCase().includes(q);

      const matchConsent =
        consent === "all" ||
        (consent === "whatsapp" && row.consent_whatsapp) ||
        (consent === "email" && row.consent_email) ||
        (consent === "none" && !row.consent_whatsapp && !row.consent_email);

      return matchQ && matchConsent;
    });

    const summary = rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.consent_whatsapp) acc.whatsapp += 1;
        if (row.consent_email) acc.email += 1;
        acc.total_spend += row.total_spend;
        return acc;
      },
      { total: 0, whatsapp: 0, email: 0, total_spend: 0 }
    );

    return NextResponse.json({
      customers: filtered.map(row => ({
        ...row,
        loyalty_points: pointsByCustomer.get(row.id) || 0,
      })),
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load customers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
