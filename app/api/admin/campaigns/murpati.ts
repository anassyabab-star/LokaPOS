type MurpatiSendResult = {
  ok: boolean;
  messageId: string | null;
  error: string | null;
  raw: unknown;
};

function getConfig() {
  const baseUrl = (process.env.MURPATI_BASE_URL || "https://api.murpati.com").replace(/\/+$/, "");
  const apiKey = String(process.env.MURPATI_API_KEY || "").trim();
  const sessionId = String(process.env.MURPATI_SESSION_ID || "").trim();
  return { baseUrl, apiKey, sessionId };
}

export function getMurpatiConfigStatus() {
  const config = getConfig();
  return {
    configured: Boolean(config.apiKey && config.sessionId),
    baseUrl: config.baseUrl,
    hasApiKey: Boolean(config.apiKey),
    hasSessionId: Boolean(config.sessionId),
    sessionId: config.sessionId || null,
  };
}

function readMessageId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const direct = p.message_id || p.messageId || p.id;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const data = p.data;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    const nested = d.message_id || d.messageId || d.id;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }

  return null;
}

function readErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const p = payload as Record<string, unknown>;
  const err = p.error || p.message || p.detail;
  if (typeof err === "string" && err.trim()) return err.trim();
  return fallback;
}

export function normalizeWhatsappNumber(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return "";

  const plus = value.startsWith("+");
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return "";

  if (digits.startsWith("60")) return digits;
  if (digits.startsWith("0")) return `60${digits.slice(1)}`;
  if (plus) return digits;
  return digits;
}

export async function getMurpatiSessionStatus() {
  const config = getConfig();
  if (!config.apiKey || !config.sessionId) {
    return {
      ok: false,
      configured: false,
      status: null as string | null,
      error: "Missing Murpati API config",
    };
  }

  const url = `${config.baseUrl}/v1/sessions/${encodeURIComponent(config.sessionId)}/status`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-API-Key": config.apiKey,
    },
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
    return {
      ok: false,
      configured: true,
      status: null as string | null,
      error: readErrorMessage(json, `Murpati status failed (${response.status})`),
    };
  }

  const payload = json as Record<string, unknown> | null;
  const status =
    typeof payload?.status === "string"
      ? payload.status
      : typeof payload?.session_status === "string"
        ? String(payload.session_status)
        : typeof (payload?.session as Record<string, unknown> | undefined)?.status === "string"
          ? String((payload?.session as Record<string, unknown>).status)
          : "unknown";

  return {
    ok: true,
    configured: true,
    status,
    error: null as string | null,
  };
}

export async function sendMurpatiText(payload: { to: string; message: string }): Promise<MurpatiSendResult> {
  const config = getConfig();
  if (!config.apiKey || !config.sessionId) {
    return {
      ok: false,
      messageId: null,
      error: "Missing Murpati API config",
      raw: null,
    };
  }

  const to = normalizeWhatsappNumber(payload.to);
  if (!to) {
    return {
      ok: false,
      messageId: null,
      error: "Invalid phone number",
      raw: null,
    };
  }

  const url = `${config.baseUrl}/v1/messages/send`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": config.apiKey,
    },
    body: JSON.stringify({
      session_id: config.sessionId,
      to,
      message: payload.message,
    }),
  });

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  const messageId = readMessageId(json);
  if (!response.ok) {
    return {
      ok: false,
      messageId,
      error: readErrorMessage(json, `Murpati send failed (${response.status})`),
      raw: json,
    };
  }

  const payloadObj = json as Record<string, unknown> | null;
  const successFlag =
    typeof payloadObj?.success === "boolean" ? Boolean(payloadObj.success) : true;

  if (!successFlag) {
    return {
      ok: false,
      messageId,
      error: readErrorMessage(json, "Murpati returned unsuccessful response"),
      raw: json,
    };
  }

  return {
    ok: true,
    messageId,
    error: null,
    raw: json,
  };
}

