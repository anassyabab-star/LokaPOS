import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { getMurpatiConfigStatus } from "@/app/api/admin/campaigns/murpati";
import { getWhatsAppCloudConfig, getWhatsAppCloudPhoneInfo, listWhatsAppTemplates, resolveWhatsAppProvider } from "@/lib/whatsapp";

export const revalidate = 0;

// GET /api/admin/whatsapp/status — which gateway is live, Cloud API health,
// and the template names the app will send with.
export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const cfg = getWhatsAppCloudConfig();
  const [phone, list] = cfg.configured
    ? await Promise.all([getWhatsAppCloudPhoneInfo(), listWhatsAppTemplates()])
    : [null, null];

  // Approval status of each template name the app will send with.
  const byName = new Map((list?.templates || []).map(t => [t.name, t]));
  const template_status = Object.fromEntries(
    Object.entries(cfg.templates).map(([key, name]) => {
      const t = byName.get(name);
      return [key, { name, found: Boolean(t), status: t?.status ?? null, category: t?.category ?? null, language: t?.language ?? null, params: t?.params ?? null }];
    })
  );

  return NextResponse.json({
    waba_id_set: Boolean(cfg.wabaId),
    template_list_error: list?.error ?? null,
    template_status,
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
