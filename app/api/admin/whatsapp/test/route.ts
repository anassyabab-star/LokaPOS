import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { sendCloudTemplate, sendOtpMessage, sendWhatsAppText } from "@/lib/whatsapp";

// POST /api/admin/whatsapp/test { to, kind: "hello_world" | "otp" | "text", message? }
//   hello_world → Meta's built-in sample template (proves token + number work)
//   otp         → the configured authentication template with a dummy code
//   text        → free text through the active provider (Cloud needs a 24h window)
export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const to = String(body?.to || "").trim();
  const kind = String(body?.kind || "hello_world").trim().toLowerCase();
  if (!to) return NextResponse.json({ error: "Recipient number is required" }, { status: 400 });

  try {
    const storeName = String(process.env.STORE_NAME || "Loka").trim() || "Loka";
    const result =
      kind === "otp"
        ? await sendOtpMessage({ to, code: "123456", expiryMinutes: 5, storeName })
        : kind === "text"
          ? await sendWhatsAppText({ to, message: String(body?.message || `Ujian WhatsApp dari ${storeName} ✅`) })
          : await sendCloudTemplate({ to, name: "hello_world", lang: "en_US" });

    if (!result.ok) {
      return NextResponse.json({ error: result.error || "Send failed", provider: result.provider }, { status: 400 });
    }
    return NextResponse.json({ success: true, message_id: result.messageId, provider: result.provider });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send test message";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
