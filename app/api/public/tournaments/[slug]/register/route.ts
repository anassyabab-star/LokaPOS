import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { canonicalPhone, isPlausiblePhone } from "@/lib/phone";
import { findOrCreateCustomerByPhone, getCustomerSession, getTournamentBySlug } from "@/lib/tournament/server";
import { PLAYER_ROLES, type PlayerRole } from "@/lib/tournament/types";

// ============================================================================
// POST /api/public/tournaments/[slug]/register — a captain registers a team.
//
// The captain must be signed in (Google or phone OTP) and is players[0]:
// their verified phone is how we know who owns the entry, and where the
// voucher goes. Teammates only need an IGN and MLBB User ID; a phone for a
// teammate is optional (with one, they get a voucher of their own too).
// Server ID isn't asked for — the User ID finds a player for a custom room.
//
// Body: { team: { name, short_name? }, players: [{ full_name? (captain),
//         ign, mlbb_user_id, phone? (teammates, optional), player_role }] }
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
    const captainPhone = canonicalPhone(session.phone);
    const players = rawPlayers.map((p, i) => {
      const phone = i === 0 ? captainPhone : canonicalPhone(p.phone);
      return {
        full_name: clean(p.full_name) || null,
        ign: clean(p.ign, 30),
        mlbb_user_id: clean(p.mlbb_user_id, 20).replace(/\D/g, ""),
        server_id: clean(p.server_id, 10).replace(/\D/g, "") || null,
        phone: phone && isPlausiblePhone(phone) ? phone : null,
        player_role: (PLAYER_ROLES.includes(p.player_role as PlayerRole) ? p.player_role : "sub") as PlayerRole,
      };
    });

    if (players.length < tournament.min_players || players.length > tournament.max_players) {
      return NextResponse.json(
        { error: `A team needs ${tournament.min_players}–${tournament.max_players} players.` },
        { status: 400 }
      );
    }
    if (!players[0].full_name) return NextResponse.json({ error: "Enter your full name (captain)." }, { status: 400 });
    for (const [i, p] of players.entries()) {
      if (!p.ign || !p.mlbb_user_id) {
        return NextResponse.json({ error: `Player ${i + 1}: IGN and MLBB User ID are required.` }, { status: 400 });
      }
    }
    const phones = players.map(p => p.phone).filter(Boolean) as string[];
    if (new Set(phones).size !== phones.length) {
      return NextResponse.json({ error: "The same phone number is listed for two players." }, { status: 400 });
    }
    if (new Set(players.map(p => p.mlbb_user_id)).size !== players.length) {
      return NextResponse.json({ error: "The same MLBB User ID is listed twice." }, { status: 400 });
    }
    const captainIdx = 0;

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
          `phone.in.(${phones.join(",")})`,
          `mlbb_user_id.in.(${players.map(p => p.mlbb_user_id).join(",")})`,
        ].join(",")
      );
    for (const c of clash || []) {
      const hit = players.find(p => (p.phone && p.phone === c.phone) || p.mlbb_user_id === c.mlbb_user_id);
      if (hit) {
        return NextResponse.json({ error: `${hit.ign} is already registered in another team.` }, { status: 409 });
      }
    }

    const captainCustomerId =
      session.customerId || (await findOrCreateCustomerByPhone(session.phone, players[captainIdx].full_name || ""));

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
      if (/tournament_players_(phone|mlbb\w*)_uniq/.test(playersErr.message)) {
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
