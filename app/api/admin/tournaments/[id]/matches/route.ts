import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// POST — add a one-off match by hand (friendly, tiebreaker, third place…).
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const supabase = createSupabaseAdminClient();
  const { data: last } = await supabase
    .from("tournament_matches")
    .select("match_number")
    .eq("tournament_id", id)
    .order("match_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const scheduled = body.scheduled_at ? new Date(String(body.scheduled_at)) : null;
  const { data, error } = await supabase
    .from("tournament_matches")
    .insert([{
      tournament_id: id,
      match_number: (last?.match_number || 0) + 1,
      stage: body.stage === "knockout" ? "knockout" : "group",
      round_index: Math.max(1, Math.floor(Number(body.round_index) || 1)),
      round_name: String(body.round_name || "").trim().slice(0, 40) || null,
      group_name: String(body.group_name || "").trim().toUpperCase().slice(0, 10) || null,
      team_a_id: body.team_a_id || null,
      team_b_id: body.team_b_id || null,
      best_of: [1, 3, 5].includes(Number(body.best_of)) ? Number(body.best_of) : 1,
      scheduled_at: scheduled && !Number.isNaN(scheduled.getTime()) ? scheduled.toISOString() : null,
      station: String(body.station || "").trim().slice(0, 40) || null,
    }])
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, id: data.id });
}
