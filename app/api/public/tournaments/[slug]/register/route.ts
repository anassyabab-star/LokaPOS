import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { canonicalPhone, isPlausiblePhone } from "@/lib/phone";
import { findOrCreateCustomerByPhone, getCustomerSession, getTournamentBySlug } from "@/lib/tournament/server";
import { PLAYER_ROLES, type PlayerRole } from "@/lib/tournament/types";

// ============================================================================
// POST /api/public/tournaments/[slug]/register — a captain registers a team.
//
// The captain must be signed in (Google or phone OTP) and must be one of the
// listed players: their verified phone is how we know who owns the entry, and
// it is where their vouchers go. Every other player's phone is recorded so
// they get their own vouchers once the payment is approved.
//
// Body: { team: { name, short_name? }, players: [{ full_name, ign,
//         mlbb_user_id, server_id, phone, player_role }] }
// ============================================================================

type PlayerIn = {
  full_name?: string; ign?: string; mlbb_user_id?: string; server_id?: string; phone?: string; player_role?: string;
};

const clean = (v: unknown, max = 60) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

export async function POST(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  try {
    const tournament = await getTournamentBySlug(slug);
    if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    if (tournament.status !== "registration_open") {
      return NextResponse.json({ error: "Registration is closed." }, { status: 400 });
    }
    if (tournament.registration_deadline && Date.now() > new Date(tournament.registration_deadline).getTime()) {
      return NextResponse.json({ error: "The registration deadline has passed." }, { status: 400 });
    }

    const session = await getCustomerSession(req);
    if (!session) {
      return NextResponse.json({ error: "Please sign in first.", code: "SIGN_IN_REQUIRED" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const teamName = clean(body?.team?.name, 40);
    const shortName = clean(body?.team?.short_name, 6).toUpperCase() || null;
    if (teamName.length < 2) return NextResponse.json({ error: "Team name is required." }, { status: 400 });

    const rawPlayers: PlayerIn[] = Array.isArray(body?.players) ? body.players : [];
    const players = rawPlayers.map(p => ({
      full_name: clean(p.full_name),
      ign: clean(p.ign, 30),
      mlbb_user_id: clean(p.mlbb_user_id, 20).replace(/\D/g, ""),
      server_id: clean(p.server_id, 10).replace(/\D/g, ""),
      phone: canonicalPhone(p.phone),
      player_role: (PLAYER_ROLES.includes(p.player_role as PlayerRole) ? p.player_role : "sub") as PlayerRole,
    }));

    if (players.length < tournament.min_players || players.length > tournament.max_players) {
      return NextResponse.json(
        { error: `A team needs ${tournament.min_players}–${tournament.max_players} players.` },
        { status: 400 }
      );
    }
    for (const [i, p] of players.entries()) {
      const n = i + 1;
      if (!p.full_name || !p.ign) return NextResponse.json({ error: `Player ${n}: name and IGN are required.` }, { status: 400 });
      if (!p.mlbb_user_id || !p.server_id) return NextResponse.json({ error: `Player ${n}: MLBB User ID and Server ID are required.` }, { status: 400 });
      if (!isPlausiblePhone(p.phone)) return NextResponse.json({ error: `Player ${n}: phone number looks wrong.` }, { status: 400 });
    }
    if (new Set(players.map(p => p.phone)).size !== players.length) {
      return NextResponse.json({ error: "Each player needs their own phone number — vouchers are per person." }, { status: 400 });
    }
    if (new Set(players.map(p => `${p.mlbb_user_id}:${p.server_id}`)).size !== players.length) {
      return NextResponse.json({ error: "The same MLBB account is listed twice." }, { status: 400 });
    }

    const captainIdx = players.findIndex(p => p.phone === canonicalPhone(session.phone));
    if (captainIdx < 0) {
      return NextResponse.json(
        { error: `Your number (${session.phone}) must be one of the players — you're registering as captain.` },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const { count } = await supabase
      .from("tournament_teams")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", tournament.id)
      .in("registration_status", ["pending_payment", "payment_submitted", "approved"]);
    if ((count ?? 0) >= tournament.max_teams) {
      return NextResponse.json({ error: "Sorry, all team slots are taken." }, { status: 400 });
    }

    // Already in a team? (DB unique indexes catch races; this gives a clear message.)
    const { data: clash } = await supabase
      .from("tournament_players")
      .select("phone,mlbb_user_id,server_id,ign")
      .eq("tournament_id", tournament.id)
      .or(
        [
          `phone.in.(${players.map(p => p.phone).join(",")})`,
          `mlbb_user_id.in.(${players.map(p => p.mlbb_user_id).join(",")})`,
        ].join(",")
      );
    for (const c of clash || []) {
      const hit = players.find(p => p.phone === c.phone || (p.mlbb_user_id === c.mlbb_user_id && p.server_id === c.server_id));
      if (hit) {
        return NextResponse.json({ error: `${hit.ign} is already registered in another team.` }, { status: 409 });
      }
    }

    const captainCustomerId =
      session.customerId || (await findOrCreateCustomerByPhone(session.phone, players[captainIdx].full_name));

    const needsPayment = Number(tournament.entry_fee || 0) > 0;
    const { data: team, error: teamErr } = await supabase
      .from("tournament_teams")
      .insert([{
        tournament_id: tournament.id,
        name: teamName,
        short_name: shortName,
        captain_customer_id: captainCustomerId,
        contact_phone: session.phone,
        registration_status: needsPayment ? "pending_payment" : "payment_submitted",
      }])
      .select("id")
      .single();
    if (teamErr || !team) {
      if (String(teamErr?.message).includes("tournament_teams_name_uniq")) {
        return NextResponse.json({ error: "That team name is taken." }, { status: 409 });
      }
      throw new Error(teamErr?.message || "Could not create team");
    }

    const { error: playersErr } = await supabase.from("tournament_players").insert(
      players.map((p, i) => ({
        ...p,
        tournament_id: tournament.id,
        team_id: team.id,
        is_captain: i === captainIdx,
        customer_id: i === captainIdx ? captainCustomerId : null,
      }))
    );
    if (playersErr) {
      await supabase.from("tournament_teams").delete().eq("id", team.id);
      if (/tournament_players_(phone|mlbb)_uniq/.test(playersErr.message)) {
        return NextResponse.json({ error: "One of these players is already registered in another team." }, { status: 409 });
      }
      throw new Error(playersErr.message);
    }

    return NextResponse.json({ success: true, team_id: team.id, needs_payment: needsPayment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
