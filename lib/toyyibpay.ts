export type ToyyibpayConfig = {
  baseUrl: string;
  apiBaseUrl: string;
  paymentPageBaseUrl: string;
  userSecretKey: string;
  categoryCode: string;
  callbackToken: string;
  paymentChannel: string;
  returnUrlDefault: string;
  callbackUrlDefault: string;
};

type CreateBillInput = {
  billName: string;
  billDescription: string;
  amountRm: number;
  billTo: string;
  billEmail?: string | null;
  billPhone?: string | null;
  billExternalReferenceNo: string;
  billReturnUrl: string;
  billCallbackUrl: string;
};

type CreateBillResult = {
  billCode: string;
  paymentUrl: string;
  raw: unknown;
};

function normalizeBaseUrl(raw: string) {
  const value = String(raw || "").trim().replace(/\/+$/, "");
  if (!value) return "";
  return value;
}

function deriveApiBaseUrl(baseUrl: string) {
  if (baseUrl.includes("/index.php/api")) return baseUrl;
  return `${baseUrl}/index.php/api`;
}

function derivePaymentPageBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/index\.php\/api$/, "");
}

function toFormEncoded(body: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    params.set(key, value);
  }
  return params.toString();
}

function readBillCode(payload: unknown): string {
  if (Array.isArray(payload) && payload.length > 0) {
    const first = payload[0] as Record<string, unknown>;
    const code = String(first?.BillCode || first?.billCode || first?.bill_code || "").trim();
    if (code) return code;
  }
  if (payload && typeof payload === "object") {
    const row = payload as Record<string, unknown>;
    const code = String(row.BillCode || row.billCode || row.bill_code || "").trim();
    if (code) return code;
  }
  return "";
}

function readError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const row = payload as Record<string, unknown>;
    const message = String(
      row.error || row.message || row.msg || row.status_message || row.statusMessage || ""
    ).trim();
    if (message) return message;
  }
  if (Array.isArray(payload) && payload.length > 0) {
    return readError(payload[0], fallback);
  }
  return fallback;
}

export function getToyyibpayConfig() {
  const baseRaw = process.env.TOYYIBPAY_BASE_URL || "https://dev.toyyibpay.com";
  const baseUrl = normalizeBaseUrl(baseRaw);
  const apiBaseUrl = deriveApiBaseUrl(baseUrl);
  const paymentPageBaseUrl = normalizeBaseUrl(
    process.env.TOYYIBPAY_PAYMENT_PAGE_BASE_URL || derivePaymentPageBaseUrl(baseUrl)
  );

  const userSecretKey = String(process.env.TOYYIBPAY_USER_SECRET_KEY || "").trim();
  const categoryCode = String(process.env.TOYYIBPAY_CATEGORY_CODE || "").trim();
  const callbackToken = String(process.env.TOYYIBPAY_CALLBACK_TOKEN || "").trim();
  const paymentChannel = String(process.env.TOYYIBPAY_PAYMENT_CHANNEL || "0").trim() || "0";
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")
    .trim()
    .replace(/\/+$/, "");
  const returnUrlDefault = String(
    process.env.TOYYIBPAY_RETURN_URL || `${siteUrl}/customer?tab=orders`
  ).trim();
  const callbackUrlDefault = String(
    process.env.TOYYIBPAY_CALLBACK_URL || `${siteUrl}/api/payments/toyyibpay/callback`
  ).trim();

  const config: ToyyibpayConfig = {
    baseUrl,
    apiBaseUrl,
    paymentPageBaseUrl,
    userSecretKey,
    categoryCode,
    callbackToken,
    paymentChannel,
    returnUrlDefault,
    callbackUrlDefault,
  };

  return config;
}

export function getToyyibpayConfigStatus() {
  const config = getToyyibpayConfig();
  return {
    configured: Boolean(config.userSecretKey && config.categoryCode),
    hasUserSecretKey: Boolean(config.userSecretKey),
    hasCategoryCode: Boolean(config.categoryCode),
    hasCallbackToken: Boolean(config.callbackToken),
    baseUrl: config.baseUrl,
    apiBaseUrl: config.apiBaseUrl,
  };
}

export async function createToyyibBill(input: CreateBillInput): Promise<CreateBillResult> {
  const config = getToyyibpayConfig();
  if (!config.userSecretKey) {
    throw new Error("Missing TOYYIBPAY_USER_SECRET_KEY");
  }
  if (!config.categoryCode) {
    throw new Error("Missing TOYYIBPAY_CATEGORY_CODE");
  }

  const amountCents = Math.max(0, Math.round(Number(input.amountRm || 0) * 100));
  if (amountCents <= 0) {
    throw new Error("Invalid bill amount");
  }

  const payload: Record<string, string> = {
    userSecretKey: config.userSecretKey,
    categoryCode: config.categoryCode,
    billName: input.billName,
    billDescription: input.billDescription,
    billPriceSetting: "1",
    billPayorInfo: "1",
    billAmount: String(amountCents),
    billReturnUrl: input.billReturnUrl,
    billCallbackUrl: input.billCallbackUrl,
    billExternalReferenceNo: input.billExternalReferenceNo,
    billTo: String(input.billTo || "Customer").trim() || "Customer",
    billEmail: String(input.billEmail || "").trim(),
    billPhone: String(input.billPhone || "").trim(),
    billPaymentChannel: config.paymentChannel,
    billChargeToCustomer: "1",
  };

  const response = await fetch(`${config.apiBaseUrl}/createBill`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
    throw new Error(readError(json, `ToyyibPay createBill failed (${response.status})`));
  }

  const billCode = readBillCode(json);
  if (!billCode) {
    throw new Error(readError(json, "ToyyibPay did not return BillCode"));
  }

  return {
    billCode,
    paymentUrl: `${config.paymentPageBaseUrl}/${billCode}`,
    raw: json,
  };
}

export function isToyyibPaidStatus(payload: Record<string, string>) {
  const value = String(payload.status_id || payload.status || payload.payment_status || "")
    .trim()
    .toLowerCase();
  return value === "1" || value === "paid" || value === "success" || value === "successful";
}

export function isToyyibFailedStatus(payload: Record<string, string>) {
  const value = String(payload.status_id || payload.status || payload.payment_status || "")
    .trim()
    .toLowerCase();
  return (
    value === "2" ||
    value === "3" ||
    value === "failed" ||
    value === "fail" ||
    value === "cancelled" ||
    value === "canceled" ||
    value === "rejected"
  );
}
