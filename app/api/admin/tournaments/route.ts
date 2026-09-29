import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sanitizeTournament, slugify } from "@/lib/tournament/admin-input";
import { isMissingTournamentSchema } from "@/lib/tournament/server";

// GET — every tournament with registration counts.
export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("tournaments").select("*").order("created_at", { ascending: false });
  if (error) {
    if (isMissingTournamentSchema(error.message)) {
      return NextResponse.json({ tournaments: [], needs_migration: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const ids = (data || []).map(t => t.id);
  const counts = new Map<string, Record<string, number>>();
  if (ids.length) {
    const { data: teams } = await supabase.from("tournament_teams").select("tournament_id,registration_status").in("tournament_id", ids);
    for (const t of teams || []) {
      const c = counts.get(t.tournament_id) || {};
      c[t.registration_status] = (c[t.registration_status] || 0) + 1;
      counts.set(t.tournament_id, c);
    }
  }
  return NextResponse.json({
    tournaments: (data || []).map(t => ({ ...t, team_counts: counts.get(t.id) || {} })),
  });
}

// POST — create (draft, unpublished).
export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fields = sanitizeTournament(body, false);
  const base = slugify(String(body.slug || fields.name || "tournament")) || "tournament";

  const supabase = createSupabaseAdminClient();
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const { data, error } = await supabase
      .from("tournaments")
      .insert([{ ...fields, slug, status: fields.status || "draft", published: fields.published ?? false }])
      .select("*")
      .single();
    if (!error) return NextResponse.json({ tournament: data });
    if (!/slug/i.test(error.message)) {
      if (isMissingTournamentSchema(error.message)) {
        return NextResponse.json({ error: "Run migration 20260929_tournament.sql in Supabase first." }, { status: 500 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "That link name is taken — choose another." }, { status: 409 });
}
