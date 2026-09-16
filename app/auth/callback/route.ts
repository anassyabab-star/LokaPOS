import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { setPhoneOtpSession } from "@/lib/phone-otp";
import { ensureCustomerRoleForOAuthUser, resolveCustomerForAuthUser } from "@/lib/customer-auth";

// ============================================================================
// GET /auth/callback?code=…&next=/rewards
//
// Supabase OAuth (PKCE) return leg for "Continue with Google" in the customer
// ordering app. Exchanges the code for a session, pins the role to `customer`
// (never the old `cashier` default), links the auth user to their customer
// record and, when that record already has a verified phone, mints the
// loyalty phone-session cookie so no OTP is needed.
//
//   customer with phone   → /signin?stage=sync   (client syncs contact, then `next`)
//   customer without one  → /signin?stage=link   (one-time OTP to bind a phone)
//   staff account         → /auth/redirect       (their usual landing page)
// ============================================================================

function safeNext(raw: string | null, fallback: string) {
  const value = String(raw || "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://") || value.includes("\\")) return fallback;
  return value;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), "/rewards");
  const oauthError = searchParams.get("error_description") || searchParams.get("error");

  const signin = (params: Record<string, string>) => {
    const url = new URL("/signin", request.url);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url;
  };

  if (!code) {
    return NextResponse.redirect(signin({ error: oauthError || "Log masuk Google dibatalkan", next }));
  }

  // Collect the session cookies the exchange wants to set; they are attached
  // to whichever redirect we end up returning.
  const pending: Array<{ name: string; value: string; options: CookieOptions }> = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          pending.push(...cookiesToSet);
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data?.user) {
    return NextResponse.redirect(signin({ error: error?.message || "Gagal log masuk dengan Google", next }));
  }

  const user = data.user;
  let target = signin({ stage: "link", next });
  let phoneToMint: string | null = null;

  try {
    const role = await ensureCustomerRoleForOAuthUser(user);
    if (role === "admin" || role === "cashier") {
      target = new URL("/auth/redirect", request.url);
    } else {
      const customer = await resolveCustomerForAuthUser(user, { allowCreate: true });
      if (customer?.phone) {
        phoneToMint = customer.phone;
        target = signin({ stage: "sync", next });
      }
    }
  } catch (err) {
    console.error("[auth/callback] customer link failed:", err);
  }

  const response = NextResponse.redirect(target);
  for (const c of pending) response.cookies.set(c.name, c.value, c.options);
  if (phoneToMint) setPhoneOtpSession(response, phoneToMint);
  return response;
}
