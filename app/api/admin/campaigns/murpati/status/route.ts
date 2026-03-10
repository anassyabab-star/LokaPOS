import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { getMurpatiConfigStatus, getMurpatiSessionStatus } from "../../murpati";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    const config = getMurpatiConfigStatus();
    if (!config.configured) {
      return NextResponse.json({
        configured: false,
        base_url: config.baseUrl,
        has_api_key: config.hasApiKey,
        has_session_id: config.hasSessionId,
        session_id: config.sessionId,
        session_status: null,
        error: "Set MURPATI_API_KEY and MURPATI_SESSION_ID in .env.local",
      });
    }

    const status = await getMurpatiSessionStatus();
    return NextResponse.json({
      configured: true,
      base_url: config.baseUrl,
      has_api_key: config.hasApiKey,
      has_session_id: config.hasSessionId,
      session_id: config.sessionId,
      session_status: status.status,
      error: status.error,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Murpati status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

