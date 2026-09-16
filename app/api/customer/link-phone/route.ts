import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth";
import { normalizeOtpPhone, requirePhoneOtp, setPhoneOtpSession } from "@/lib/phone-otp";
import { bindPhoneToAuthCustomer } from "@/lib/customer-auth";

// ============================================================================
// POST /api/customer/link-phone { phone }
//
// One-time binding of a phone number to a Google (or email) account. Requires
// BOTH proofs on the same request: a Supabase session (who you are) and a
// valid OTP session for that phone (you own the number). After this, Google
// alone is enough — see /auth/callback and /api/public/me.
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

  const guard = requirePhoneOtp(req, phone);
  if (!guard.ok) return guard.response;

  try {
    const customer = await bindPhoneToAuthCustomer(user, phone);
    const res = NextResponse.json({
      success: true,
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
    });
    return setPhoneOtpSession(res, phone);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal sambungkan nombor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
