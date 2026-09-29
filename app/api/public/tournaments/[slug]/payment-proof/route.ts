import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCustomerSession, getTournamentBySlug } from "@/lib/tournament/server";
import { PAYMENT_BUCKET, uploadTournamentFile } from "@/lib/tournament/storage";

// POST multipart { file, payment_ref? } — the captain uploads the transfer
// receipt. Stored in a private bucket; only admins see it (signed URL).
// Allowed while pending or after a rejection (so they can fix it).
export async function POST(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  try {
    const tournament = await getTournamentBySlug(slug);
    if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

    const session = await getCustomerSession(req);
    if (!session?.customerId) {
      return NextResponse.json({ error: "Please sign in first.", code: "SIGN_IN_REQUIRED" }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: team } = await supabase
      .from("tournament_teams")
      .select("id,registration_status")
      .eq("tournament_id", tournament.id)
      .eq("captain_customer_id", session.customerId)
      .maybeSingle();
    if (!team) return NextResponse.json({ error: "Only the team captain can upload the receipt." }, { status: 403 });
    if (!["pending_payment", "payment_submitted", "rejected"].includes(team.registration_status)) {
      return NextResponse.json({ error: "This registration can't be changed any more." }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a receipt to upload." }, { status: 400 });
    const paymentRef = String(form.get("payment_ref") || "").trim().slice(0, 60) || null;

    let path: string;
    try {
      path = await uploadTournamentFile({ file, bucket: PAYMENT_BUCKET, prefix: `${tournament.id}/${team.id}` });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
    }

    const { error } = await supabase
      .from("tournament_teams")
      .update({
        payment_proof_path: path,
        payment_ref: paymentRef,
        payment_submitted_at: new Date().toISOString(),
        registration_status: "payment_submitted",
        reject_reason: null,
      })
      .eq("id", team.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
