import { Resend } from "resend";

type SendEmailPayload = {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
};

type SendEmailResult = {
  ok: boolean;
  messageId: string | null;
  error: string | null;
};

function getResend() {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export function getEmailConfigStatus() {
  return {
    configured: Boolean(process.env.RESEND_API_KEY),
    fromAddress: process.env.EMAIL_FROM || null,
  };
}

export async function sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
  const resend = getResend();
  if (!resend) {
    return { ok: false, messageId: null, error: "RESEND_API_KEY not configured" };
  }

  const from = payload.from || process.env.EMAIL_FROM || "Loka <noreply@lokacafe.my>";
  const to = payload.to.trim().toLowerCase();
  if (!to || !to.includes("@")) {
    return { ok: false, messageId: null, error: "Invalid email address" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: payload.subject,
      html: payload.html,
      ...(payload.replyTo ? { replyTo: payload.replyTo } : {}),
    });

    if (error) {
      return { ok: false, messageId: null, error: error.message };
    }

    return { ok: true, messageId: data?.id || null, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, messageId: null, error: msg };
  }
}
