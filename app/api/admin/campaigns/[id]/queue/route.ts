import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildSegmentRecipients,
  isMissingRelationError,
  normalizeChannel,
  normalizeSegment,
  schemaMissingMessage,
  type CampaignChannel,
  type CampaignSegment,
  type CustomerCampaignRow,
} from "../../helpers";

type CampaignRow = {
  id: string;
  channel: CampaignChannel;
  segment_type: CampaignSegment;
  status: string;
};

type ExistingRecipientRow = {
  customer_id: string | null;
  channel: "whatsapp" | "email";
};

function dedupeKey(customerId: string, channel: "whatsapp" | "email") {
  return `${customerId}::${channel}`;
}

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const campaignId = String(id || "").trim();
  if (!campaignId) {
    return NextResponse.json({ error: "Campaign id required" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: campaignData, error: campaignError } = await supabase
      .from("crm_campaigns")
      .select("id,channel,segment_type,status")
      .eq("id", campaignId)
      .maybeSingle();

    if (campaignError) {
      if (isMissingRelationError(campaignError.message)) {
        return NextResponse.json({ error: schemaMissingMessage() }, { status: 400 });
      }
      return NextResponse.json({ error: campaignError.message }, { status: 500 });
    }

    if (!campaignData) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const campaign = campaignData as CampaignRow;
    const channel = normalizeChannel(campaign.channel);
    const segment = normalizeSegment(campaign.segment_type);
    if (!channel || !segment) {
      return NextResponse.json({ error: "Campaign config invalid" }, { status: 400 });
    }

    const { data: customerData, error: customerError } = await supabase
      .from("customers")
      .select("id,name,phone,email,birth_date,last_order_at,consent_whatsapp,consent_email")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (customerError) {
      if (isMissingRelationError(customerError.message)) {
        return NextResponse.json({ error: schemaMissingMessage() }, { status: 400 });
      }
      return NextResponse.json({ error: customerError.message }, { status: 500 });
    }

    const customers = (customerData || []) as CustomerCampaignRow[];
    const result = buildSegmentRecipients(customers, channel, segment);

    const { data: existingRows, error: existingError } = await supabase
      .from("crm_campaign_recipients")
      .select("customer_id,channel")
      .eq("campaign_id", campaignId)
      .limit(20000);

    if (existingError) {
      if (isMissingRelationError(existingError.message)) {
        return NextResponse.json({ error: schemaMissingMessage() }, { status: 400 });
      }
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const existingKeys = new Set<string>();
    for (const row of (existingRows || []) as ExistingRecipientRow[]) {
      if (!row.customer_id) continue;
      existingKeys.add(dedupeKey(row.customer_id, row.channel));
    }

    const toInsert = result.recipients.filter(row => {
      const key = dedupeKey(row.customer_id, row.channel);
      return !existingKeys.has(key);
    });

    let inserted = 0;
    if (toInsert.length > 0) {
      const chunks: typeof toInsert[] = [];
      const chunkSize = 500;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        chunks.push(toInsert.slice(i, i + chunkSize));
      }

      for (const chunk of chunks) {
        const { error: insertError, data: insertedRows } = await supabase
          .from("crm_campaign_recipients")
          .insert(
            chunk.map(row => ({
              campaign_id: campaignId,
              customer_id: row.customer_id,
              channel: row.channel,
              destination: row.destination,
              consent_snapshot: row.consent_snapshot,
              send_status: "queued",
            }))
          )
          .select("id");

        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }
        inserted += (insertedRows || []).length;
      }
    }

    const nextStatus = inserted > 0 ? "running" : campaign.status;
    if (nextStatus !== campaign.status) {
      await supabase
        .from("crm_campaigns")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", campaignId);
    }

    return NextResponse.json({
      success: true,
      campaign_id: campaignId,
      eligible_recipients: result.recipients.length,
      newly_queued: inserted,
      already_queued: Math.max(result.recipients.length - inserted, 0),
      status: nextStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to queue campaign recipients";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

