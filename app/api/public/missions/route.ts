import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { canonicalPhone, phoneVariants } from "@/lib/phone";
import { getLoyaltyConfig } from "@/lib/loyalty";

// GET ?phone= — the active challenges and this customer's progress in each.
//
// Missions were entirely invisible to customers: the engine ran server-side,
// rewards landed in the wallet with no explanation, and nobody could see a
// challenge existed. A challenge nobody knows about changes nobody's
// behaviour.
//
// Read-only. Progress is whatever mission_record_purchase recorded; nothing
// here advances a mission.

type MissionRow = {
  id: string;
  code: string;
  name: string | null;
  description: string | null;
  type: string;
  threshold: number;
  window_days: number;
  weekday: number | null;
  reward_points: number;
  reward_free_label: string | null;
};

type ProgressRow = {
  mission_id: string;
  count: number;
  status: string;
  window_end_at: string | null;
  completed_at: string | null;
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function rewardText(m: MissionRow): string {
  const parts: string[] = [];
  if (m.reward_free_label) parts.push(m.reward_free_label);
  if (m.reward_points > 0) parts.push(`${m.reward_points} pts`);
  return parts.join(" + ") || "A reward";
}

/** "Buy 4 times in 8 days" — the rule said the way a customer would say it. */
function ruleText(m: MissionRow): string {
  const times = `${m.threshold} ${m.threshold === 1 ? "time" : "times"}`;
  if (m.type === "count_on_weekday_in_window" && m.weekday !== null) {
    return `Buy ${times} on a ${WEEKDAYS[m.weekday] || "set day"}, within ${m.window_days} days`;
  }
  return `Buy ${times} within ${m.window_days} days`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const phone = canonicalPhone(searchParams.get("phone"));

  try {
    const config = await getLoyaltyConfig();
    if (!config.missionsEnabled) return NextResponse.json({ missions: [] });

    const supabase = createSupabaseAdminClient();

    const { data: defs, error: defErr } = await supabase
      .from("mission_definitions")
      .select("id,code,name,description,type,threshold,window_days,weekday,reward_points,reward_free_label")
      .eq("active", true)
      .order("threshold", { ascending: true });
    // A missing table (migration not applied) is not worth showing anyone.
    if (defErr || !defs || defs.length === 0) return NextResponse.json({ missions: [] });

    // Progress is per-customer; without a phone we still describe the
    // challenges so a signed-out visitor can see what is on offer.
    const progressByMission = new Map<string, ProgressRow>();
    if (phone) {
      const { data: customer } = await supabase
        .from("customers")
        .select("id")
        .in("phone", phoneVariants(phone))
        .limit(1)
        .maybeSingle();

      if (customer?.id) {
        const { data: rows } = await supabase
          .from("mission_progress")
          .select("mission_id,count,status,window_end_at,completed_at")
          .eq("customer_id", customer.id)
          .in("status", ["in_progress", "completed"])
          .order("updated_at", { ascending: false });
        for (const r of (rows || []) as ProgressRow[]) {
          if (!progressByMission.has(r.mission_id)) progressByMission.set(r.mission_id, r);
        }
      }
    }

    const now = Date.now();
    const missions = (defs as MissionRow[]).map(m => {
      const p = progressByMission.get(m.id) || null;
      const expired = p?.window_end_at ? new Date(p.window_end_at).getTime() < now : false;
      const live = Boolean(p && p.status === "in_progress" && !expired);
      const count = live && p ? Number(p.count || 0) : 0;
      const daysLeft = live && p?.window_end_at
        ? Math.max(0, Math.ceil((new Date(p.window_end_at).getTime() - now) / 86_400_000))
        : null;
      return {
        code: m.code,
        name: m.name || m.code,
        rule: ruleText(m),
        reward: rewardText(m),
        threshold: m.threshold,
        progress: Math.min(count, m.threshold),
        remaining: Math.max(0, m.threshold - count),
        days_left: daysLeft,
        started: live,
        completed_at: p?.status === "completed" ? p.completed_at : null,
      };
    });

    return NextResponse.json({ missions });
  } catch {
    // Never let a challenge widget break the page it sits on.
    return NextResponse.json({ missions: [] });
  }
}
