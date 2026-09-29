import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { activePerks } from "@/lib/tournament/perk";

export const revalidate = 0;

// GET ?q= — for the till: is a tournament player perk running today, and
// which approved teams/players match the search (team name, tag or IGN).
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
    const [{ data: teams }, { data: players }] = await Promise.all([
      supabase
        .from("tournament_teams")
        .select("id,name,short_name,tournament_id,team_number")
        .in("tournament_id", tournamentIds)
        .eq("registration_status", "approved")
        .order("name"),
      supabase
        .from("tournament_players")
        .select("id,team_id,ign,is_captain")
        .in("tournament_id", tournamentIds)
        .eq("status", "active"),
    ]);

    const rows = (teams || []).map(t => ({
      team_id: t.id as string,
      team_name: t.name as string,
      short_name: (t.short_name as string | null) ?? null,
      team_number: (t.team_number as number | null) ?? null,
      tournament_id: t.tournament_id as string,
      players: (players || [])
        .filter(p => p.team_id === t.id)
        .sort((a, b) => Number(b.is_captain) - Number(a.is_captain))
        .map(p => ({ id: p.id as string, ign: p.ign as string, is_captain: Boolean(p.is_captain) })),
    }));
    const matches = q
      ? rows.filter(r =>
          r.team_name.toLowerCase().includes(q) ||
          (r.short_name || "").toLowerCase().includes(q) ||
          r.players.some(p => p.ign.toLowerCase().includes(q))
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
