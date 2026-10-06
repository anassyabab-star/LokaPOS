import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCustomerSession, getTournamentBySlug } from "@/lib/tournament/server";
import { PLAYER_ROLES, type PlayerRole } from "@/lib/tournament/types";

// ============================================================================
// PUT /api/public/tournaments/[slug]/roster — the captain changes their own
// roster until the registration deadline (after that, only an admin can).
//
// Body: { players: [{ id?, full_name? (captain), ign, mlbb_user_id,
//         player_role }] } — the full list, captain first. Rows with an id are
// updated, new rows added, missing rows removed. The captain's row (and
// phone — it's their sign-in and voucher) always stays.
// ============================================================================

const clean = (v: unknown, max = 60) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

export async function PUT(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  try {
    const tournament = await getTournamentBySlug(slug);
    if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

    const lockAt = tournament.registration_deadline ? new Date(tournament.registration_deadline).getTime() : null;
    if ((lockAt && Date.now() > lockAt) || ["ongoing", "completed"].includes(tournament.status)) {
      return NextResponse.json({ error: "Roster changes are closed. Contact the organiser." }, { status: 400 });
    }

    const session = await getCustomerSession(req);
    if (!session) return NextResponse.json({ error: "Please sign in first.", code: "SIGN_IN_REQUIRED" }, { status: 401 });
    if (!session.customerId) return NextResponse.json({ error: "Only the team captain can change the roster." }, { status: 403 });

    const supabase = createSupabaseAdminClient();
    const { data: team } = await supabase
      .from("tournament_teams")
      .select("id,registration_status")
      .eq("tournament_id", tournament.id)
      .eq("captain_customer_id", session.customerId)
      .maybeSingle();
    if (!team) return NextResponse.json({ error: "Only the team captain can change the roster." }, { status: 403 });
    if (["rejected", "withdrawn"].includes(team.registration_status)) {
      return NextResponse.json({ error: "This registration can't be changed." }, { status: 400 });
    }

    const { data: current } = await supabase
      .from("tournament_players")
      .select("id,is_captain")
      .eq("team_id", team.id);
    const currentIds = new Set((current || []).map(p => String(p.id)));
    const captainRow = (current || []).find(p => p.is_captain);

    const body = await req.json().catch(() => null);
    const raw: Record<string, unknown>[] = Array.isArray(body?.players) ? body.players : [];
    const players = raw.map(p => ({
      id: p.id && currentIds.has(String(p.id)) ? String(p.id) : null,
      full_name: clean(p.full_name) || null,
      ign: clean(p.ign, 30),
      mlbb_user_id: clean(p.mlbb_user_id, 20).replace(/\D/g, ""),
      player_role: (PLAYER_ROLES.includes(p.player_role as PlayerRole) ? p.player_role : "sub") as PlayerRole,
    }));

    if (players.length < tournament.min_players || players.length > tournament.max_players) {
      return NextResponse.json({ error: `A team needs ${tournament.min_players}–${tournament.max_players} players.` }, { status: 400 });
    }
    for (const [i, p] of players.entries()) {
      if (!p.ign || !p.mlbb_user_id) {
        return NextResponse.json({ error: `Player ${i + 1}: IGN and MLBB User ID are required.` }, { status: 400 });
      }
    }
    if (new Set(players.map(p => p.mlbb_user_id)).size !== players.length) {
      return NextResponse.json({ error: "The same MLBB User ID is listed twice." }, { status: 400 });
    }
    if (!captainRow || players[0].id !== String(captainRow.id)) {
      return NextResponse.json({ error: "The captain must stay as player 1." }, { status: 400 });
    }

    // Someone in another team already?
    const { data: clash } = await supabase
      .from("tournament_players")
      .select("ign,mlbb_user_id,team_id")
      .eq("tournament_id", tournament.id)
      .neq("team_id", team.id)
      .in("mlbb_user_id", players.map(p => p.mlbb_user_id));
    if (clash && clash.length) {
      const who = players.find(p => p.mlbb_user_id === clash[0].mlbb_user_id);
      return NextResponse.json({ error: `${who?.ign || "A player"} (ID ${clash[0].mlbb_user_id}) is already in another team.` }, { status: 409 });
    }

    // Remove dropped players first so a re-used User ID doesn't collide.
    const keep = new Set(players.map(p => p.id).filter(Boolean) as string[]);
    const removed = [...currentIds].filter(id => !keep.has(id) && id !== String(captainRow.id));
    if (removed.length) await supabase.from("tournament_players").delete().in("id", removed);

    for (const [i, p] of players.entries()) {
      const row = {
        ign: p.ign,
        mlbb_user_id: p.mlbb_user_id,
        player_role: p.player_role,
        // Only the captain gives a full name; teammates' stays as it was.
        ...(i === 0 ? { full_name: p.full_name } : {}),
      };
      const { error } = p.id
        ? await supabase.from("tournament_players").update(row).eq("id", p.id).eq("team_id", team.id)
        : await supabase.from("tournament_players").insert([{ ...row, team_id: team.id, tournament_id: tournament.id, is_captain: false }]);
      if (error) {
        const msg = /_uniq/.test(error.message) ? `${p.ign} is already registered in another team.` : error.message;
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
