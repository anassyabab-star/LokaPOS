import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildSegmentRecipients,
  isMissingRelationError,
  normalizeChannel,
  normalizeSegment,
  schemaMissingMessage,
  type CustomerCampaignRow,
} from "../helpers";

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const channel = normalizeChannel(String(searchParams.get("channel") || ""));
  const segment = normalizeSegment(String(searchParams.get("segment_type") || ""));
  const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit") || 30)));

  if (!channel) {
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  }

  if (!segment) {
    return NextResponse.json({ error: "Invalid segment type" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("customers")
      .select("id,name,phone,email,birth_date,last_order_at,consent_whatsapp,consent_email")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) {
      if (isMissingRelationError(error.message)) {
        return NextResponse.json({ error: schemaMissingMessage() }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const customers = (data || []) as CustomerCampaignRow[];
    const result = buildSegmentRecipients(customers, channel, segment);

    const byChannel = result.recipients.reduce(
      (acc, row) => {
        if (row.channel === "whatsapp") acc.whatsapp += 1;
        if (row.channel === "email") acc.email += 1;
        return acc;
      },
      { whatsapp: 0, email: 0 }
    );

    const preview = result.recipients.slice(0, limit).map(recipient => {
      const customer = result.matchedCustomers.find(c => c.id === recipient.customer_id);
      return {
        customer_id: recipient.customer_id,
        customer_name: customer?.name || "Customer",
        channel: recipient.channel,
        destination: recipient.destination,
      };
    });

    return NextResponse.json({
      segment_type: segment,
      channel,
      considered_customers: customers.length,
      matched_customers: result.matchedCustomers.length,
      eligible_recipients: result.recipients.length,
      by_channel: byChannel,
      preview,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to preview segment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

