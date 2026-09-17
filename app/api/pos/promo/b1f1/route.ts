import { NextRequest, NextResponse } from "next/server";
import { canonicalPhone } from "@/lib/phone";
import { requireStaffApi } from "@/lib/staff-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const PROMO_CODE = "B1F1_KOPI";

// Was producing "60XXXXXXXXX" while customers.phone stores "0XXXXXXXXX",
// so B1F1 lookups missed the customer entirely.
function normalizePhone(phone: string) {
  return canonicalPhone(phone);
}

export async function GET(req: NextRequest) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const phone = String(req.nextUrl.searchParams.get("phone") || "").trim();
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("member_promo_redemptions")
    .select("id")
    .eq("phone", normalizePhone(phone))
    .eq("promo_code", PROMO_CODE)
    .maybeSingle();

  return NextResponse.json({ redeemed: Boolean(data) });
}
