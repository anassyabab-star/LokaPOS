// ============================================================================
// LokaPOS — WhatsApp sender (SERVER ONLY).
//
// One door for every WhatsApp message the app sends:
//   • WhatsApp Cloud API (official, Meta Graph API) — preferred when configured
//   • Murpati (unofficial gateway) — fallback / legacy
//
// Cloud API rule: outside a 24-hour customer-service window every business-
// initiated message MUST be an approved template (authentication / utility /
// marketing). So transactional sends go out as templates on Cloud and as
// free text on Murpati. See docs/whatsapp-cloud-api.md for the templates to
// create in Meta Business Manager.
//
// Env:
//   WHATSAPP_PROVIDER              auto | cloud | murpati      (default auto)
//   WHATSAPP_CLOUD_ACCESS_TOKEN    permanent System User token
//   WHATSAPP_CLOUD_PHONE_NUMBER_ID phone number id (not the WABA id)
//   WHATSAPP_CLOUD_API_VERSION     default v22.0
//   WHATSAPP_TEMPLATE_LANG         default ms
//   WHATSAPP_TEMPLATE_OTP / _ORDER_RECEIVED / _ORDER_PAID / _ORDER_READY / _POINTS_RECEIPT
//   WHATSAPP_WEBHOOK_VERIFY_TOKEN, WHATSAPP_APP_SECRET   (webhook, optional)
// ============================================================================

import { getMurpatiConfigStatus, sendMurpatiText } from "@/app/api/admin/campaigns/murpati";

export type WhatsAppProvider = "cloud" | "murpati" | "none";

export type WhatsAppSendResult = {
  ok: boolean;
  messageId: string | null;
  error: string | null;
  provider: WhatsAppProvider;
};

export type WhatsAppTemplateNames = {
  otp: string;
  orderReceived: string;
  orderPaid: string;
  orderReady: string;
  pointsReceipt: string;
};

const GRAPH_BASE = "https://graph.facebook.com";

export function getWhatsAppCloudConfig() {
  const accessToken = String(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN || "").trim();
  const phoneNumberId = String(process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || "").trim();
  const apiVersion = String(process.env.WHATSAPP_CLOUD_API_VERSION || "v22.0").trim().replace(/^\/+|\/+$/g, "");
  const lang = String(process.env.WHATSAPP_TEMPLATE_LANG || "ms").trim() || "ms";
  const templates: WhatsAppTemplateNames = {
    otp: String(process.env.WHATSAPP_TEMPLATE_OTP || "loka_otp").trim(),
    orderReceived: String(process.env.WHATSAPP_TEMPLATE_ORDER_RECEIVED || "loka_order_received").trim(),
    orderPaid: String(process.env.WHATSAPP_TEMPLATE_ORDER_PAID || "loka_order_paid").trim(),
    orderReady: String(process.env.WHATSAPP_TEMPLATE_ORDER_READY || "loka_order_ready").trim(),
    pointsReceipt: String(process.env.WHATSAPP_TEMPLATE_POINTS_RECEIPT || "loka_points_receipt").trim(),
  };
  // Optional per-template language overrides (WHATSAPP_TEMPLATE_OTP_LANG=en_US …).
  // Without one, the language is auto-detected from the WABA template list.
  const templateLangs: Partial<Record<keyof WhatsAppTemplateNames, string>> = {};
  const langEnv: Record<keyof WhatsAppTemplateNames, string | undefined> = {
    otp: process.env.WHATSAPP_TEMPLATE_OTP_LANG,
    orderReceived: process.env.WHATSAPP_TEMPLATE_ORDER_RECEIVED_LANG,
    orderPaid: process.env.WHATSAPP_TEMPLATE_ORDER_PAID_LANG,
    orderReady: process.env.WHATSAPP_TEMPLATE_ORDER_READY_LANG,
    pointsReceipt: process.env.WHATSAPP_TEMPLATE_POINTS_RECEIPT_LANG,
  };
  for (const [k, v] of Object.entries(langEnv)) {
    if (v && String(v).trim()) templateLangs[k as keyof WhatsAppTemplateNames] = String(v).trim();
  }
  return {
    configured: Boolean(accessToken && phoneNumberId),
    hasAccessToken: Boolean(accessToken),
    hasPhoneNumberId: Boolean(phoneNumberId),
    accessToken,
    phoneNumberId,
    /** WhatsApp Business Account id — optional, enables template listing in admin. */
    wabaId: String(process.env.WHATSAPP_CLOUD_WABA_ID || "").trim(),
    apiVersion,
    lang,
    templates,
    templateLangs,
    webhookVerifyToken: String(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "").trim(),
    appSecret: String(process.env.WHATSAPP_APP_SECRET || "").trim(),
  };
}

