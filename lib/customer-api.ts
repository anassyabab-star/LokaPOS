import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const LOYALTY_POINTS_EXPIRY_DAYS = 365;
export const LOYALTY_EXPIRING_SOON_DAYS = 30;

type CustomerApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

type CustomerDbRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  consent_whatsapp: boolean | null;
  consent_email: boolean | null;
  consent_whatsapp_at: string | null;
  consent_email_at: string | null;
  consent_source: string | null;
  total_orders: number | null;
  total_spend: number | null;
  last_order_at: string | null;
  created_at: string;
  updated_at: string | null;
};

type LoyaltyLedgerRow = {
  id: string;
  order_id: string | null;
  entry_type: "earn" | "redeem" | "adjust";
  points_change: number | null;
  note: string | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  receipt_number: string | null;
};

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }
  return value as Record<string, unknown>;
}

function pickUserName(user: User) {
  const meta = asRecord(user.user_metadata);
  const candidates = [
    meta.full_name,
    meta.name,
    user.email ? user.email.split("@")[0] : null,
    "Customer",
  ];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value) return value;
  }
  return "Customer";
}

function pickUserPhone(user: User) {
  const meta = asRecord(user.user_metadata);
  const raw = String(meta.phone || meta.phone_number || "").trim();
  return raw ? normalizeCustomerPhone(raw) : null;
}

export function customerApiError(
  status: number,
  message: string,
  code: CustomerApiErrorCode,
  details: unknown = null
) {
  return NextResponse.json({ error: message, code, details }, { status });
}

export function normalizeCustomerPhone(value: string) {
  return value.replace(/[^\d+]/g, "").trim();
}

export function normalizeCustomerEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isMissingRelationError(message: string | null | undefined) {
  const text = String(message || "").toLowerCase();
  return text.includes("does not exist") || text.includes("schema cache");
}

export function isUniqueConstraintError(message: string | null | undefined) {
  const text = String(message || "").toLowerCase();
  return text.includes("duplicate key") || text.includes("unique");
}

export function mapCustomerResponse(customer: CustomerDbRow) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    birth_date: customer.birth_date,
    consent_whatsapp: Boolean(customer.consent_whatsapp),
    consent_email: Boolean(customer.consent_email),
    consent_whatsapp_at: customer.consent_whatsapp_at,
    consent_email_at: customer.consent_email_at,
    consent_source: customer.consent_source,
    total_orders: Number(customer.total_orders || 0),
    total_spend: Number(customer.total_spend || 0),
    last_order_at: customer.last_order_at,
    created_at: customer.created_at,
    updated_at: customer.updated_at,
  };
}

async function fetchCustomerById(id: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id,name,phone,email,birth_date,consent_whatsapp,consent_email,consent_whatsapp_at,consent_email_at,consent_source,total_orders,total_spend,last_order_at,created_at,updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data || null) as CustomerDbRow | null;
}

async function fetchCustomerByEmail(email: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id,name,phone,email,birth_date,consent_whatsapp,consent_email,consent_whatsapp_at,consent_email_at,consent_source,total_orders,total_spend,last_order_at,created_at,updated_at"
    )
    .eq("email", email)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data || null) as CustomerDbRow | null;
}

async function fetchCustomerByPhone(phone: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id,name,phone,email,birth_date,consent_whatsapp,consent_email,consent_whatsapp_at,consent_email_at,consent_source,total_orders,total_spend,last_order_at,created_at,updated_at"
    )
    .eq("phone", phone)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data || null) as CustomerDbRow | null;
}

