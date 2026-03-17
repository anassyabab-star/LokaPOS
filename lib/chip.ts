// CHIP Collect Payment Gateway integration
// Docs: https://docs.chip-in.asia

const CHIP_API_BASE = "https://gate.chip-in.asia/api/v1";

export function getChipConfig() {
  const brandId = String(process.env.CHIP_BRAND_ID || "").trim();
  const secretKey = String(process.env.CHIP_SECRET_KEY || "").trim();
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");

  return {
    brandId,
    secretKey,
    siteUrl,
    callbackUrl: `${siteUrl}/api/payments/chip/callback`,
    successUrl: `${siteUrl}/customer?tab=orders`,
    failureUrl: `${siteUrl}/customer?tab=cart`,
    configured: Boolean(brandId && secretKey),
  };
}

export function getChipConfigStatus() {
  const config = getChipConfig();
  return {
    configured: config.configured,
    hasBrandId: Boolean(config.brandId),
    hasSecretKey: Boolean(config.secretKey),
  };
}

type CreatePurchaseParams = {
  amount: number; // in RM (e.g. 10.50)
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
};

type ChipPurchaseResponse = {
  id: string;
  checkout_url: string;
  status: string;
};

export async function createChipPurchase(params: CreatePurchaseParams): Promise<{
  purchaseId: string;
  checkoutUrl: string;
}> {
  const config = getChipConfig();
  if (!config.configured) {
    throw new Error("CHIP is not configured. Set CHIP_BRAND_ID and CHIP_SECRET_KEY.");
  }

  const amountInCents = Math.round(params.amount * 100);

  const purchase: Record<string, unknown> = {
    currency: "MYR",
    products: [
      {
        name: `Order ${params.orderNumber}`,
        price: amountInCents,
      },
    ],
    success_redirect: `${config.successUrl}&order_id=${params.orderId}`,
    failure_redirect: config.failureUrl,
    send_receipt: true,
    reference: params.orderId,
  };

  // CHIP callback only works on port 80/443
  const isLocalhost = config.siteUrl.includes("localhost") || config.siteUrl.includes("127.0.0.1");
  if (!isLocalhost) {
    purchase.success_callback = config.callbackUrl;
  }

  // Client info
  const client: Record<string, string> = {};
  if (params.customerEmail) client.email = params.customerEmail;
  if (params.customerName) client.full_name = params.customerName;
  if (params.customerPhone) client.phone = params.customerPhone;

  const requestBody: Record<string, unknown> = {
    brand_id: config.brandId,
    purchase,
  };
  if (Object.keys(client).length > 0) requestBody.client = client;

  const res = await fetch(`${CHIP_API_BASE}/purchases/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.secretKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const errMsg = typeof errData === "object" && errData !== null
      ? JSON.stringify(errData)
      : String(errData);
    throw new Error(`CHIP API error (${res.status}): ${errMsg}`);
  }

  const data = (await res.json()) as ChipPurchaseResponse;

  if (!data.id || !data.checkout_url) {
    throw new Error("CHIP returned invalid response: missing id or checkout_url");
  }

  return {
    purchaseId: data.id,
    checkoutUrl: data.checkout_url,
  };
}

// Verify a purchase status
export async function verifyChipPurchase(purchaseId: string): Promise<{
  id: string;
  status: string;
  reference: string | null;
  is_paid: boolean;
}> {
  const config = getChipConfig();

  const res = await fetch(`${CHIP_API_BASE}/purchases/${purchaseId}/`, {
    headers: {
      "Authorization": `Bearer ${config.secretKey}`,
    },
  });

  if (!res.ok) {
    throw new Error(`CHIP verify error (${res.status})`);
  }

  const data = await res.json();
  return {
    id: data.id,
    status: data.status,
    reference: data.reference || null,
    is_paid: data.status === "paid",
  };
}
