import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { sendMurpatiText } from "../../murpati";

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const to = String(body?.to || "").trim();
    const message = String(body?.message || "").trim();

    if (!to) {
      return NextResponse.json({ error: "Recipient number is required" }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const result = await sendMurpatiText({ to, message });
    if (!result.ok) {
      return NextResponse.json({ error: result.error || "Send failed" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message_id: result.messageId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send test message";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

