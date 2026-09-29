import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sanitizePlayer, sanitizeTeam } from "@/lib/tournament/admin-input";

type Ctx = { params: Promise<{ id: string; teamId: string }> };

// PATCH — team fields, and optionally `players` (full list: rows with an id
// are updated, new rows inserted, missing rows removed).
export async function PATCH(req: Request, context: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id, teamId } = await context.params;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const supabase = createSupabaseAdminClient();

  const fields = sanitizeTeam(body);
  if ("name" in fields && !fields.name) return NextResponse.json({ error: "Team name is required" }, { status: 400 });
  if (Object.keys(fields).length) {
    const { error } = await supabase.from("tournament_teams").update(fields).eq("id", teamId).eq("tournament_id", id);
    if (error) {
      const msg = error.message.includes("name_uniq") ? "That team name is taken." : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  if (Array.isArray(body.players)) {
    const incoming = (body.players as Record<string, unknown>[]).map(p => ({ id: p.id ? String(p.id) : null, ...sanitizePlayer(p) }));
    for (const p of incoming) {
      if (!p.ign || !p.phone || !p.mlbb_user_id || !p.server_id) {
        return NextResponse.json({ error: `${p.ign || "A player"}: IGN, phone, MLBB ID and Server ID are required` }, { status: 400 });
      }
    }
    const { data: existing } = await supabase.from("tournament_players").select("id,phone").eq("team_id", teamId);
    const phoneById = new Map((existing || []).map(r => [r.id as string, r.phone as string]));
    const keep = new Set(incoming.filter(p => p.id).map(p => p.id));
    const removed = (existing || []).map(r => r.id).filter(pid => !keep.has(pid));
    if (removed.length) await supabase.from("tournament_players").delete().in("id", removed);
    for (const p of incoming) {
      const { id: pid, ...row } = p;
      // A corrected phone means a different customer: unlink so "Reissue
      // vouchers" issues to the new number.
      const relink = pid && phoneById.get(pid) !== row.phone ? { customer_id: null } : {};
      const { error } = pid
        ? await supabase.from("tournament_players").update({ ...row, ...relink }).eq("id", pid).eq("team_id", teamId)
        : await supabase.from("tournament_players").insert([{ ...row, team_id: teamId, tournament_id: id }]);
      if (error) {
        const msg = /_uniq/.test(error.message) ? `${p.ign} is already in another team (same phone or MLBB ID).` : error.message;
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: Request, context: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id, teamId } = await context.params;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("tournament_teams").delete().eq("id", teamId).eq("tournament_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