export async function resolveOrCreateCustomerForUser(
  user: User,
  options?: { allowCreate?: boolean }
) {
  const allowCreate = options?.allowCreate ?? true;
  const meta = asRecord(user.user_metadata);
  const metadataCustomerId = String(meta.customer_id || "").trim();
  const email = user.email ? normalizeCustomerEmail(user.email) : null;
  const phone = pickUserPhone(user);

  let customer: CustomerDbRow | null = null;

  if (metadataCustomerId) {
    customer = await fetchCustomerById(metadataCustomerId);
  }

  if (!customer && email) {
    customer = await fetchCustomerByEmail(email);
  }

  if (!customer && phone) {
    customer = await fetchCustomerByPhone(phone);
  }

  if (!customer && allowCreate) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("customers")
      .insert([
        {
          name: pickUserName(user),
          phone,
          email,
          consent_whatsapp: false,
          consent_email: false,
          total_orders: 0,
          total_spend: 0,
          consent_source: "customer_app",
        },
      ])
      .select(
        "id,name,phone,email,birth_date,consent_whatsapp,consent_email,consent_whatsapp_at,consent_email_at,consent_source,total_orders,total_spend,last_order_at,created_at,updated_at"
      )
      .single();

    if (error) {
      if (!isUniqueConstraintError(error.message)) {
        throw new Error(error.message);
      }
      if (email) {
        customer = await fetchCustomerByEmail(email);
      }
      if (!customer && phone) {
        customer = await fetchCustomerByPhone(phone);
      }
    } else {
      customer = data as CustomerDbRow;
    }
  }

  if (customer && metadataCustomerId !== customer.id) {
    const supabase = createSupabaseAdminClient();
    const mergedMeta = { ...meta, customer_id: customer.id };
    await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: mergedMeta,
    });
  }

  return customer;
}

export function calculateLoyaltySnapshot(rows: LoyaltyLedgerRow[]) {
  const nowMs = Date.now();
  const expiryCutoffMs = nowMs - LOYALTY_POINTS_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const expiringSoonCutoffMs =
    nowMs - (LOYALTY_POINTS_EXPIRY_DAYS - LOYALTY_EXPIRING_SOON_DAYS) * 24 * 60 * 60 * 1000;
  const lots: Array<{ remaining: number; createdAtMs: number }> = [];

  for (const row of rows) {
    const change = Number(row.points_change || 0);
    const createdAtMs = new Date(row.created_at).getTime();
    if (!Number.isFinite(createdAtMs)) continue;

    if (change > 0) {
      lots.push({ remaining: change, createdAtMs });
      continue;
    }

    if (change < 0) {
      let redeem = Math.abs(change);
      while (redeem > 0 && lots.length > 0) {
        const lot = lots[0];
        const used = Math.min(lot.remaining, redeem);
        lot.remaining -= used;
        redeem -= used;
        if (lot.remaining <= 0) lots.shift();
      }
    }
  }

  let pointsAvailable = 0;
  let expiringPoints30d = 0;
  for (const lot of lots) {
    if (lot.createdAtMs < expiryCutoffMs) continue;
    pointsAvailable += lot.remaining;
    if (lot.createdAtMs <= expiringSoonCutoffMs) {
      expiringPoints30d += lot.remaining;
    }
  }

  return {
    pointsAvailable,
    expiringPoints30d,
  };
}

export async function loadCustomerLoyalty(customerId: string, historyLimit = 100) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("loyalty_ledger")
    .select("id,order_id,entry_type,points_change,note,created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (error) {
    if (isMissingRelationError(error.message)) {
      return {
        points_available: 0,
        expiring_points_30d: 0,
        history: [] as Array<{
          id: string;
          order_id: string | null;
          receipt_number: string | null;
          entry_type: "earn" | "redeem" | "adjust";
          points_change: number;
          note: string | null;
          created_at: string;
        }>,
      };
    }
    throw new Error(error.message);
  }

  const rows = (data || []) as LoyaltyLedgerRow[];
  const snapshot = calculateLoyaltySnapshot(rows);

  const historyRows = rows.slice(-historyLimit).reverse();
  const orderIds = Array.from(
    new Set(historyRows.map(row => row.order_id).filter((id): id is string => Boolean(id)))
  );
  const receiptByOrderId = new Map<string, string>();

  if (orderIds.length > 0) {
    const { data: orderRows, error: ordersError } = await supabase
      .from("orders")
      .select("id,receipt_number")
      .in("id", orderIds);

    if (ordersError) {
      throw new Error(ordersError.message);
    }

    for (const row of (orderRows || []) as OrderRow[]) {
      receiptByOrderId.set(row.id, row.receipt_number || row.id.slice(0, 8));
    }
  }

  return {
    points_available: snapshot.pointsAvailable,
    expiring_points_30d: snapshot.expiringPoints30d,
    history: historyRows.map(row => ({
      id: row.id,
      order_id: row.order_id,
      receipt_number: row.order_id ? receiptByOrderId.get(row.order_id) || null : null,
      entry_type: row.entry_type,
      points_change: Number(row.points_change || 0),
      note: row.note,
      created_at: row.created_at,
    })),
  };
}

