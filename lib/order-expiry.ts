// ============================================================================
// LokaPOS — Auto-expire unpaid (awaiting_payment) orders.
//
// A customer who orders on their phone but never comes to the counter would
// otherwise leave stock reserved and an order sitting in "Belum Bayar" forever.
// After `store_settings.unpaid_order_expiry_minutes` (default 30, 0 = off) the
// order is voided through the normal cancel path (stock restored, reserved
// loyalty points returned, adjustment logged with approved_by = null).
//
// Called best-effort from the POS / KDS list endpoints (throttled to once a
// minute per server instance) and forced from /api/cron/expire-unpaid-orders.
// ============================================================================

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { cancelOrder } from "@/lib/order-status";

export const DEFAULT_UNPAID_EXPIRY_MINUTES = 30;
const THROTTLE_MS = 60_000;
const BATCH_LIMIT = 50;

let lastRunMs = 0;

export async function getUnpaidOrderExpiryMinutes(): Promise<number> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("store_settings")
      .select("unpaid_order_expiry_minutes")
      .eq("id", "main")
      .maybeSingle();
    if (error || !data) return DEFAULT_UNPAID_EXPIRY_MINUTES;
    const raw = (data as { unpaid_order_expiry_minutes?: number | null }).unpaid_order_expiry_minutes;
    if (raw === null || raw === undefined) return DEFAULT_UNPAID_EXPIRY_MINUTES;
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_UNPAID_EXPIRY_MINUTES;
  } catch {
    return DEFAULT_UNPAID_EXPIRY_MINUTES;
  }
}

export async function expireStaleUnpaidOrders(
  opts: { force?: boolean } = {}
): Promise<{ expired: number; skipped: boolean; minutes: number; errors: number }> {
  const now = Date.now();
  if (!opts.force && now - lastRunMs < THROTTLE_MS) {
    return { expired: 0, skipped: true, minutes: 0, errors: 0 };
  }
  lastRunMs = now;

  const minutes = await getUnpaidOrderExpiryMinutes();
  if (!(minutes > 0)) return { expired: 0, skipped: true, minutes, errors: 0 };

  const cutoff = new Date(now - minutes * 60_000).toISOString();
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .eq("status", "awaiting_payment")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error || !data) {
    if (error) console.error("[order-expiry] query failed:", error.message);
    return { expired: 0, skipped: false, minutes, errors: error ? 1 : 0 };
  }

  let expired = 0;
  let errors = 0;
  for (const row of data as { id: string }[]) {
    try {
      const result = await cancelOrder({
        orderId: row.id,
        action: "void",
        reason: `Auto-expired: belum bayar > ${minutes} min`,
        approvedBy: null,
        approvedRole: "system",
        approvalLevel: "auto",
      });
      if (result.ok && !result.alreadyCancelled) expired += 1;
      if (!result.ok) errors += 1;
    } catch (err) {
      errors += 1;
      console.error("[order-expiry] cancel failed:", row.id, err);
    }
  }

  return { expired, skipped: false, minutes, errors };
}
