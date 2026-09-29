import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sanitizeTournament } from "@/lib/tournament/admin-input";
import { loadAdminBundle } from "@/lib/tournament/server";

type Ctx = { params: Promise<{ id: string }> };

// GET — the whole tournament for the dashboard (all teams, players, receipts flags).
export async function GET(_req: Request, context: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const bundle = await loadAdminBundle(id);
    if (!bundle) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(bundle);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request, context: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fields = sanitizeTournament(body, true);
  if (!Object.keys(fields).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tournaments")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    const msg = /slug/i.test(error.message) ? "That link name is taken." : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ tournament: data });
}

export async function DELETE(_req: Request, context: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  const supabase = createSupabaseAdminClient();
  // Vouchers already issued stay with the players (they paid for them).
  const { error } = await supabase.from("tournaments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
