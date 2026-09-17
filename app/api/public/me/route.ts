import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth";
import { getPhoneOtpSession, setPhoneOtpSession } from "@/lib/phone-otp";
import { resolveCustomerForAuthUser } from "@/lib/customer-auth";

export const revalidate = 0;

// ============================================================================
// GET /api/public/me — "who am I" for the customer ordering app.
//
//   Google / email session + linked phone → { signed_in, provider, name, phone }
//     and the loyalty phone-session cookie is (re)minted, so a returning
//     Google user never sees another OTP.
//   Google session, no phone yet          → needs_phone: true
//   OTP-only session                       → provider "otp"
//   nothing                                → { signed_in: false }
// ============================================================================

export async function GET(req: Request) {
  try {
    const user = await getCurrentSessionUser();
    if (user) {
      const customer = await resolveCustomerForAuthUser(user, { allowCreate: false });
      const phone = customer?.phone || null;
      const meta = (user.user_metadata || {}) as Record<string, unknown>;
      const name = customer?.name || String(meta.full_name || meta.name || "").trim() || null;
      const provider = String((user.app_metadata as Record<string, unknown> | undefined)?.provider || "email");

      const res = NextResponse.json({
        signed_in: true,
        provider,
        name,
        email: user.email || null,
        phone,
        needs_phone: !phone,
      });
      if (phone) setPhoneOtpSession(res, phone);
      return res;
    }

    const otpPhone = getPhoneOtpSession(req);
    if (otpPhone) {
      return NextResponse.json({ signed_in: true, provider: "otp", name: null, email: null, phone: otpPhone, needs_phone: false });
    }

    return NextResponse.json({ signed_in: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ signed_in: false, error: message }, { status: 500 });
  }
}
