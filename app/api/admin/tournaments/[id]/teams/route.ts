import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sanitizePlayer, sanitizeTeam } from "@/lib/tournament/admin-input";

// POST — admin adds a team by hand (walk-in, paid at the counter). It starts
// "payment_submitted" so the same Approve button issues the vouchers.
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const team = sanitizeTeam(body);
  if (!team.name) return NextResponse.json({ error: "Team name is required" }, { status: 400 });
  const players = (Array.isArray(body.players) ? body.players : [])
    .map(p => sanitizePlayer(p as Record<string, unknown>))
    .filter(p => p.ign);
  for (const p of players) {
    if (!p.mlbb_user_id) return NextResponse.json({ error: `${p.ign}: MLBB User ID is required` }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: created, error } = await supabase
    .from("tournament_teams")
    .insert([{ ...team, tournament_id: id, registration_status: "payment_submitted", notes: team.notes ?? "Added by admin" }])
    .select("id")
    .single();
  if (error || !created) {
    const msg = String(error?.message).includes("name_uniq") ? "That team name is taken." : error?.message;
    return NextResponse.json({ error: msg || "Failed" }, { status: 400 });
  }
  if (players.length) {
    const { error: pErr } = await supabase
      .from("tournament_players")
      .insert(players.map(p => ({ ...p, tournament_id: id, team_id: created.id })));
    if (pErr) {
      await supabase.from("tournament_teams").delete().eq("id", created.id);
      const msg = /_uniq/.test(pErr.message) ? "A player is already in another team (same phone or MLBB ID)." : pErr.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }
  return NextResponse.json({ success: true, team_id: created.id });
}
