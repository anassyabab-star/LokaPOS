import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getLoyaltyConfig } from "@/lib/loyalty";
import { generateOtpCode, hashOtpCode, normalizeOtpPhone } from "@/lib/phone-otp";
import { sendOtpMessage } from "@/lib/whatsapp";

// Throttle windows.
const MIN_INTERVAL_SECONDS = 45; // between consecutive sends to one phone
const MAX_PER_HOUR = 5;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const phone = normalizeOtpPhone(String(body?.phone || ""));

  if (!phone || phone.replace(/[^\d]/g, "").length < 8) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const config = await getLoyaltyConfig();
  const nowMs = Date.now();

  // Rate-limit by recent sends to this phone.
  const hourAgoIso = new Date(nowMs - 60 * 60 * 1000).toISOString();
  const { data: recent, error: recentError } = await supabase
    .from("otp_codes")
    .select("created_at")
    .eq("phone", phone)
    .gte("created_at", hourAgoIso)
    .order("created_at", { ascending: false })
    .limit(MAX_PER_HOUR + 1);

  if (recentError && !String(recentError.message).toLowerCase().includes("does not exist")) {
    return NextResponse.json({ error: recentError.message }, { status: 500 });
  }

  const recentRows = recent || [];
  if (recentRows.length >= MAX_PER_HOUR) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429 }
    );
  }
  if (recentRows[0]) {
    const lastMs = new Date(recentRows[0].created_at).getTime();
    if (Number.isFinite(lastMs) && nowMs - lastMs < MIN_INTERVAL_SECONDS * 1000) {
      const wait = Math.ceil((MIN_INTERVAL_SECONDS * 1000 - (nowMs - lastMs)) / 1000);
      return NextResponse.json(
        { error: `Please wait ${wait}s before requesting a new code.` },
        { status: 429 }
      );
    }
  }

  const code = generateOtpCode();
  const expiresAt = new Date(nowMs + config.otpExpiryMinutes * 60 * 1000).toISOString();

  const { error: insertError } = await supabase.from("otp_codes").insert([
    {
      phone,
      code_hash: hashOtpCode(phone, code),
      expires_at: expiresAt,
    },
  ]);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const storeName = String(process.env.STORE_NAME || "Loka").trim() || "Loka";

  // WhatsApp Cloud API authentication template when configured, Murpati otherwise.
  const sent = await sendOtpMessage({ to: phone, code, expiryMinutes: config.otpExpiryMinutes, storeName });
  if (!sent.ok) {
    // Code is stored; surface a soft error so the user can retry.
    console.error("[otp/request] send failed:", sent.provider, sent.error);
    return NextResponse.json(
      { error: "Couldn't send the code via WhatsApp. Please try again.", detail: sent.error },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, expires_in: config.otpExpiryMinutes * 60 });
}
