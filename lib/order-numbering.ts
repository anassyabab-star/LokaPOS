// ============================================================================
// LokaPOS — Receipt / order numbering (server only).
//
// One generator for every order path (POS, guest web, member web). Numbers are
// `DDMMYYYY-NNN`, sequenced per business day in Malaysia time via the
// `get_next_receipt_number` RPC (advisory-locked upsert on `receipt_counters`,
// see supabase/migrations/20260915_order_flow_pay_at_counter.sql).
//
// The customer quotes the short suffix (`#042`) at the counter — see
// `shortOrderNumber()` in lib/order-flow.ts.
// ============================================================================

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export { shortOrderNumber } from "@/lib/order-flow";

/** `YYYY-MM-DD` for the current business day in Asia/Kuala_Lumpur. */
export function myDateKey(date: Date = new Date()): string {
  const y = date.toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", year: "numeric" });
  const m = date.toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", month: "2-digit" });
  const d = date.toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit" });
  return `${y}-${m}-${d}`;
}

/** `"2026-09-15"` → `"15092026"` (the receipt-number date prefix). */
export function receiptDatePart(dateKey: string): string {
  const [y, m, d] = String(dateKey || "").split("-");
  if (!y || !m || !d) return "";
  return `${d}${m}${y}`;
}

/** Build the full receipt number a short code refers to: (`"2026-09-15"`, `"42"`) → `"15092026-042"`. */
export function receiptNumberFor(dateKey: string, seq: number | string): string {
  const n = String(seq).replace(/\D/g, "");
  return `${receiptDatePart(dateKey)}-${n.padStart(3, "0")}`;
}

/**
 * Next receipt number for the day — atomic via RPC. Falls back to a count+1
 * (racy) only when the RPC is not installed yet, so the app keeps working
 * before the migration is applied.
 */
export async function nextReceiptNumber(dateKey: string = myDateKey()): Promise<string> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase.rpc("get_next_receipt_number", { p_date_key: dateKey });
  if (!error && data) return String(data);

  if (error) {
    console.warn("[order-numbering] get_next_receipt_number RPC unavailable, using count fallback:", error.message);
  }

  const { count } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("date_key", dateKey);

  return receiptNumberFor(dateKey, (count || 0) + 1);
}
