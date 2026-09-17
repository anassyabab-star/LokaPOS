import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { canonicalPhone } from "@/lib/phone";

// ============================================================================
// Phone OTP — WhatsApp one-time-code auth for public loyalty actions
// (redeem / check-in). Verified sessions are carried by a short-lived,
// HMAC-signed cookie bound to the customer's phone number.
// ============================================================================

export const PHONE_SESSION_COOKIE = "loka_phone_otp";
const SESSION_COOKIE = PHONE_SESSION_COOKIE;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function secret() {
  return (
    process.env.OTP_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.CRON_SECRET ||
    "loka-otp-dev-secret"
  );
}

function hmac(input: string) {
  return createHmac("sha256", secret()).update(input).digest("hex");
}

function base64url(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromBase64url(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function safeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/** Normalize to the same shape customers.phone is stored in. */
export function normalizeOtpPhone(value: string) {
  return canonicalPhone(value);
}

/** Generate a 6-digit numeric OTP. */
export function generateOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Hash an OTP for at-rest storage (never store the plaintext code). */
export function hashOtpCode(phone: string, code: string) {
  return hmac(`${normalizeOtpPhone(phone)}:${code}`);
}

export function verifyOtpHash(phone: string, code: string, storedHash: string) {
  return safeEqualHex(hashOtpCode(phone, code), storedHash);
}

// ── Session token ───────────────────────────────────────────────────────────

function signSession(phone: string, expMs: number) {
  const payload = base64url(JSON.stringify({ phone: normalizeOtpPhone(phone), exp: expMs }));
  return `${payload}.${hmac(payload)}`;
}

function verifySession(token: string | undefined | null): { phone: string } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (!safeEqualHex(hmac(payload), sig)) return null;
  try {
    const parsed = JSON.parse(fromBase64url(payload)) as { phone?: string; exp?: number };
    if (!parsed.phone || !parsed.exp || Date.now() > parsed.exp) return null;
    return { phone: parsed.phone };
  } catch {
    return null;
  }
}

/** Attach a verified-phone session cookie to a response. */
export function setPhoneOtpSession(res: NextResponse, phone: string) {
  const token = signSession(phone, Date.now() + SESSION_TTL_MS);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}

/** Remove the verified-phone session cookie (sign-out). */
export function clearPhoneOtpSession(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** The phone a valid session cookie on this request is bound to, else null. */
export function getPhoneOtpSession(req: Request): string | null {
  const session = verifySession(readCookie(req, SESSION_COOKIE));
  return session ? session.phone : null;
}

export type PhoneOtpGuard =
  | { ok: true; phone: string }
  | { ok: false; response: NextResponse };

/**
 * Require a valid OTP session for `phone`. Public redeem/check-in routes call
 * this before mutating loyalty state.
 */
export function requirePhoneOtp(req: Request, phone: string): PhoneOtpGuard {
  const session = verifySession(readCookie(req, SESSION_COOKIE));
  const normalized = normalizeOtpPhone(phone);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "OTP verification required", code: "OTP_REQUIRED" },
        { status: 401 }
      ),
    };
  }
  if (session.phone !== normalized) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "OTP session doesn't match this number", code: "OTP_PHONE_MISMATCH" },
        { status: 403 }
      ),
    };
  }
  return { ok: true, phone: normalized };
}
