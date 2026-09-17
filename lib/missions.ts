import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getLoyaltyConfig, loyaltyExpiresAt } from "@/lib/loyalty";
import { insertLedgerEvent } from "@/lib/customer-order-payment";
import { issueRewardVoucher } from "@/lib/rewards-vouchers";

// ============================================================================
// Mission engine (Smart Loyalty Fasa 1).
//
// Hooks off the single paid-settlement funnel (applyCustomerOrderPaidSettlement)
// so it fires for BOTH online + cash orders. Counting/window/completion happen
// inside the advisory-locked RPC `mission_record_purchase` (never in JS) to avoid
// concurrent double-counts. On completion it auto-issues a free-cup voucher +
// bonus points, idempotently.
// ============================================================================

type MissionDef = {
  id: string;
  code: string;
  type: string;
  threshold: number;
  window_days: number;
  weekday: number | null;
  qualifying_min_spend: number;
  qualifying_category_id: string | null;
  reward_points: number;
  reward_free_product_id: string | null;
  reward_free_category_id: string | null;
  reward_free_label: string | null;
  reward_voucher_expiry_days: number;
  repeatable: boolean;
};

function isMissingRelationError(message: string | null | undefined) {
  const text = String(message || "").toLowerCase();
  return text.includes("does not exist") || text.includes("schema cache");
}

/** Weekday (0=Sun..6=Sat) of an instant, evaluated in Malaysia time. */
function malaysiaWeekday(iso: string): number {
  return new Date(
    new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" })
  ).getDay();
}

/**
 * Evaluate all active missions for a just-paid order. Best-effort: any single
 * mission failure is swallowed so it never blocks order settlement.
 */
export async function evaluateMissionsOnPaid(
  orderId: string,
  createdBy: string | null
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const config = await getLoyaltyConfig();
  if (!config.missionsEnabled) return;

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id,customer_id,total,created_at")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr || !order || !order.customer_id) return;

  const customerId = String(order.customer_id);
  const total = Number(order.total || 0);
  const orderAt = order.created_at || new Date().toISOString();

  // Mutual exclusivity: an order that redeemed a coupon (excludes_mission=true)
  // does not progress any mission. Gated by the config toggle.
  if (config.mutualExclusivityEnabled) {
    const { data: excluding } = await supabase
      .from("vouchers")
      .select("id")
      .eq("redeemed_order_id", orderId)
      .eq("excludes_mission", true)
      .limit(1);
    if (excluding && excluding.length > 0) return;
  }

  const { data: missions, error: mErr } = await supabase
    .from("mission_definitions")
    .select(
      "id,code,type,threshold,window_days,weekday,qualifying_min_spend,qualifying_category_id,reward_points,reward_free_product_id,reward_free_category_id,reward_free_label,reward_voucher_expiry_days,repeatable"
    )
    .eq("active", true);
  if (mErr) {
    if (isMissingRelationError(mErr.message)) return; // schema not ready
    console.error("[missions] could not load definitions:", mErr.message);
    return;
  }

  const weekday = malaysiaWeekday(orderAt);

  for (const m of (missions || []) as MissionDef[]) {
    try {
      // Qualification gates (decided here; the RPC only counts).
      if (total < Number(m.qualifying_min_spend || 0)) continue;
      if (m.type === "count_on_weekday_in_window" && m.weekday !== null && weekday !== m.weekday) {
        continue;
      }

      const { data: rpcData, error: rpcErr } = await supabase.rpc("mission_record_purchase", {
        p_mission_id: m.id,
        p_customer_id: customerId,
        p_order_id: orderId,
        p_order_at: orderAt,
        p_window_days: m.window_days,
        p_threshold: m.threshold,
        p_repeatable: m.repeatable,
      });
      if (rpcErr) {
        // This silently ate a 42702 ("cycle_index is ambiguous") on every call
        // for two months, so the engine looked healthy while recording
        // nothing. Missions still must not break settlement — but a failure
        // has to be visible in the logs.
        console.error(`[missions] ${m.code} record failed:`, rpcErr.message);
        continue;
      }

      const result = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as
        | { progress_id: string | null; cycle_index: number | null; completed: boolean; already_counted: boolean }
        | null;
      if (!result || !result.completed || result.progress_id == null) continue;

      const cycle = Number(result.cycle_index ?? 0);

      // Bonus points (idempotent).
      if (m.reward_points > 0) {
        await insertLedgerEvent({
          customerId,
          orderId,
          entryType: "earn",
          pointsChange: m.reward_points,
          source: "mission",
          note: `Mission reward: ${m.code}`,
          eventKey: `mission-pts:${m.code}:${customerId}:${cycle}`,
          createdBy,
          expiresAt: loyaltyExpiresAt(config),
        });
      }

      // Free-cup reward voucher (idempotent).
      const voucherExpiry = new Date(
        Date.now() + Number(m.reward_voucher_expiry_days || 30) * 24 * 60 * 60 * 1000
      ).toISOString();
      const voucher = await issueRewardVoucher({
        customerId,
        source: "mission",
        sourceRef: m.code,
        rewardType: "free_product",
        rewardLabel: m.reward_free_label || "Free reward",
        rewardProductId: m.reward_free_product_id,
        rewardCategoryId: m.reward_free_category_id,
        issueEventKey: `mission-voucher:${m.code}:${customerId}:${cycle}`,
        expiresAt: voucherExpiry,
      });

      if (voucher) {
        await supabase
          .from("mission_progress")
          .update({ reward_voucher_id: voucher.id })
          .eq("id", result.progress_id);
      }
    } catch {
      // Never let one mission break settlement or the others.
      continue;
    }
  }
}

