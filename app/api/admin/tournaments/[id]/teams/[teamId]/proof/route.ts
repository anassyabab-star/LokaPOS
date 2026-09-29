import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { signedReceiptUrl } from "@/lib/tournament/storage";

// GET — redirect to a short-lived signed URL for the team's payment receipt.
export async function GET(_req: Request, context: { params: Promise<{ id: string; teamId: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id, teamId } = await context.params;

  const supabase = createSupabaseAdminClient();
  const { data: team } = await supabase
    .from("tournament_teams")
    .select("payment_proof_path")
    .eq("id", teamId)
    .eq("tournament_id", id)
    .maybeSingle();
  if (!team?.payment_proof_path) return NextResponse.json({ error: "No receipt uploaded" }, { status: 404 });
  try {
    return NextResponse.redirect(await signedReceiptUrl(team.payment_proof_path));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
