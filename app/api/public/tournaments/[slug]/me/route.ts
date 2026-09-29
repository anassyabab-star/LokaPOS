import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { phoneVariants } from "@/lib/phone";
import { getCustomerSession, getTournamentBySlug } from "@/lib/tournament/server";

export const revalidate = 0;

// GET — the signed-in customer's registration in this tournament, as captain
// or as a listed player. Teammates' phones are only shown to the captain.
export async function GET(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  try {
    const tournament = await getTournamentBySlug(slug);
    if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

    const session = await getCustomerSession(req);
    if (!session) return NextResponse.json({ signed_in: false, team: null });

    const supabase = createSupabaseAdminClient();
    let teamId: string | null = null;
    if (session.customerId) {
      const { data } = await supabase
        .from("tournament_teams")
        .select("id")
        .eq("tournament_id", tournament.id)
        .eq("captain_customer_id", session.customerId)
        .maybeSingle();
      teamId = data?.id ?? null;
    }
    if (!teamId) {
      const { data } = await supabase
        .from("tournament_players")
        .select("team_id")
        .eq("tournament_id", tournament.id)
        .in("phone", phoneVariants(session.phone))
        .limit(1)
        .maybeSingle();
      teamId = data?.team_id ?? null;
    }
    if (!teamId) return NextResponse.json({ signed_in: true, phone: session.phone, team: null });

    const [{ data: team }, { data: players }] = await Promise.all([
      supabase
        .from("tournament_teams")
        .select("id,name,short_name,registration_status,reject_reason,payment_proof_path,payment_ref,payment_submitted_at,captain_customer_id,group_name,team_number")
        .eq("id", teamId)
        .maybeSingle(),
      supabase
        .from("tournament_players")
        .select("id,full_name,ign,mlbb_user_id,server_id,phone,player_role,is_captain")
        .eq("team_id", teamId)
        .order("is_captain", { ascending: false }),
    ]);
    if (!team) return NextResponse.json({ signed_in: true, phone: session.phone, team: null });

    const isCaptain = !!session.customerId && team.captain_customer_id === session.customerId;
    return NextResponse.json({
      signed_in: true,
      phone: session.phone,
      is_captain: isCaptain,
      team: {
        id: team.id,
        name: team.name,
        short_name: team.short_name,
        registration_status: team.registration_status,
        reject_reason: team.reject_reason,
        has_payment_proof: !!team.payment_proof_path,
        payment_ref: team.payment_ref,
        payment_submitted_at: team.payment_submitted_at,
        group_name: team.group_name,
        team_number: team.team_number,
        players: (players || []).map(p => ({ ...p, phone: isCaptain ? p.phone : undefined })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
