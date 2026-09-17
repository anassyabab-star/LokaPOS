import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeOtpPhone, setPhoneOtpSession, verifyOtpHash } from "@/lib/phone-otp";
import { issueCouponsOnSignup } from "@/lib/coupons";
import { phoneVariants } from "@/lib/phone";

const MAX_ATTEMPTS = 5;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const phone = normalizeOtpPhone(String(body?.phone || ""));
  const code = String(body?.code || "").trim();

  if (!phone || !code) {
    return NextResponse.json({ error: "Phone number and code are required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  // Most recent unconsumed, unexpired code for this phone.
  const { data: row, error } = await supabase
    .from("otp_codes")
    .select("id,code_hash,expires_at,attempts,consumed_at")
    .eq("phone", phone)
    .is("consumed_at", null)
    .gte("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
  }

  if (Number(row.attempts || 0) >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "Too many attempts. Please request a new code." },
      { status: 429 }
    );
  }

  if (!verifyOtpHash(phone, code, String(row.code_hash))) {
    await supabase
      .from("otp_codes")
      .update({ attempts: Number(row.attempts || 0) + 1 })
      .eq("id", row.id);
    return NextResponse.json({ error: "Wrong code" }, { status: 400 });
  }

  // Consume the code so it can't be reused.
  await supabase
    .from("otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);

  // Verifying a phone with a WhatsApp code IS registration on this path — the
  // customer may have no Google account and no row yet. Without creating one
  // they end up "signed in" with no account at all: no balance, no history,
  // no welcome coupon. Match every legacy phone shape first so an existing
  // member is never duplicated.
  try {
    const { data: found } = await supabase
      .from("customers")
      .select("id,phone")
      .in("phone", phoneVariants(phone))
      .order("total_orders", { ascending: false })
      .limit(1)
      .maybeSingle();

    let customerId = found?.id || null;
    if (found && found.phone !== phone) {
      await supabase.from("customers").update({ phone }).eq("id", found.id);
    }

    if (!customerId) {
      const { data: created } = await supabase
        .from("customers")
        // customers.name is NOT NULL and this path has no name yet — the
        // empty string is filled in on their first order.
        .insert([{ name: "", phone, consent_whatsapp: true, consent_source: "customer_app", total_orders: 0, total_spend: 0 }])
        .select("id")
        .maybeSingle();
      customerId = created?.id || null;
    }

    await issueCouponsOnSignup(customerId);
  } catch {
    // Never block sign-in on account creation or the coupon.
  }

  const res = NextResponse.json({ success: true });
  return setPhoneOtpSession(res, phone);
}
