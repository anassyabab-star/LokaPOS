export type CampaignChannel = "whatsapp" | "email" | "multi";
export type CampaignSegment = "active_30d" | "inactive_60d" | "birthday_month" | "manual";

export type CustomerCampaignRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  last_order_at: string | null;
  consent_whatsapp: boolean | null;
  consent_email: boolean | null;
};

export type CampaignRecipientRow = {
  customer_id: string;
  channel: "whatsapp" | "email";
  destination: string;
  consent_snapshot: boolean;
};

export function isMissingRelationError(message: string | null | undefined) {
  const m = String(message || "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    (m.includes("relation") && m.includes("not found"))
  );
}

export function schemaMissingMessage() {
  return "CRM schema not found. Please run sql/schema_v1_core.sql in Supabase first.";
}

export function normalizeChannel(value: string): CampaignChannel | null {
  if (value === "whatsapp" || value === "email" || value === "multi") return value;
  return null;
}

export function normalizeSegment(value: string): CampaignSegment | null {
  if (
    value === "active_30d" ||
    value === "inactive_60d" ||
    value === "birthday_month" ||
    value === "manual"
  ) {
    return value;
  }
  return null;
}

function isSegmentMatch(customer: CustomerCampaignRow, segment: CampaignSegment, now: Date) {
  const lastOrderAt = customer.last_order_at ? new Date(customer.last_order_at) : null;

  if (segment === "active_30d") {
    if (!lastOrderAt) return false;
    const min = new Date(now);
    min.setDate(min.getDate() - 30);
    return lastOrderAt >= min;
  }

  if (segment === "inactive_60d") {
    if (!lastOrderAt) return true;
    const min = new Date(now);
    min.setDate(min.getDate() - 60);
    return lastOrderAt < min;
  }

  if (segment === "birthday_month") {
    if (!customer.birth_date) return false;
    const birth = new Date(customer.birth_date);
    if (Number.isNaN(birth.getTime())) return false;
    return birth.getUTCMonth() === now.getUTCMonth();
  }

  // manual: recipient list will come from other UI flow in future
  return false;
}

function buildRecipientForChannel(
  customer: CustomerCampaignRow,
  channel: "whatsapp" | "email"
): CampaignRecipientRow | null {
  if (channel === "whatsapp") {
    const destination = String(customer.phone || "").trim();
    if (!destination || !customer.consent_whatsapp) return null;
    return {
      customer_id: customer.id,
      channel: "whatsapp",
      destination,
      consent_snapshot: true,
    };
  }

  const destination = String(customer.email || "").trim().toLowerCase();
  if (!destination || !customer.consent_email) return null;
  return {
    customer_id: customer.id,
    channel: "email",
    destination,
    consent_snapshot: true,
  };
}

export function buildSegmentRecipients(
  customers: CustomerCampaignRow[],
  channel: CampaignChannel,
  segment: CampaignSegment
) {
  const now = new Date();
  const recipients: CampaignRecipientRow[] = [];
  const matchedCustomers: CustomerCampaignRow[] = [];

  for (const customer of customers) {
    if (!isSegmentMatch(customer, segment, now)) continue;
    matchedCustomers.push(customer);

    if (channel === "multi") {
      const whatsappRecipient = buildRecipientForChannel(customer, "whatsapp");
      if (whatsappRecipient) recipients.push(whatsappRecipient);

      const emailRecipient = buildRecipientForChannel(customer, "email");
      if (emailRecipient) recipients.push(emailRecipient);
      continue;
    }

    const recipient = buildRecipientForChannel(customer, channel);
    if (recipient) recipients.push(recipient);
  }

  return {
    matchedCustomers,
    recipients,
  };
}

