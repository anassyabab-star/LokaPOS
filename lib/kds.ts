import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// ============================================================================
// LokaPOS — Kitchen Display (KDS) flow toggle.
//
// When KDS is ENABLED, orders flow through the kitchen queue
// (pending → preparing → ready → completed) and staff advance them on the
// `/kds` display. When DISABLED, orders skip the queue and land "completed"
// the moment they are paid — i.e. straight into the system, no manual step.
//
// The toggle lives in `store_settings.kds_enabled` (boolean). It DEFAULTS TO
// OFF: a missing column/row/value is treated as disabled, so the skip-kitchen
// behaviour works even before the migration is applied. The KDS code/page is
// left fully intact so the flow can be turned back on at any time.
// ============================================================================

let cached: { value: boolean; atMs: number } | null = null;
const CACHE_TTL_MS = 30_000;

/** Invalidate the cache (call after the toggle is changed). */
export function clearKdsCache() {
  cached = null;
}

/** Is the Kitchen Display flow in use? Defaults to false (skip kitchen). */
export async function isKdsEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cached && now - cached.atMs < CACHE_TTL_MS) return cached.value;
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("store_settings")
      .select("kds_enabled")
      .eq("id", "main")
      .maybeSingle();
    // Missing column / row / error → treat as disabled (skip kitchen).
    const value = !error && data?.kds_enabled === true;
    cached = { value, atMs: now };
    return value;
  } catch {
    return false;
  }
}

/**
 * The status a just-PAID order should land in.
 *   - KDS off → "completed" (straight into the system).
 *   - KDS on  → advance pending→"preparing", else keep the already-advanced
 *               status (mirrors the previous hard-coded behaviour).
 */
export async function statusOnPaid(currentStatus?: string | null): Promise<string> {
  if (!(await isKdsEnabled())) return "completed";
  const cur = String(currentStatus || "").toLowerCase();
  return !cur || cur === "pending" ? "preparing" : cur;
}
