import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { activePerks } from "@/lib/tournament/perk";

export const revalidate = 0;

// GET ?q= — for the till: is a tournament player perk running today, and
// which approved teams/players match the search (team name, tag, IGN or
// MLBB User ID). Each player carries their User ID — the cashier checks it
// against the in-game profile — and how often the perk was used today.
// Empty `perks` means nothing to offer, and the POS hides the button.
export async function GET(req: Request) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  try {
    const perks = await activePerks();
    if (!perks.length) return NextResponse.json({ perks: [], teams: [] });

    const q = (new URL(req.url).searchParams.get("q") || "").trim().toLowerCase();
    const supabase = createSupabaseAdminClient();
    const tournamentIds = perks.map(p => p.tournament.id);
    // Today's uses per player (MYT day), so the cashier sees a shared pass.
    const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
    const dayStart = new Date(`${today}T00:00:00+08:00`).toISOString();
    const [{ data: teams }, { data: players }, { data: uses }] = await Promise.all([
      supabase
        .from("tournament_teams")
        .select("id,name,short_name,tournament_id,team_number")
        .in("tournament_id", tournamentIds)
        .eq("registration_status", "approved")
        .order("name"),
      supabase
        .from("tournament_players")
        .select("id,team_id,ign,mlbb_user_id,is_captain")
        .in("tournament_id", tournamentIds)
        .eq("status", "active"),
      supabase
        .from("tournament_perk_uses")
        .select("player_id")
        .in("tournament_id", tournamentIds)
        .gte("created_at", dayStart),
    ]);
    const usesToday = new Map<string, number>();
    for (const u of uses || []) if (u.player_id) usesToday.set(u.player_id, (usesToday.get(u.player_id) || 0) + 1);

    const rows = (teams || []).map(t => ({
      team_id: t.id as string,
      team_name: t.name as string,
      short_name: (t.short_name as string | null) ?? null,
      team_number: (t.team_number as number | null) ?? null,
      tournament_id: t.tournament_id as string,
      players: (players || [])
        .filter(p => p.team_id === t.id)
        .sort((a, b) => Number(b.is_captain) - Number(a.is_captain))
        .map(p => ({
          id: p.id as string,
          ign: p.ign as string,
          mlbb_user_id: (p.mlbb_user_id as string | null) ?? "",
          is_captain: Boolean(p.is_captain),
          uses_today: usesToday.get(p.id as string) || 0,
        })),
    }));
    const matches = q
      ? rows.filter(r =>
          r.team_name.toLowerCase().includes(q) ||
          (r.short_name || "").toLowerCase().includes(q) ||
          r.players.some(p => p.ign.toLowerCase().includes(q) || (!!p.mlbb_user_id && p.mlbb_user_id.includes(q)))
        )
      : rows;

    return NextResponse.json({
      perks: perks.map(p => ({
        tournament_id: p.tournament.id,
        tournament_name: p.tournament.name,
        percent: p.perk.percent,
        category_names: p.category_names,
      })),
      teams: matches.slice(0, 30),
    });
  } catch (error) {
    return NextResponse.json({ perks: [], teams: [], error: error instanceof Error ? error.message : "Failed" });
  }
}
