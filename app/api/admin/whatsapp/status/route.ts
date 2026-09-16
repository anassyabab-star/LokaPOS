import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { getMurpatiConfigStatus } from "@/app/api/admin/campaigns/murpati";
import { getWhatsAppCloudConfig, getWhatsAppCloudPhoneInfo, resolveWhatsAppProvider } from "@/lib/whatsapp";

export const revalidate = 0;

// GET /api/admin/whatsapp/status — which gateway is live, Cloud API health,
// and the template names the app will send with.
export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const cfg = getWhatsAppCloudConfig();
  const phone = cfg.configured ? await getWhatsAppCloudPhoneInfo() : null;

  return NextResponse.json({
    provider: resolveWhatsAppProvider(),
    preference: String(process.env.WHATSAPP_PROVIDER || "auto").toLowerCase(),
    cloud: {
      configured: cfg.configured,
      has_access_token: cfg.hasAccessToken,
      has_phone_number_id: cfg.hasPhoneNumberId,
      api_version: cfg.apiVersion,
      language: cfg.lang,
      token_valid: phone?.ok ?? false,
      display_phone_number: phone?.display_phone_number ?? null,
      verified_name: phone?.verified_name ?? null,
      quality_rating: phone?.quality_rating ?? null,
      webhook_verify_token_set: Boolean(cfg.webhookVerifyToken),
      app_secret_set: Boolean(cfg.appSecret),
      error: phone?.error ?? (cfg.configured ? null : "Set WHATSAPP_CLOUD_ACCESS_TOKEN dan WHATSAPP_CLOUD_PHONE_NUMBER_ID"),
    },
    murpati: { configured: getMurpatiConfigStatus().configured },
    templates: cfg.templates,
  });
}
