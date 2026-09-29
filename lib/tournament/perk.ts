import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { endOfDayMYT, startOfDayMYT } from "./server";
import type { PlayerPerk, Tournament } from "./types";

// ============================================================================
// Tournament-day player perk: X% off selected categories (drinks) on every
// purchase, for every player of an approved team, on the tournament day(s).
// The till applies it (/api/pos/tournament-perk to find the player, then
// /api/orders re-prices it) — the amount is always worked out server-side
// from the order's own lines, never taken from the client.
// ============================================================================

export type ActivePerk = {
  tournament: Pick<Tournament, "id" | "slug" | "name">;
  perk: PlayerPerk;
  category_names: string[];
};

/** Tournament day(s) in Malaysia time: 00:00 on start_at → 23:59 on end_at. */
export function isEventDay(t: Pick<Tournament, "start_at" | "end_at">, now = Date.now()) {
  if (!t.start_at) return false;
  const from = startOfDayMYT(t.start_at).getTime();
  const to = endOfDayMYT(t.end_at || t.start_at).getTime();
  return now >= from && now <= to;
}

export function perkIsOn(t: Pick<Tournament, "voucher_config">): PlayerPerk | null {
  const p = t.voucher_config?.player_perk;
  return p && p.enabled && p.percent > 0 && p.category_ids.length > 0 ? p : null;
}

/** Published tournaments whose player perk is running right now. */
export async function activePerks(now = Date.now()): Promise<ActivePerk[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("tournaments")
    .select("id,slug,name,start_at,end_at,voucher_config,published")
    .eq("published", true);
  const live = ((data || []) as Tournament[]).filter(t => perkIsOn(t) && isEventDay(t, now));
  if (!live.length) return [];
  const ids = [...new Set(live.flatMap(t => perkIsOn(t)!.category_ids))];
  const { data: cats } = await supabase.from("categories").select("id,name").in("id", ids);
  const nameById = new Map((cats || []).map(c => [String(c.id), String(c.name)]));
  return live.map(t => {
    const perk = perkIsOn(t)!;
    return {
      tournament: { id: t.id, slug: t.slug, name: t.name },
      perk,
      category_names: perk.category_ids.map(id => nameById.get(id)).filter(Boolean) as string[],
    };
  });
}

/**
 * Validate a perk claim for an order: the team must be approved in a
 * tournament whose perk is live now, and the player (if given) on that team.
 */
export async function resolvePerkClaim(claim: { team_id?: unknown; player_id?: unknown }) {
  const teamId = String(claim?.team_id || "");
  if (!teamId) return null;
  const supabase = createSupabaseAdminClient();
  const { data: team } = await supabase
    .from("tournament_teams")
    .select("id,name,tournament_id,registration_status")
    .eq("id", teamId)
    .maybeSingle();
  if (!team || team.registration_status !== "approved") return null;
  const { data: t } = await supabase.from("tournaments").select("*").eq("id", team.tournament_id).maybeSingle();
  const tournament = t as Tournament | null;
  if (!tournament?.published) return null;
  const perk = perkIsOn(tournament);
  if (!perk || !isEventDay(tournament)) return null;
  let player: { id: string; ign: string } | null = null;
  if (claim?.player_id) {
    const { data: p } = await supabase
      .from("tournament_players")
      .select("id,ign")
      .eq("id", String(claim.player_id))
      .eq("team_id", team.id)
      .maybeSingle();
    player = p ? { id: String(p.id), ign: String(p.ign) } : null;
  }
  return { tournament, team: { id: String(team.id), name: String(team.name) }, player, perk };
}

/** The perk's RM value on these order lines. */
export function perkDiscount(perk: PlayerPerk, lines: { category_id: string | null; line_total: number }[]) {
  const eligible = lines
    .filter(l => l.category_id && perk.category_ids.includes(l.category_id))
    .reduce((s, l) => s + Number(l.line_total || 0), 0);
  return Math.round(eligible * (perk.percent / 100) * 100) / 100;
}

/** Best-effort audit row; the discount stands even if the table isn't migrated. */
export async function recordPerkUse(row: {
  tournament_id: string; team_id: string; player_id: string | null; player_ign: string | null;
  order_id: string; discount_amount: number; created_by: string | null;
}) {
  try {
    const supabase = createSupabaseAdminClient();
    await supabase.from("tournament_perk_uses").insert([row]);
  } catch {
    // not migrated yet
  }
}
