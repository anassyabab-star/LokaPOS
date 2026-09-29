import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { issueTournamentVouchers } from "@/lib/tournament/rewards";

// POST { action: 'approve' | 'reject' | 'reissue', reason? }
//   approve → status approved, then every player's vouchers (idempotent)
//   reject  → status rejected with a reason the captain sees; they can re-upload
//   reissue → re-run voucher issuing (e.g. after fixing a player's phone)
export async function POST(req: Request, context: { params: Promise<{ id: string; teamId: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id, teamId } = await context.params;

  const body = (await req.json().catch(() => ({}))) as { action?: string; reason?: string };
  const supabase = createSupabaseAdminClient();
  const { data: team } = await supabase
    .from("tournament_teams")
    .select("id,registration_status")
    .eq("id", teamId)
    .eq("tournament_id", id)
    .maybeSingle();
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const reviewed = { reviewed_by: auth.user.id, reviewed_at: new Date().toISOString() };

  if (body.action === "reject") {
    const reason = String(body.reason || "").trim().slice(0, 300) || "Payment could not be verified.";
    const { error } = await supabase
      .from("tournament_teams")
      .update({ registration_status: "rejected", reject_reason: reason, ...reviewed })
      .eq("id", teamId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (body.action === "approve" || body.action === "reissue") {
    if (body.action === "approve") {
      const { error } = await supabase
        .from("tournament_teams")
        .update({ registration_status: "approved", reject_reason: null, ...reviewed })
        .eq("id", teamId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else if (team.registration_status !== "approved") {
      return NextResponse.json({ error: "Approve the team first" }, { status: 400 });
    }
    try {
      const issued = await issueTournamentVouchers(teamId);
      return NextResponse.json({ success: true, issued });
    } catch (error) {
      // Approved stands; the admin can press "Reissue vouchers" to retry.
      return NextResponse.json(
        { success: true, voucher_error: error instanceof Error ? error.message : "Voucher issuing failed" },
        { status: 207 }
      );
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
