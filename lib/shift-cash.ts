// ============================================================================
// LokaPOS — Cash-drawer maths shared by POS shift, paid-outs and the
// auto-close-shift cron.
//
// "Cash sales since the shift opened" = every CASH order that is PAID and not
// cancelled, keyed on `paid_at` (when the cashier actually collected the money).
// It deliberately does NOT depend on `orders.status`, so orders still queued on
// the Kitchen Display (`pending` / `preparing` / `ready`) are counted — the
// previous `status = 'completed'` filter under-counted the drawer whenever the
// KDS flow was on.
// ============================================================================

import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
type CashRow = { total: number | null };

function isMissingColumn(message: string | null | undefined, column: string) {
  const m = String(message || "").toLowerCase();
  return m.includes(column) && (m.includes("does not exist") || m.includes("could not find"));
}

export async function getCashSalesSince(supabase: AdminClient, openedAt: string): Promise<number> {
  const base = () =>
    supabase
      .from("orders")
      .select("total")
      .eq("payment_method", "cash")
      .eq("payment_status", "paid")
      .neq("status", "cancelled");

  let { data, error } = await base().gte("paid_at", openedAt);

  // Pre-migration fallback: no paid_at column yet → use created_at.
  if (error && isMissingColumn(error.message, "paid_at")) {
    ({ data, error } = await base().gte("created_at", openedAt));
  }

  if (error) throw error;
  return ((data || []) as CashRow[]).reduce((sum, row) => sum + Number(row.total || 0), 0);
}
