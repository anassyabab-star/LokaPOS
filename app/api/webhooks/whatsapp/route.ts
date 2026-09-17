import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getWhatsAppCloudConfig } from "@/lib/whatsapp";

// ============================================================================
// WhatsApp Cloud API webhook.
//   GET  — Meta's one-time verification handshake (hub.challenge)
//   POST — delivery / read statuses and inbound messages (logged; 200 fast)
//
// Configure in Meta App → WhatsApp → Configuration:
//   Callback URL  https://<domain>/api/webhooks/whatsapp
//   Verify token  = WHATSAPP_WEBHOOK_VERIFY_TOKEN
// and set WHATSAPP_APP_SECRET so POST signatures are checked.
// ============================================================================

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const cfg = getWhatsAppCloudConfig();
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");

  if (mode === "subscribe" && cfg.webhookVerifyToken && token === cfg.webhookVerifyToken && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

function signatureValid(raw: string, header: string | null, appSecret: string) {
  if (!appSecret) return true; // not configured → accept (log-only webhook)
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(raw, "utf8").digest("hex");
  const given = header.slice("sha256=".length);
  if (expected.length !== given.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(given, "hex"));
  } catch {
    return false;
  }
}

type WebhookBody = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: Array<{ id?: string; status?: string; recipient_id?: string; errors?: Array<{ code?: number; title?: string }> }>;
        messages?: Array<{ from?: string; id?: string; type?: string; text?: { body?: string } }>;
      };
    }>;
  }>;
};

export async function POST(req: NextRequest) {
  const cfg = getWhatsAppCloudConfig();
  const raw = await req.text();
  if (!signatureValid(raw, req.headers.get("x-hub-signature-256"), cfg.appSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: WebhookBody = {};
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return NextResponse.json({ ok: true });
  }

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      for (const s of value.statuses || []) {
        const err = s.errors?.[0];
        console.log(`[whatsapp] status ${s.status} → ${s.recipient_id} (${s.id})${err ? ` error ${err.code}: ${err.title}` : ""}`);
      }
      for (const m of value.messages || []) {
        // Inbound message = the customer opened a 24h service window.
        console.log(`[whatsapp] inbound ${m.type} from ${m.from}: ${String(m.text?.body || "").slice(0, 80)}`);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
