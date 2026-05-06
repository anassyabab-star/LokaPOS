import { createHmac } from "crypto";

export type BillplzConfig = {
  baseUrl: string;
  apiBaseUrl: string;
  apiKey: string;
  collectionId: string;
  xSignatureKey: string;
  enforceXSignature: boolean;
  callbackToken: string;
  returnUrlDefault: string;
  callbackUrlDefault: string;
  autoSubmit: boolean;
};

type CreateBillplzInput = {
  name: string;
  description: string;
  amountRm: number;
  email?: string | null;
  mobile?: string | null;
  callbackUrl: string;
  redirectUrl: string;
  orderId: string;
};

type CreateBillplzResult = {
  billId: string;
  paymentUrl: string;
  raw: unknown;
};

function normalizeBaseUrl(raw: string) {
  return String(raw || "").trim().replace(/\/+$/, "");
}

function toFormEncoded(body: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    params.set(key, value);
  }
  return params.toString();
}

function readString(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = String(payload[key] || "").trim();
    if (value) return value;
  }
  return "";
}

function stringifyUnknownError(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    const parts = value.map(stringifyUnknownError).filter(Boolean);
    return parts.join(", ");
  }

  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    const direct =
      stringifyUnknownError(row.message) ||
      stringifyUnknownError(row.error) ||
      stringifyUnknownError(row.msg) ||
      stringifyUnknownError(row.description);
    if (direct) return direct;

    const fields = Object.entries(row)
      .map(([key, nested]) => {
        const nestedText = stringifyUnknownError(nested);
        return nestedText ? `${key}: ${nestedText}` : "";
      })
      .filter(Boolean);
    return fields.join(" | ");
  }

  return String(value).trim();
}

export function getBillplzConfig() {
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")
    .trim()
    .replace(/\/+$/, "");
  const baseUrl = normalizeBaseUrl(process.env.BILLPLZ_BASE_URL || "https://www.billplz-sandbox.com");
  const apiBaseUrl = `${baseUrl}/api/v3`;
  const apiKey = String(process.env.BILLPLZ_API_KEY || "").trim();
  const collectionId = String(process.env.BILLPLZ_COLLECTION_ID || "").trim();
  const xSignatureKey = String(process.env.BILLPLZ_X_SIGNATURE_KEY || "").trim();
  const enforceXSignature =
    String(process.env.BILLPLZ_ENFORCE_X_SIGNATURE || "false").trim().toLowerCase() === "true";
  const callbackToken = String(process.env.BILLPLZ_CALLBACK_TOKEN || "").trim();
  const returnUrlDefault = String(process.env.BILLPLZ_RETURN_URL || `${siteUrl}/customer?tab=orders`).trim();
  const callbackUrlDefault = String(
    process.env.BILLPLZ_CALLBACK_URL || `${siteUrl}/api/payments/billplz/callback`
  ).trim();
  const autoSubmit = String(process.env.BILLPLZ_AUTO_SUBMIT || "false").trim().toLowerCase() === "true";

  const config: BillplzConfig = {
    baseUrl,
    apiBaseUrl,
    apiKey,
    collectionId,
    xSignatureKey,
    enforceXSignature,
    callbackToken,
    returnUrlDefault,
    callbackUrlDefault,
    autoSubmit,
  };

  return config;
}

export function getBillplzConfigStatus() {
  const config = getBillplzConfig();
  return {
    configured: Boolean(config.apiKey && config.collectionId),
    hasApiKey: Boolean(config.apiKey),
    hasCollectionId: Boolean(config.collectionId),
    hasXSignatureKey: Boolean(config.xSignatureKey),
    enforceXSignature: config.enforceXSignature,
    hasCallbackToken: Boolean(config.callbackToken),
    baseUrl: config.baseUrl,
    apiBaseUrl: config.apiBaseUrl,
  };
}

function basicAuthHeader(apiKey: string) {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

function parseBillResponse(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  const id = readString(row, ["id", "bill_id", "billId"]);
  const url = readString(row, ["url", "payment_url", "paymentUrl"]);
  if (!id || !url) return null;
  return { id, url };
}

function readError(payload: unknown, fallback: string) {
  return stringifyUnknownError(payload) || fallback;
}

export async function createBillplzBill(input: CreateBillplzInput): Promise<CreateBillplzResult> {
  const config = getBillplzConfig();
  if (!config.apiKey) throw new Error("Missing BILLPLZ_API_KEY");
  if (!config.collectionId) throw new Error("Missing BILLPLZ_COLLECTION_ID");

  const amountCents = Math.max(0, Math.round(Number(input.amountRm || 0) * 100));
  if (amountCents <= 0) throw new Error("Invalid bill amount");

  const payload: Record<string, string> = {
    collection_id: config.collectionId,
    email: String(input.email || "").trim(),
    mobile: String(input.mobile || "").trim(),
    name: String(input.name || "Customer").trim() || "Customer",
    amount: String(amountCents),
    description: String(input.description || "Order payment").trim() || "Order payment",
    callback_url: input.callbackUrl,
    redirect_url: input.redirectUrl,
    reference_1_label: "Order ID",
    reference_1: input.orderId,
  };

  const response = await fetch(`${config.apiBaseUrl}/bills`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(config.apiKey),
    },
    body: toFormEncoded(payload),
    cache: "no-store",
  });

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (!response.ok) {
    throw new Error(readError(json, `Billplz create bill failed (${response.status})`));
  }

  const parsed = parseBillResponse(json);
  if (!parsed) {
    throw new Error(readError(json, "Billplz response missing bill id/url"));
  }

  const paymentUrl = config.autoSubmit
    ? `${parsed.url}${parsed.url.includes("?") ? "&" : "?"}auto_submit=true`
    : parsed.url;

  return {
    billId: parsed.id,
    paymentUrl,
    raw: json,
  };
}

function canonicalSignatureSource(payload: Record<string, string>) {
  const pairs = Object.entries(payload)
    .filter(([key]) => key !== "x_signature")
    .map(([key, value]) => [key, value] as const)
    .sort((a, b) => a[0].localeCompare(b[0], "en", { sensitivity: "base" }));
  return pairs.map(([key, value]) => `${key}${value}`).join("|");
}

export function verifyBillplzXSignature(payload: Record<string, string>) {
  const config = getBillplzConfig();
  const provided = String(payload.x_signature || "").trim();
  if (!config.xSignatureKey || !provided) {
    return { verified: false, skipped: true, reason: "Missing signature key or payload signature" };
  }
  const source = canonicalSignatureSource(payload);
  const expected = createHmac("sha256", config.xSignatureKey).update(source).digest("hex");
  return {
    verified: expected === provided,
    skipped: false,
    reason: expected === provided ? null : "X signature mismatch",
    expected,
    provided,
  };
}

export function isBillplzPaid(payload: Record<string, string>) {
  const paid = String(payload.paid || payload["billplz[paid]"] || "").trim().toLowerCase();
  const state = String(payload.state || payload["billplz[state]"] || "").trim().toLowerCase();
  const tx = String(
    payload.transaction_status || payload["billplz[transaction_status]"] || ""
  ).trim().toLowerCase();
  return paid === "true" || state === "paid" || tx === "completed";
}

export function isBillplzFailed(payload: Record<string, string>) {
  const paid = String(payload.paid || payload["billplz[paid]"] || "").trim().toLowerCase();
  const state = String(payload.state || payload["billplz[state]"] || "").trim().toLowerCase();
  const tx = String(
    payload.transaction_status || payload["billplz[transaction_status]"] || ""
  ).trim().toLowerCase();
  return paid === "false" && (state === "failed" || tx === "failed");
}
