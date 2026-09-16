// ============================================================================
// LokaPOS — Link a Supabase Auth user (Google / email) to a `customers` row.
//
// Loyalty is keyed on `customers.phone`, so a Google sign-in is only useful
// once the account is bound to a phone number. Flow:
//   1. /auth/callback  → resolveCustomerForAuthUser()  (user_id → email → create)
//   2. no phone yet    → customer verifies their phone ONCE via OTP, then
//                        /api/customer/link-phone → bindPhoneToAuthCustomer()
//   3. every later sign-in → /auth/callback mints the phone session cookie
//                        straight from customers.phone — no more codes.
//
// Also guards against the historic "new auth user = cashier" default: any
// fresh OAuth signup is pinned to role `customer` (profiles + app_metadata).
// ============================================================================

import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeCustomerPhone, resolveOrCreateCustomerForUser } from "@/lib/customer-api";
import type { AppRole } from "@/lib/auth";

export type LinkedCustomer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  total_orders: number;
};

const COLS = "id,name,phone,email,total_orders";

function isMissingColumn(message: string | null | undefined, column: string) {
  const m = String(message || "").toLowerCase();
  return m.includes(column) && (m.includes("does not exist") || m.includes("could not find") || m.includes("schema cache"));
}

function toLinked(row: Record<string, unknown>): LinkedCustomer {
  return {
    id: String(row.id),
    name: String(row.name || "Customer"),
    phone: row.phone ? String(row.phone) : null,
    email: row.email ? String(row.email) : null,
    total_orders: Number(row.total_orders || 0),
  };
}

// ---------------------------------------------------------------------------
// customers.user_id helpers (tolerant of a DB without the column yet)
// ---------------------------------------------------------------------------

export async function findCustomerByUserId(userId: string): Promise<LinkedCustomer | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("customers").select(COLS).eq("user_id", userId).maybeSingle();
  if (error) {
    if (isMissingColumn(error.message, "user_id")) return null;
    throw new Error(error.message);
  }
  return data ? toLinked(data as Record<string, unknown>) : null;
}

async function setCustomerUserId(customerId: string, userId: string | null, extra: Record<string, unknown> = {}) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("customers")
    .update({ user_id: userId, ...extra })
    .eq("id", customerId);
  if (error) {
    if (isMissingColumn(error.message, "user_id")) {
      console.warn("[customer-auth] customers.user_id missing — run migration 20260916_customer_google_auth.sql");
      if (Object.keys(extra).length > 0) {
        await supabase.from("customers").update(extra).eq("id", customerId);
      }
      return;
    }
    throw new Error(error.message);
  }
}

async function writeAuthCustomerId(user: User, customerId: string) {
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  if (String(meta.customer_id || "") === customerId) return;
  const supabase = createSupabaseAdminClient();
  try {
    await supabase.auth.admin.updateUserById(user.id, { user_metadata: { ...meta, customer_id: customerId } });
  } catch (err) {
    console.warn("[customer-auth] could not write customer_id metadata:", err);
  }
}

// ---------------------------------------------------------------------------
// Resolve / create
// ---------------------------------------------------------------------------

/**
 * The customer row for an auth user: by `user_id`, else the legacy metadata /
 * email / phone resolution (creating one when `allowCreate`), then link it.
 */
export async function resolveCustomerForAuthUser(
  user: User,
  options?: { allowCreate?: boolean }
): Promise<LinkedCustomer | null> {
  const linked = await findCustomerByUserId(user.id);
  if (linked) return linked;

  const resolved = await resolveOrCreateCustomerForUser(user, { allowCreate: options?.allowCreate ?? true });
  if (!resolved) return null;

  const customer: LinkedCustomer = {
    id: resolved.id,
    name: resolved.name,
    phone: resolved.phone,
    email: resolved.email,
    total_orders: Number(resolved.total_orders || 0),
  };
  await setCustomerUserId(customer.id, user.id);
  return customer;
}

/**
 * Bind a freshly OTP-verified phone to the auth user's customer record.
 * If that phone already belongs to another customer row (their real loyalty
 * history, created at the counter or by an earlier guest order), the auth
 * link moves to THAT row and the empty shell created at sign-in is removed.
 */
