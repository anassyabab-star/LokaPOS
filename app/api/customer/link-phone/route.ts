import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth";
import { normalizeOtpPhone, requirePhoneOtp, setPhoneOtpSession } from "@/lib/phone-otp";
import { bindPhoneToAuthCustomer, phoneHasLoyaltyHistory } from "@/lib/customer-auth";

// ============================================================================
// POST /api/customer/link-phone { phone }
//
// One-time binding of a phone number to a Google (or email) account.
//   • Number with NO loyalty history (unknown, or no orders/points) → bound
//     directly on the strength of the Google session.
//   • Number that already carries orders/points (or belongs to another
//     account) → additionally requires a valid OTP session for that phone,
//     so nobody can claim someone else's balance. Responds 401 OTP_REQUIRED.
// After this, Google alone is enough — see /auth/callback and /api/public/me.
// ============================================================================

export async function POST(req: Request) {
  const user = await getCurrentSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sila log masuk dengan Google dahulu", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const phone = normalizeOtpPhone(String(body?.phone || ""));
  if (!phone || phone.replace(/\D/g, "").length < 8) {
    return NextResponse.json({ error: "No telefon tidak sah" }, { status: 400 });
  }

  try {
    const protectedNumber = await phoneHasLoyaltyHistory(phone);
    let verified = false;
    if (protectedNumber) {
      const guard = requirePhoneOtp(req, phone);
      if (!guard.ok) return guard.response; // 401 OTP_REQUIRED / 403 mismatch
      verified = true;
    }

    const customer = await bindPhoneToAuthCustomer(user, phone);
    const res = NextResponse.json({
      success: true,
      verified,
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
    });
    return setPhoneOtpSession(res, phone);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal sambungkan nombor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
