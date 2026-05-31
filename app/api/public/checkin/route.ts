import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getLoyaltyConfig, loyaltyExpiresAt } from "@/lib/loyalty";
import { isUniqueConstraintError } from "@/lib/customer-api";
import { normalizeOtpPhone, requirePhoneOtp } from "@/lib/phone-otp";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const phone = normalizeOtpPhone(String(body?.phone || ""));

  if (!phone || phone.replace(/[^\d]/g, "").length < 8) {
    return NextResponse.json({ error: "No telefon diperlukan" }, { status: 400 });
  }

  // OTP gate.
  const guard = requirePhoneOtp(req, phone);
  if (!guard.ok) return guard.response;

  const supabase = createSupabaseAdminClient();
  const config = await getLoyaltyConfig();

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  if (!customer) {
    return NextResponse.json(
      { error: "Pelanggan tidak dijumpai. Buat order dulu untuk daftar." },
      { status: 404 }
    );
  }

  const todayMyt = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" });

  // Atomic: rely on the unique event_key index instead of read-then-insert.
  // A second check-in the same day collides on the key → "already checked in".
  const { error: insertError } = await supabase.from("loyalty_ledger").insert([
    {
      customer_id: customer.id,
      entry_type: "earn",
      points_change: config.checkInPoints,
      source: "checkin",
      note: `Daily check-in ${todayMyt}`,
      event_key: `checkin:${customer.id}:${todayMyt}`,
      created_by: null,
      expires_at: loyaltyExpiresAt(config),
    },
  ]);

  if (insertError) {
    if (isUniqueConstraintError(insertError.message)) {
      return NextResponse.json({
        already_checked_in: true,
        message: "Dah check-in hari ini. Jumpa lagi esok!",
      });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, points_earned: config.checkInPoints });
}
