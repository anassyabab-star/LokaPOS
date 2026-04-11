import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  isMissingRelationError,
  normalizeChannel,
  normalizeSegment,
  schemaMissingMessage,
  type CampaignChannel,
  type CampaignSegment,
} from "./helpers";

type CampaignRow = {
  id: string;
  name: string;
  channel: CampaignChannel;
  segment_type: CampaignSegment;
  message_template: string;
  status: string;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
};

type RecipientStatusRow = {
  campaign_id: string;
  send_status: string;
};

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("crm_campaigns")
      .select("id,name,channel,segment_type,message_template,status,scheduled_at,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      if (isMissingRelationError(error.message)) {
        return NextResponse.json({ error: schemaMissingMessage() }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const campaigns = (data || []) as CampaignRow[];
    const campaignIds = campaigns.map(row => row.id);

    const countsByCampaign = new Map<
      string,
      { queued: number; sent: number; failed: number; skipped: number; total: number }
    >();

    if (campaignIds.length > 0) {
      const { data: recipientRows, error: recipientError } = await supabase
        .from("crm_campaign_recipients")
        .select("campaign_id,send_status")
        .in("campaign_id", campaignIds)
        .limit(5000);

      if (recipientError) {
        if (isMissingRelationError(recipientError.message)) {
          return NextResponse.json({ error: schemaMissingMessage() }, { status: 400 });
        }
        return NextResponse.json({ error: recipientError.message }, { status: 500 });
      }

      for (const row of (recipientRows || []) as RecipientStatusRow[]) {
        const current = countsByCampaign.get(row.campaign_id) || {
          queued: 0, sent: 0, failed: 0, skipped: 0, total: 0,
        };
        current.total += 1;
        if (row.send_status === "queued") current.queued += 1;
        if (row.send_status === "sent") current.sent += 1;
        if (row.send_status === "failed") current.failed += 1;
        if (row.send_status === "skipped") current.skipped += 1;
        countsByCampaign.set(row.campaign_id, current);
      }
    }

    return NextResponse.json({
      campaigns: campaigns.map(row => ({
        ...row,
        counts: countsByCampaign.get(row.id) || {
          queued: 0,
          sent: 0,
          failed: 0,
          skipped: 0,
          total: 0,
        },
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load campaigns";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const name = String(body?.name || "").trim();
    const messageTemplate = String(body?.message_template || "").trim();
    const channel = normalizeChannel(String(body?.channel || ""));
    const segmentType = normalizeSegment(String(body?.segment_type || ""));
    const rawSchedule = String(body?.scheduled_at || "").trim();
    const scheduledAt =
      rawSchedule && !Number.isNaN(new Date(rawSchedule).getTime())
        ? new Date(rawSchedule).toISOString()
        : null;

    if (!name) {
      return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });
    }
    if (!messageTemplate) {
      return NextResponse.json({ error: "Message template is required" }, { status: 400 });
    }
    if (!channel) {
      return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
    }
    if (!segmentType) {
      return NextResponse.json({ error: "Invalid segment type" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("crm_campaigns")
      .insert([
        {
          name,
          channel,
          segment_type: segmentType,
          message_template: messageTemplate,
          status: scheduledAt ? "scheduled" : "draft",
          scheduled_at: scheduledAt,
          created_by: auth.user.id,
        },
      ])
      .select("id,name,channel,segment_type,message_template,status,scheduled_at,created_at,updated_at")
      .single();

    if (error) {
      if (isMissingRelationError(error.message)) {
        return NextResponse.json({ error: schemaMissingMessage() }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      campaign: data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create campaign";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