export async function bindPhoneToAuthCustomer(user: User, phoneRaw: string): Promise<LinkedCustomer> {
  const phone = normalizeCustomerPhone(phoneRaw);
  if (!phone || phone.replace(/\D/g, "").length < 8) throw new Error("Invalid phone number");

  const supabase = createSupabaseAdminClient();
  const authCustomer = await resolveCustomerForAuthUser(user, { allowCreate: true });

  const { data: phoneRowRaw, error: phoneError } = await supabase
    .from("customers")
    .select(COLS)
    .eq("phone", phone)
    .maybeSingle();
  if (phoneError) throw new Error(phoneError.message);
  const phoneRow = phoneRowRaw ? toLinked(phoneRowRaw as Record<string, unknown>) : null;

  if (phoneRow && (!authCustomer || phoneRow.id !== authCustomer.id)) {
    const extra: Record<string, unknown> = {};
    if (authCustomer) {
      await setCustomerUserId(authCustomer.id, null);
      if (!phoneRow.email && authCustomer.email) extra.email = authCustomer.email;
      // Drop the empty shell (no phone, no orders) so the customer list stays clean.
      if (!authCustomer.phone && authCustomer.total_orders === 0) {
        try {
          await supabase.from("customers").delete().eq("id", authCustomer.id).eq("total_orders", 0);
        } catch {
          /* leave it if anything references it */
        }
      }
    }
    await setCustomerUserId(phoneRow.id, user.id, extra);
    await writeAuthCustomerId(user, phoneRow.id);
    return { ...phoneRow, ...(extra.email ? { email: String(extra.email) } : {}) };
  }

  if (!authCustomer) throw new Error("Couldn't create your customer record");

  if (authCustomer.phone !== phone) {
    const { error } = await supabase.from("customers").update({ phone }).eq("id", authCustomer.id);
    if (error) throw new Error(error.message);
  }
  await writeAuthCustomerId(user, authCustomer.id);
  return { ...authCustomer, phone };
}

/**
 * Does this phone already carry loyalty value (orders or ledger entries)?
 * Binding such a number to a new Google account must be proven with an OTP;
 * a number nobody has used yet can be claimed directly.
 */
export async function phoneHasLoyaltyHistory(phoneRaw: string): Promise<boolean> {
  const phone = normalizeCustomerPhone(phoneRaw);
  if (!phone) return false;
  const supabase = createSupabaseAdminClient();
  const { data: row } = await supabase
    .from("customers")
    .select("id,total_orders,user_id")
    .eq("phone", phone)
    .maybeSingle();
  if (!row) return false;
  const customer = row as { id: string; total_orders: number | null; user_id?: string | null };
  if (customer.user_id) return true; // already owned by another account
  if (Number(customer.total_orders || 0) > 0) return true;
  const { count } = await supabase
    .from("loyalty_ledger")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customer.id);
  return Number(count || 0) > 0;
}

// ---------------------------------------------------------------------------
// Role safety for OAuth signups
// ---------------------------------------------------------------------------

/**
 * An account that only ever signed in through an OAuth provider (no email /
 * password identity). Legacy staff always have an email identity, so a
 * `cashier` profile on an OAuth-only account can only be the old trigger
 * default — never an admin-granted role.
 */
function isOAuthOnlyAccount(user: User) {
  const identities = Array.isArray(user.identities) ? user.identities : [];
  return identities.length > 0 && identities.every(i => i.provider !== "email" && i.provider !== "phone");
}

/**
 * Make sure a user arriving through the customer OAuth entry point is a
 * `customer`, unless they are genuinely staff (trusted app_metadata role, or
 * an existing admin/cashier profile that is NOT just the old trigger default
 * on a brand-new OAuth account). Returns the effective role.
 */
export async function ensureCustomerRoleForOAuthUser(user: User): Promise<AppRole> {
  const supabase = createSupabaseAdminClient();
  const appRole = String((user.app_metadata as Record<string, unknown> | undefined)?.role || "").toLowerCase();

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const profileRole = String((profile as { role?: string } | null)?.role || "").toLowerCase();

  if (appRole === "admin" || appRole === "cashier") return appRole;
  if (profileRole === "admin") return "admin";
  if (profileRole === "cashier" && !isOAuthOnlyAccount(user)) return "cashier";

  // Customer (or an OAuth-only account that the legacy trigger mis-graded).
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const fullName = String(meta.full_name || meta.name || "").trim() || null;

  await supabase
    .from("profiles")
    .upsert([{ id: user.id, role: "customer", status: "active", ...(fullName ? { full_name: fullName } : {}) }], { onConflict: "id" });

  if (appRole !== "customer") {
    try {
      const app = (user.app_metadata || {}) as Record<string, unknown>;
      await supabase.auth.admin.updateUserById(user.id, { app_metadata: { ...app, role: "customer" } });
    } catch (err) {
      console.warn("[customer-auth] could not pin app_metadata.role=customer:", err);
    }
  }
  return "customer";
}