/**
 * Reverse mission progress for a refunded/voided order. Conservative:
 *   - remove the order's contribution and recompute the affected cycle's count;
 *   - if a completed cycle drops below threshold and its reward voucher is still
 *     unredeemed → expire the voucher and claw back the bonus points.
 * If the reward voucher was already redeemed, it is left alone (Phase-5 policy).
 * Idempotent via the reversal ledger event_key + the voucher status guard.
 */
export async function reverseMissionsOnRefund(
  orderId: string,
  createdBy: string | null
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { data: links, error } = await supabase
    .from("mission_progress_orders")
    .select("id,progress_id,mission_id")
    .eq("order_id", orderId);
  if (error || !links || links.length === 0) return;

  // Remove this order's contributions first.
  await supabase.from("mission_progress_orders").delete().eq("order_id", orderId);

  const progressIds = Array.from(
    new Set(links.map(l => l.progress_id).filter((x): x is string => Boolean(x)))
  );

  for (const progressId of progressIds) {
    try {
      const { data: prog } = await supabase
        .from("mission_progress")
        .select("id,mission_id,customer_id,status,reward_voucher_id")
        .eq("id", progressId)
        .maybeSingle();
      if (!prog) continue;

      const { data: def } = await supabase
        .from("mission_definitions")
        .select("code,threshold,reward_points")
        .eq("id", prog.mission_id)
        .maybeSingle();
      if (!def) continue;

      // Recompute remaining count from surviving links.
      const { count: remaining } = await supabase
        .from("mission_progress_orders")
        .select("id", { count: "exact", head: true })
        .eq("progress_id", progressId);
      const newCount = Number(remaining || 0);

      await supabase
        .from("mission_progress")
        .update({ count: newCount, updated_at: new Date().toISOString() })
        .eq("id", progressId);

      if (prog.status === "completed" && newCount < Number(def.threshold || 0)) {
        // Expire an unredeemed reward voucher + claw back bonus points.
        if (prog.reward_voucher_id) {
          const { data: voucher } = await supabase
            .from("vouchers")
            .select("id,status")
            .eq("id", prog.reward_voucher_id)
            .maybeSingle();
          if (voucher && voucher.status === "issued") {
            await supabase.from("vouchers").update({ status: "expired" }).eq("id", voucher.id);
            if (Number(def.reward_points || 0) > 0 && prog.customer_id) {
              await insertLedgerEvent({
                customerId: String(prog.customer_id),
                orderId,
                entryType: "adjust",
                pointsChange: -Number(def.reward_points),
                source: "refund",
                note: `Reverse mission reward: ${def.code}`,
                eventKey: `mission-reversal:${progressId}`,
                createdBy,
              });
            }
          }
        }
        // Void the completed cycle (avoids the one-in_progress-per-pair index).
        await supabase.from("mission_progress").update({ status: "expired" }).eq("id", progressId);
      }
    } catch {
      continue;
    }
  }
}