export type WhatsAppTemplateInfo = {
  name: string;
  status: string;
  category: string;
  language: string;
  /** "positional" ({{1}}), "named" ({{code}}) or "none" */
  params: "positional" | "named" | "none";
  paramNames: string[];
};

/** Templates on the WABA (needs WHATSAPP_CLOUD_WABA_ID). Admin diagnostics only. */
export async function listWhatsAppTemplates(): Promise<{ ok: boolean; templates: WhatsAppTemplateInfo[]; error: string | null }> {
  const cfg = getWhatsAppCloudConfig();
  if (!cfg.configured || !cfg.wabaId) {
    return { ok: false, templates: [], error: cfg.wabaId ? "Not configured" : "WHATSAPP_CLOUD_WABA_ID not set" };
  }
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${cfg.apiVersion}/${cfg.wabaId}/message_templates?fields=name,status,category,language,components&limit=200`,
      { headers: { Authorization: `Bearer ${cfg.accessToken}` }, cache: "no-store" }
    );
    const json = (await res.json().catch(() => ({}))) as {
      data?: Array<{
        name: string;
        status: string;
        category: string;
        language: string;
        components?: Array<{ type?: string; text?: string; example?: { body_text_named_params?: Array<{ param_name?: string }> } }>;
      }>;
      error?: GraphError;
    };
    if (!res.ok || json.error) return { ok: false, templates: [], error: json.error?.message || `Graph API ${res.status}` };
    const templates = (json.data || []).map(t => {
      const body = (t.components || []).find(c => c.type === "BODY");
      const named = body?.example?.body_text_named_params?.map(p => String(p.param_name || "")).filter(Boolean) || [];
      const positional = /\{\{\d+\}\}/.test(String(body?.text || ""));
      return {
        name: t.name,
        status: t.status,
        category: t.category,
        language: t.language,
        params: named.length ? ("named" as const) : positional ? ("positional" as const) : ("none" as const),
        paramNames: named,
      };
    });
    return { ok: true, templates, error: null };
  } catch (err) {
    return { ok: false, templates: [], error: err instanceof Error ? err.message : "Request failed" };
  }
}

// Template list cache (5 min) so language auto-detection doesn't hit Graph on
// every send.
let templateCache: { atMs: number; templates: WhatsAppTemplateInfo[] } | null = null;
const TEMPLATE_CACHE_TTL_MS = 5 * 60 * 1000;

async function cachedTemplates(): Promise<WhatsAppTemplateInfo[]> {
  const now = Date.now();
  if (templateCache && now - templateCache.atMs < TEMPLATE_CACHE_TTL_MS) return templateCache.templates;
  const list = await listWhatsAppTemplates();
  if (list.ok) templateCache = { atMs: now, templates: list.templates };
  return list.ok ? list.templates : templateCache?.templates || [];
}

/**
 * Language code to send a template with: env override → the language the
 * template was actually created in (from the WABA list, preferring an APPROVED
 * entry) → WHATSAPP_TEMPLATE_LANG.
 */
export async function resolveTemplateLanguage(kind: keyof WhatsAppTemplateNames, name: string): Promise<string> {
  const cfg = getWhatsAppCloudConfig();
  const override = cfg.templateLangs[kind];
  if (override) return override;
  if (cfg.wabaId) {
    const matches = (await cachedTemplates()).filter(t => t.name === name);
    const approved = matches.find(t => t.status === "APPROVED") || matches[0];
    if (approved?.language) return approved.language;
  }
  return cfg.lang;
}

/** Which gateway sends right now (env preference + what is configured). */
export function resolveWhatsAppProvider(): WhatsAppProvider {
  const pref = String(process.env.WHATSAPP_PROVIDER || "auto").trim().toLowerCase();
  const cloud = getWhatsAppCloudConfig().configured;
  const murpati = getMurpatiConfigStatus().configured;
  if (pref === "cloud") return cloud ? "cloud" : "none";
  if (pref === "murpati") return murpati ? "murpati" : "none";
  if (cloud) return "cloud";
  if (murpati) return "murpati";
  return "none";
}

/** Malaysian numbers → `60XXXXXXXXX` (what Graph API wants in `to`). */
export function normalizeWhatsAppTo(raw: string): string {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) digits = `60${digits.slice(1)}`;
  else if (/^1\d{8,9}$/.test(digits)) digits = `60${digits}`;
  return digits;
}

/** Template parameter text: Cloud API rejects newlines, tabs and 4+ spaces. */
export function templateParam(value: unknown, max = 512): string {
  const text = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, max);
  return text || "-";
}

// ---------------------------------------------------------------------------
// Cloud API transport
// ---------------------------------------------------------------------------

type GraphError = { message?: string; code?: number; error_subcode?: number; error_data?: { details?: string } };

async function cloudPost(payload: Record<string, unknown>): Promise<WhatsAppSendResult> {
  const cfg = getWhatsAppCloudConfig();
  if (!cfg.configured) {
    return { ok: false, messageId: null, error: "WhatsApp Cloud API not configured", provider: "cloud" };
  }
  try {
    const res = await fetch(`${GRAPH_BASE}/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.accessToken}` },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: Array<{ id?: string }>; error?: GraphError };
    if (!res.ok || json.error) {
      const e = json.error || {};
      const detail = e.error_data?.details ? ` — ${e.error_data.details}` : "";
      return {
        ok: false,
        messageId: null,
        error: `${e.message || `Cloud API ${res.status}`}${e.code ? ` (code ${e.code})` : ""}${detail}`,
        provider: "cloud",
      };
    }
    return { ok: true, messageId: json.messages?.[0]?.id || null, error: null, provider: "cloud" };
  } catch (err) {
    return { ok: false, messageId: null, error: err instanceof Error ? err.message : "Cloud API request failed", provider: "cloud" };
  }
}

/**
 * Template parameter format. Meta lets each template be created with numbered
 * ({{1}}) or named ({{nama}}) placeholders. Default positional; set
 * WHATSAPP_TEMPLATE_PARAMS=named if you created the loka_* templates with the
 * names listed in NAMED_PARAM_KEYS / docs. (Authentication templates are
 * always positional.)
 */
export function templateParamFormat(): "positional" | "named" {
  return String(process.env.WHATSAPP_TEMPLATE_PARAMS || "positional").trim().toLowerCase() === "named" ? "named" : "positional";
}

/** Parameter names, in order, when the utility templates are created as "named". */
export const NAMED_PARAM_KEYS: Record<keyof WhatsAppTemplateNames, string[]> = {
  otp: ["1"],
  orderReceived: ["nama", "order_id", "resit", "lokasi", "item", "jumlah", "langkah"],
  orderPaid: ["order_id", "resit", "jumlah", "sasaran", "kedai"],
  orderReady: ["nama", "order_id", "resit", "kedai", "sasaran", "jumlah"],
  pointsReceipt: ["nama", "tarikh", "jumlah", "points", "baki_points", "baki_rm", "luput", "kedai"],
};

export async function sendCloudTemplate(opts: {
  to: string;
  name: string;
  lang?: string;
  bodyParams?: string[];
  /** When set, body params are sent as named parameters in this order. */
  bodyParamNames?: string[];
  /** One entry per URL button (index order) — used for the OTP "copy code" button. */
  buttonUrlParams?: string[];
}): Promise<WhatsAppSendResult> {
  const to = normalizeWhatsAppTo(opts.to);
  if (!to) return { ok: false, messageId: null, error: "Invalid phone number", provider: "cloud" };
  const cfg = getWhatsAppCloudConfig();
  const components: Array<Record<string, unknown>> = [];
  if (opts.bodyParams && opts.bodyParams.length > 0) {
    const names = opts.bodyParamNames;
    components.push({
      type: "body",
      parameters: opts.bodyParams.map((p, i) =>
        names && names[i] ? { type: "text", parameter_name: names[i], text: templateParam(p) } : { type: "text", text: templateParam(p) }
      ),
    });
  }
  (opts.buttonUrlParams || []).forEach((p, index) => {
    components.push({ type: "button", sub_type: "url", index: String(index), parameters: [{ type: "text", text: templateParam(p, 128) }] });
  });
  return cloudPost({
    to,
    type: "template",
    template: { name: opts.name, language: { code: opts.lang || cfg.lang }, ...(components.length ? { components } : {}) },
  });
}

/** Free text — Cloud API only delivers inside an open 24h customer-service window. */
export async function sendCloudText(opts: { to: string; message: string }): Promise<WhatsAppSendResult> {
  const to = normalizeWhatsAppTo(opts.to);
  if (!to) return { ok: false, messageId: null, error: "Invalid phone number", provider: "cloud" };
  return cloudPost({ to, type: "text", text: { preview_url: false, body: opts.message } });
}

async function viaMurpati(opts: { to: string; message: string }): Promise<WhatsAppSendResult> {
  try {
    const r = await sendMurpatiText({ to: opts.to, message: opts.message });
    return { ok: r.ok, messageId: r.messageId, error: r.error, provider: "murpati" };
  } catch (err) {
    return { ok: false, messageId: null, error: err instanceof Error ? err.message : "Murpati request failed", provider: "murpati" };
  }
}

// ---------------------------------------------------------------------------
// Public senders
// ---------------------------------------------------------------------------

/**
 * Transactional message: approved template on Cloud, the equivalent free text
 * on Murpati. If Cloud fails and Murpati is configured, Murpati is tried too.
 */
export async function sendTransactional(opts: {
  to: string;
  template: {
    name: string;
    bodyParams: string[];
    buttonUrlParams?: string[];
    lang?: string;
    /** Which loka_* template this is — picks the named-parameter keys when WHATSAPP_TEMPLATE_PARAMS=named. */
    kind?: keyof WhatsAppTemplateNames;
  };
  /** Free-text equivalent (Murpati / fallback). */
  text: string;
}): Promise<WhatsAppSendResult> {
  const provider = resolveWhatsAppProvider();
  if (provider === "none") {
    return { ok: false, messageId: null, error: "WhatsApp is not configured (set WHATSAPP_CLOUD_* or MURPATI_*)", provider: "none" };
  }
  if (provider === "murpati") return viaMurpati({ to: opts.to, message: opts.text });

  const useNamed = templateParamFormat() === "named" && opts.template.kind && opts.template.kind !== "otp";
  const lang =
    opts.template.lang || (opts.template.kind ? await resolveTemplateLanguage(opts.template.kind, opts.template.name) : undefined);
  const cloud = await sendCloudTemplate({
    to: opts.to,
    name: opts.template.name,
    lang,
    bodyParams: opts.template.bodyParams,
    buttonUrlParams: opts.template.buttonUrlParams,
    bodyParamNames: useNamed ? NAMED_PARAM_KEYS[opts.template.kind as keyof WhatsAppTemplateNames] : undefined,
  });
  if (cloud.ok) return cloud;
  console.warn(`[whatsapp] cloud template "${opts.template.name}" failed: ${cloud.error}`);
  if (getMurpatiConfigStatus().configured) {
    const m = await viaMurpati({ to: opts.to, message: opts.text });
    if (m.ok) return m;
    return { ...m, error: `cloud: ${cloud.error} | murpati: ${m.error}` };
  }
  return cloud;
}

/**
 * Free-form text (admin reports, tests). On Cloud this only works inside a
 * 24h window, so a failure falls back to Murpati when available.
 */
export async function sendWhatsAppText(opts: { to: string; message: string }): Promise<WhatsAppSendResult> {
  const provider = resolveWhatsAppProvider();
  if (provider === "none") {
    return { ok: false, messageId: null, error: "WhatsApp is not configured", provider: "none" };
  }
  if (provider === "murpati") return viaMurpati(opts);
  const cloud = await sendCloudText(opts);
  if (cloud.ok) return cloud;
  if (getMurpatiConfigStatus().configured) {
    const m = await viaMurpati(opts);
    if (m.ok) return m;
    return { ...m, error: `cloud: ${cloud.error} | murpati: ${m.error}` };
  }
  return cloud;
}

// ---------------------------------------------------------------------------
// App-level helpers (template parameter order is documented in
// docs/whatsapp-cloud-api.md — keep the two in sync)
// ---------------------------------------------------------------------------

export async function sendOtpMessage(opts: { to: string; code: string; expiryMinutes: number; storeName: string }) {
  const cfg = getWhatsAppCloudConfig();
  const text =
    `Kod pengesahan ${opts.storeName} anda: *${opts.code}*\n` +
    `Sah selama ${opts.expiryMinutes} minit. Jangan kongsi kod ini dengan sesiapa.`;
  // Authentication template: body {{1}} = code, URL button 0 = copy-code param.
  return sendTransactional({
    to: opts.to,
    template: { kind: "otp", name: cfg.templates.otp, bodyParams: [opts.code], buttonUrlParams: [opts.code] },
    text,
  });
}

export async function sendOrderReceivedMessage(opts: {
  to: string;
  name: string;
  shortNo: string;
  receipt: string;
  where: string;
  itemsSummary: string;
  total: string;
  nextStep: string;
  text: string;
}) {
  const cfg = getWhatsAppCloudConfig();
  return sendTransactional({
    to: opts.to,
    template: {
      kind: "orderReceived",
      name: cfg.templates.orderReceived,
      bodyParams: [opts.name, opts.shortNo, opts.receipt, opts.where, opts.itemsSummary, opts.total, opts.nextStep],
    },
    text: opts.text,
  });
}

export async function sendOrderPaidMessage(opts: {
  to: string;
  shortNo: string;
  receipt: string;
  total: string;
  targetLine: string;
  storeName: string;
  text: string;
}) {
  const cfg = getWhatsAppCloudConfig();
  return sendTransactional({
    to: opts.to,
    template: { kind: "orderPaid", name: cfg.templates.orderPaid, bodyParams: [opts.shortNo, opts.receipt, opts.total, opts.targetLine, opts.storeName] },
    text: opts.text,
  });
}

export async function sendOrderReadyMessage(opts: {
  to: string;
  name: string;
  shortNo: string;
  receipt: string;
  storeName: string;
  targetLine: string;
  total: string;
  text: string;
}) {
  const cfg = getWhatsAppCloudConfig();
  return sendTransactional({
    to: opts.to,
    template: {
      kind: "orderReady",
      name: cfg.templates.orderReady,
      bodyParams: [opts.name, opts.shortNo, opts.receipt, opts.storeName, opts.targetLine, opts.total],
    },
    text: opts.text,
  });
}

export async function sendPointsReceiptMessage(opts: {
  to: string;
  name: string;
  purchaseDate: string;
  amount: string;
  pointsLine: string;
  balancePoints: string;
  balanceRm: string;
  expiryDate: string;
  storeName: string;
  text: string;
}) {
  const cfg = getWhatsAppCloudConfig();
  return sendTransactional({
    to: opts.to,
    template: {
      kind: "pointsReceipt",
      name: cfg.templates.pointsReceipt,
      bodyParams: [
        opts.name,
        opts.purchaseDate,
        opts.amount,
        opts.pointsLine,
        opts.balancePoints,
        opts.balanceRm,
        opts.expiryDate,
        opts.storeName,
      ],
    },
    text: opts.text,
  });
}

// ---------------------------------------------------------------------------
// Admin diagnostics
// ---------------------------------------------------------------------------

export async function getWhatsAppCloudPhoneInfo(): Promise<{
  ok: boolean;
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  error: string | null;
}> {
  const cfg = getWhatsAppCloudConfig();
  if (!cfg.configured) return { ok: false, display_phone_number: null, verified_name: null, quality_rating: null, error: "Not configured" };
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${cfg.apiVersion}/${cfg.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${cfg.accessToken}` }, cache: "no-store" }
    );
    const json = (await res.json().catch(() => ({}))) as {
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
      error?: GraphError;
    };
    if (!res.ok || json.error) {
      return { ok: false, display_phone_number: null, verified_name: null, quality_rating: null, error: json.error?.message || `Graph API ${res.status}` };
    }
    return {
      ok: true,
      display_phone_number: json.display_phone_number || null,
      verified_name: json.verified_name || null,
      quality_rating: json.quality_rating || null,
      error: null,
    };
  } catch (err) {
    return { ok: false, display_phone_number: null, verified_name: null, quality_rating: null, error: err instanceof Error ? err.message : "Request failed" };
  }
}
