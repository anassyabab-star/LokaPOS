import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { getMurpatiConfigStatus, getMurpatiSessionStatus } from "../../campaigns/murpati";
import { getToyyibpayConfigStatus } from "@/lib/toyyibpay";
import { getBillplzConfigStatus } from "@/lib/billplz";

type IntegrationCheck = {
  key: string;
  label: string;
  ok: boolean;
};

type IntegrationSummary = {
  id: string;
  name: string;
  category: "messaging" | "payment" | "email" | "system";
  configured: boolean;
  healthy: boolean;
  status: string;
  checks: IntegrationCheck[];
  hint?: string | null;
};

function normalizePaymentProvider() {
  const value = String(process.env.PAYMENT_PROVIDER || "").trim().toLowerCase();
  if (value === "toyyibpay" || value === "billplz") return value;

  const billplz = getBillplzConfigStatus();
  const toyyib = getToyyibpayConfigStatus();
  if (billplz.configured && !toyyib.configured) return "billplz";
  if (toyyib.configured && !billplz.configured) return "toyyibpay";
  if (billplz.configured && toyyib.configured) return "billplz";
  return "toyyibpay";
}

function buildPaymentGatewaySummary(activeProvider: "toyyibpay" | "billplz") {
  const toyyib = getToyyibpayConfigStatus();
  const billplz = getBillplzConfigStatus();
  const activeConfigured = activeProvider === "toyyibpay" ? toyyib.configured : billplz.configured;
  const checks: IntegrationCheck[] = [
    {
      key: "provider",
      label: `Active Provider (${activeProvider})`,
      ok: true,
    },
    {
      key: "toyyibpay",
      label: "ToyyibPay keys",
      ok: toyyib.configured,
    },
    {
      key: "billplz",
      label: "Billplz keys",
      ok: billplz.configured,
    },
  ];

  return {
    activeProvider,
    toyyib,
    billplz,
    summary: {
      id: "payment-gateway",
      name: "Payment Gateway Router",
      category: "payment" as const,
      configured: activeConfigured,
      healthy: activeConfigured,
      status: activeConfigured ? `Active: ${activeProvider}` : `Active ${activeProvider} not configured`,
      checks,
      hint: activeConfigured
        ? "Routing is ready."
        : "Set required env for active provider before enabling FPX payments.",
    },
  };
}

function buildEmailSummary(): IntegrationSummary {
  const hasResend = Boolean(String(process.env.RESEND_API_KEY || "").trim());
  const hasSmtp =
    Boolean(String(process.env.SMTP_HOST || "").trim()) &&
    Boolean(String(process.env.SMTP_USER || "").trim()) &&
    Boolean(String(process.env.SMTP_PASS || "").trim());
  const configured = hasResend || hasSmtp;
  return {
    id: "email",
    name: "Email Provider",
    category: "email",
    configured,
    healthy: configured,
    status: configured ? (hasResend ? "Configured (Resend)" : "Configured (SMTP)") : "Not configured",
    checks: [
      { key: "resend", label: "Resend API Key", ok: hasResend },
      { key: "smtp", label: "SMTP Host/User/Pass", ok: hasSmtp },
    ],
    hint: configured
      ? "Email campaigns can be enabled when sender/domain is verified."
      : "Optional for now. Configure before enabling email blast.",
  };
}

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    const activeProvider = normalizePaymentProvider();
    const payment = buildPaymentGatewaySummary(activeProvider);
    const email = buildEmailSummary();

    const murpatiConfig = getMurpatiConfigStatus();
    let murpatiSessionStatus: string | null = null;
    let murpatiError: string | null = null;
    let murpatiConnected = false;

    if (murpatiConfig.configured) {
      try {
        const session = await getMurpatiSessionStatus();
        murpatiSessionStatus = session.status;
        murpatiError = session.error;
        murpatiConnected = Boolean(session.ok) && String(session.status || "").toLowerCase() === "connected";
      } catch (error) {
        murpatiError = error instanceof Error ? error.message : "Failed to fetch session status";
      }
    } else {
      murpatiError = "Set MURPATI_API_KEY and MURPATI_SESSION_ID";
    }

    const murpati: IntegrationSummary = {
      id: "murpati",
      name: "Murpati WhatsApp",
      category: "messaging",
      configured: murpatiConfig.configured,
      healthy: murpatiConfig.configured && murpatiConnected,
      status: murpatiConnected
        ? "Connected"
        : murpatiConfig.configured
          ? `Session ${murpatiSessionStatus || "unknown"}`
          : "Not configured",
      checks: [
        { key: "apiKey", label: "API Key", ok: murpatiConfig.hasApiKey },
        { key: "sessionId", label: "Session ID", ok: murpatiConfig.hasSessionId },
        { key: "sessionConnected", label: "Session Connected", ok: murpatiConnected },
      ],
      hint: murpatiError || null,
    };

    const integrations: IntegrationSummary[] = [
      payment.summary,
      murpati,
      {
        id: "toyyibpay",
        name: "ToyyibPay",
        category: "payment",
        configured: payment.toyyib.configured,
        healthy: payment.toyyib.configured,
        status: payment.toyyib.configured ? "Configured" : "Not configured",
        checks: [
          { key: "userSecretKey", label: "User Secret Key", ok: payment.toyyib.hasUserSecretKey },
          { key: "categoryCode", label: "Category Code", ok: payment.toyyib.hasCategoryCode },
          { key: "callbackToken", label: "Callback Token (optional)", ok: payment.toyyib.hasCallbackToken },
        ],
        hint: payment.toyyib.configured ? null : "Set TOYYIBPAY_USER_SECRET_KEY and TOYYIBPAY_CATEGORY_CODE",
      },
      {
        id: "billplz",
        name: "Billplz",
        category: "payment",
        configured: payment.billplz.configured,
        healthy: payment.billplz.configured,
        status: payment.billplz.configured ? "Configured" : "Not configured",
        checks: [
          { key: "apiKey", label: "API Key", ok: payment.billplz.hasApiKey },
          { key: "collectionId", label: "Collection ID", ok: payment.billplz.hasCollectionId },
          {
            key: "xSignature",
            label: "X Signature Key (recommended)",
            ok: payment.billplz.hasXSignatureKey,
          },
        ],
        hint: payment.billplz.configured ? null : "Set BILLPLZ_API_KEY and BILLPLZ_COLLECTION_ID",
      },
      email,
    ];

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      payment_provider_active: activeProvider,
      integrations,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load integration status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
