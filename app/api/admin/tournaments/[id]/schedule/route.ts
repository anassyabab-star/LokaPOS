import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadAdminBundle } from "@/lib/tournament/server";
import {
  applyTiming, assignGroups, buildGroupStage, buildKnockout, seedsFromGroups, type NewMatch,
} from "@/lib/tournament/schedule";
import type { Team } from "@/lib/tournament/types";

// POST { action, start_at?, interval_minutes?, stations?, force? }
//   generate      — build every fixture for the format (replaces existing ones;
//                   refused once any match has a score unless force)
//   seed_knockout — group_knockout only: fill the knockout's first round from
//                   the final group tables
//   clear         — delete all matches
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const bundle = await loadAdminBundle(id);
  if (!bundle) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { tournament, matches } = bundle;
  const supabase = createSupabaseAdminClient();

  // Byes are "completed" at generation time; they don't count as results.
  const played = matches.some(
    m => (m.status === "completed" && !String(m.round_name || "").includes("(bye)")) || m.team_a_score > 0 || m.team_b_score > 0
  );

  if (body.action === "clear") {
    if (played && !body.force) return NextResponse.json({ error: "Matches already have results.", code: "HAS_RESULTS" }, { status: 409 });
    const { error } = await supabase.from("tournament_matches").delete().eq("tournament_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const timing = {
    startAt: (body.start_at as string) || tournament.start_at,
    intervalMinutes: Number(body.interval_minutes ?? 30),
    stations: Number(body.stations ?? 1),
  };

  if (body.action === "generate") {
    if (played && !body.force) return NextResponse.json({ error: "Matches already have results.", code: "HAS_RESULTS" }, { status: 409 });

    let teams: Team[] = bundle.teams.filter(t => t.registration_status === "approved");
    if (teams.length < 2) return NextResponse.json({ error: "Need at least 2 approved teams." }, { status: 400 });

    // Team numbers for display, in registration order, where missing.
    let nextNo = Math.max(0, ...teams.map(t => t.team_number || 0)) + 1;
    for (const t of teams) {
      if (!t.team_number) {
        t.team_number = nextNo++;
        await supabase.from("tournament_teams").update({ team_number: t.team_number }).eq("id", t.id);
      }
    }

    let rows: NewMatch[] = [];
    if (tournament.format === "round_robin") {
      teams = teams.map(t => ({ ...t, group_name: null }));
      await supabase.from("tournament_teams").update({ group_name: null }).in("id", teams.map(t => t.id));
      rows = buildGroupStage(tournament, teams);
    } else if (tournament.format === "single_elim") {
      const seeded = [...teams].sort(
        (a, b) => (a.seed ?? 999) - (b.seed ?? 999) || (a.team_number ?? 999) - (b.team_number ?? 999)
      );
      rows = buildKnockout(tournament, seeded.map(t => t.id), 1);
    } else {
      // Keep the groups from the draw (set by hand); snake-draft only when no
      // team has one. A half-finished draw is refused, not silently filled.
      const missing = teams.filter(t => !t.group_name);
      if (missing.length && missing.length < teams.length) {
        return NextResponse.json(
          { error: `${missing.length} team belum ada group: ${missing.map(t => t.name).join(", ")}` },
          { status: 400 }
        );
      }
      if (missing.length) {
        const groups = assignGroups(teams, tournament.group_count);
        teams = teams.map(t => ({ ...t, group_name: groups.get(t.id) || null }));
        for (const t of teams) await supabase.from("tournament_teams").update({ group_name: t.group_name }).eq("id", t.id);
      }
      const groupRows = buildGroupStage(tournament, teams);
      const groupCount = new Set(teams.map(t => t.group_name)).size;
      const slots = new Array(groupCount * tournament.advance_per_group).fill(null);
      rows = [...groupRows, ...buildKnockout(tournament, slots, groupRows.length + 1, true)];
    }
    applyTiming(rows, timing);

    const { error: delErr } = await supabase.from("tournament_matches").delete().eq("tournament_id", id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    // Later rounds first so every next_match_id already exists.
    const ordered = [...rows].sort((a, b) =>
      (a.stage === b.stage ? 0 : a.stage === "knockout" ? -1 : 1) || b.round_index - a.round_index
    );
    const { error } = await supabase.from("tournament_matches").insert(ordered);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, matches: rows.length });
  }

  if (body.action === "seed_knockout") {
    if (tournament.format !== "group_knockout") return NextResponse.json({ error: "Only for Group + Knockout." }, { status: 400 });
    const approved = bundle.teams.filter(t => t.registration_status === "approved");
    const pending = matches.filter(m => m.stage === "group" && !["completed", "cancelled"].includes(m.status));
    if (pending.length && !body.force) {
      return NextResponse.json({ error: `${pending.length} group matches aren't finished.`, code: "GROUPS_UNFINISHED" }, { status: 409 });
    }
    const knockout = matches.filter(m => m.stage === "knockout");
    if (knockout.some(m => m.status === "completed" || m.team_a_score > 0 || m.team_b_score > 0)) {
      return NextResponse.json({ error: "Knockout has already started." }, { status: 409 });
    }
    const seeds = seedsFromGroups(tournament, approved, matches);
    const firstRound = knockout.filter(m => m.round_index === 1);
    const size = firstRound.length * 2;
    const fresh = buildKnockout(tournament, [...seeds, ...new Array(Math.max(0, size - seeds.length)).fill(null)].slice(0, size), 0);
    // Copy the fresh bracket's teams onto the existing rows slot by slot —
    // later rounds come across empty, or holding a team a bye pushed forward.
    const existingBySlot = new Map(knockout.map(m => [`${m.round_index}:${m.bracket_slot}`, m]));
    for (const f of fresh) {
      const target = existingBySlot.get(`${f.round_index}:${f.bracket_slot}`);
      if (!target) continue;
      await supabase
        .from("tournament_matches")
        .update({
          team_a_id: f.team_a_id,
          team_b_id: f.team_b_id,
          status: f.status,
          winner_team_id: f.winner_team_id,
          round_name: f.round_name,
          team_a_score: 0,
          team_b_score: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", target.id);
    }
    return NextResponse.json({ success: true, seeds: seeds.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
