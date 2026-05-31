import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getLoyaltyConfig, issueVoucherAtomic } from "@/lib/loyalty";
import { normalizeOtpPhone, requirePhoneOtp } from "@/lib/phone-otp";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const phone = normalizeOtpPhone(String(body?.phone || ""));
  const points = Number(body?.points);

  if (!phone || phone.replace(/[^\d]/g, "").length < 8) {
    return NextResponse.json({ error: "No telefon tidak sah" }, { status: 400 });
  }

  // OTP gate — caller must have a verified phone session.
  const guard = requirePhoneOtp(req, phone);
  if (!guard.ok) return guard.response;

  const config = await getLoyaltyConfig();
  const tier = config.voucherTiers.find(t => t.points === points);
  if (!tier) {
    return NextResponse.json({ error: "Tier tidak sah" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  if (!customer) {
    return NextResponse.json(
      { error: "Akaun tidak dijumpai. Buat order dahulu untuk daftar." },
      { status: 404 }
    );
  }

  const result = await issueVoucherAtomic({
    customerId: customer.id,
    points: tier.points,
    amount: tier.amount,
    label: tier.label,
    config,
  });

  if (!result.ok) {
    if (result.error === "INSUFFICIENT_POINTS") {
      return NextResponse.json(
        { error: `Mata tidak mencukupi (perlu ${tier.points} pts)` },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Gagal jana voucher. Cuba lagi." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    code: result.voucher.code,
    reward: tier.label,
    points_spent: tier.points,
    expires_at: result.voucher.expires_at,
  });
}
