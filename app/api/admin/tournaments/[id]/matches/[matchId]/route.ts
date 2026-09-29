import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { requireStaffApi } from "@/lib/staff-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MatchError, updateMatch, type MatchPatch } from "@/lib/tournament/results";

type Ctx = { params: Promise<{ id: string; matchId: string }> };

const KEYS: (keyof MatchPatch)[] = [
  "team_a_score", "team_b_score", "status", "scheduled_at", "station", "lobby_info",
  "best_of", "admin_notes", "team_a_id", "team_b_id", "round_name", "group_name",
];

// PATCH — score / status / time. Staff too: whoever is at the counter during
// the event can run results from their phone.
export async function PATCH(req: Request, context: Ctx) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;
  const { id, matchId } = await context.params;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: MatchPatch = {};
  for (const k of KEYS) {
    if (!(k in body)) continue;
    const v = body[k];
    if (k === "scheduled_at") {
      const d = v ? new Date(String(v)) : null;
      patch.scheduled_at = d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
    } else if (k === "team_a_score" || k === "team_b_score" || k === "best_of") {
      patch[k] = Number(v);
    } else {
      (patch as Record<string, unknown>)[k] = v === "" ? null : v;
    }
  }

  const supabase = createSupabaseAdminClient();
  const { data: owner } = await supabase.from("tournament_matches").select("tournament_id").eq("id", matchId).maybeSingle();
  if (!owner || owner.tournament_id !== id) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  try {
    const match = await updateMatch(matchId, patch);
    return NextResponse.json({ match });
  } catch (error) {
    const status = error instanceof MatchError ? 400 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status });
  }
}

export async function DELETE(_req: Request, context: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id, matchId } = await context.params;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("tournament_matches").delete().eq("id", matchId).eq("tournament_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
