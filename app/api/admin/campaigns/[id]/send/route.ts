import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isMissingRelationError, schemaMissingMessage } from "../../helpers";
import { sendMurpatiText } from "../../murpati";

type CampaignRow = {
  id: string;
  name: string;
  message_template: string;
  status: string;
};

type RecipientRow = {
  id: string;
  customer_id: string | null;
  channel: "whatsapp" | "email";
  destination: string;
  send_status: "queued" | "sent" | "failed" | "skipped";
};

type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
};

function applyTemplate(template: string, customer: CustomerRow | undefined, destination: string) {
  const fullName = String(customer?.name || "Customer").trim() || "Customer";
  const firstName = fullName.split(" ")[0] || fullName;
  return template
    .replaceAll("{{name}}", fullName)
    .replaceAll("{{first_name}}", firstName)
    .replaceAll("{{phone}}", String(customer?.phone || destination || ""));
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const campaignId = String(id || "").trim();
  if (!campaignId) {
    return NextResponse.json({ error: "Campaign id required" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const batchLimit = Math.max(1, Math.min(100, Number(body?.limit || process.env.MURPATI_BATCH_LIMIT || 50)));

  try {
    const supabase = createSupabaseAdminClient();
    const { data: campaignData, error: campaignError } = await supabase
      .from("crm_campaigns")
      .select("id,name,message_template,status")
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
    const { data: recipientData, error: recipientError } = await supabase
      .from("crm_campaign_recipients")
      .select("id,customer_id,channel,destination,send_status")
      .eq("campaign_id", campaignId)
      .eq("send_status", "queued")
      .eq("channel", "whatsapp")
      .order("created_at", { ascending: true })
      .limit(batchLimit);

    if (recipientError) {
      if (isMissingRelationError(recipientError.message)) {
        return NextResponse.json({ error: schemaMissingMessage() }, { status: 400 });
      }
      return NextResponse.json({ error: recipientError.message }, { status: 500 });
    }

    const recipients = (recipientData || []) as RecipientRow[];
    if (recipients.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        sent: 0,
        failed: 0,
        message: "No queued WhatsApp recipients.",
      });
    }

    const customerIds = Array.from(
      new Set(recipients.map(row => row.customer_id).filter((v): v is string => Boolean(v)))
    );

    const customerMap = new Map<string, CustomerRow>();
    if (customerIds.length > 0) {
      const { data: customerRows } = await supabase
        .from("customers")
        .select("id,name,phone,email")
        .in("id", customerIds);
      for (const row of (customerRows || []) as CustomerRow[]) {
        customerMap.set(row.id, row);
      }
    }

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      const customer = recipient.customer_id ? customerMap.get(recipient.customer_id) : undefined;
      const finalMessage = applyTemplate(campaign.message_template, customer, recipient.destination);
      const result = await sendMurpatiText({
        to: recipient.destination,
        message: finalMessage,
      });

      if (result.ok) {
        sent += 1;
        await supabase
          .from("crm_campaign_recipients")
          .update({
            send_status: "sent",
            provider_message_id: result.messageId,
            error_message: null,
            sent_at: new Date().toISOString(),
          })
          .eq("id", recipient.id);
      } else {
        failed += 1;
        await supabase
          .from("crm_campaign_recipients")
          .update({
            send_status: "failed",
            error_message: result.error || "Send failed",
            sent_at: null,
          })
          .eq("id", recipient.id);
      }
    }

    const { count: stillQueuedCount } = await supabase
      .from("crm_campaign_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("send_status", "queued");

    const nextStatus = Number(stillQueuedCount || 0) > 0 ? "running" : "sent";
    await supabase
      .from("crm_campaigns")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", campaignId);

    return NextResponse.json({
      success: true,
      processed: recipients.length,
      sent,
      failed,
      remaining_queued: Number(stillQueuedCount || 0),
      campaign_status: nextStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send campaign";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

