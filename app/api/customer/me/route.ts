import { NextResponse } from "next/server";
import { requireCustomerApi } from "@/lib/customer-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  customerApiError,
  isUniqueConstraintError,
  mapCustomerResponse,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
  resolveOrCreateCustomerForUser,
} from "@/lib/customer-api";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseBirthDate(value: unknown) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;

  const date = new Date(`${trimmed}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return undefined;
  return trimmed;
}

export async function GET() {
  const auth = await requireCustomerApi();
  if (!auth.ok) return auth.response;

  try {
    const customer = await resolveOrCreateCustomerForUser(auth.user, {
      allowCreate: true,
    });

    if (!customer) {
      return customerApiError(404, "Customer profile not found", "NOT_FOUND");
    }

    return NextResponse.json({
      customer: mapCustomerResponse(customer),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load customer profile";
    return customerApiError(500, message, "INTERNAL_ERROR");
  }
}

export async function PATCH(req: Request) {
  const auth = await requireCustomerApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!isPlainObject(body)) {
    return customerApiError(400, "Invalid request body", "VALIDATION_ERROR");
  }

  try {
    const customer = await resolveOrCreateCustomerForUser(auth.user, {
      allowCreate: true,
    });

    if (!customer) {
      return customerApiError(404, "Customer profile not found", "NOT_FOUND");
    }

    const nowIso = new Date().toISOString();
    const updates: Record<string, unknown> = {};

    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = String(body.name || "").trim();
      if (!name) {
        return customerApiError(400, "Name is required", "VALIDATION_ERROR");
      }
      updates.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(body, "phone")) {
      const phoneRaw = String(body.phone || "").trim();
      updates.phone = phoneRaw ? normalizeCustomerPhone(phoneRaw) : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "email")) {
      const emailRaw = String(body.email || "").trim();
      if (!emailRaw) {
        updates.email = null;
      } else {
        const normalized = normalizeCustomerEmail(emailRaw);
        if (!normalized.includes("@")) {
          return customerApiError(400, "Invalid email format", "VALIDATION_ERROR");
        }
        updates.email = normalized;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "birth_date")) {
      const birthDate = parseBirthDate(body.birth_date);
      if (typeof birthDate === "undefined") {
        return customerApiError(400, "Invalid birth_date format", "VALIDATION_ERROR");
      }
      updates.birth_date = birthDate;
    }

    let consentTouched = false;
    if (Object.prototype.hasOwnProperty.call(body, "consent_whatsapp")) {
      if (typeof body.consent_whatsapp !== "boolean") {
        return customerApiError(
          400,
          "consent_whatsapp must be a boolean",
          "VALIDATION_ERROR"
        );
      }
      consentTouched = true;
      updates.consent_whatsapp = body.consent_whatsapp;
      updates.consent_whatsapp_at = body.consent_whatsapp
        ? customer.consent_whatsapp_at || nowIso
        : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "consent_email")) {
      if (typeof body.consent_email !== "boolean") {
        return customerApiError(400, "consent_email must be a boolean", "VALIDATION_ERROR");
      }
      consentTouched = true;
      updates.consent_email = body.consent_email;
      updates.consent_email_at = body.consent_email ? customer.consent_email_at || nowIso : null;
    }

    if (consentTouched) {
      updates.consent_source = "customer_app";
    }

    if (Object.keys(updates).length === 0) {
      return customerApiError(400, "No fields to update", "VALIDATION_ERROR");
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("customers")
      .update(updates)
      .eq("id", customer.id)
      .select(
        "id,name,phone,email,birth_date,consent_whatsapp,consent_email,consent_whatsapp_at,consent_email_at,consent_source,total_orders,total_spend,last_order_at,created_at,updated_at"
      )
      .single();

    if (error) {
      if (isUniqueConstraintError(error.message)) {
        return customerApiError(409, "Phone or email already in use", "CONFLICT");
      }
      return customerApiError(500, error.message, "INTERNAL_ERROR");
    }

    return NextResponse.json({
      customer: mapCustomerResponse(data),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update customer profile";
    return customerApiError(500, message, "INTERNAL_ERROR");
  }
}

