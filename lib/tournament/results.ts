import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MATCH_COLS } from "./server";
import { MATCH_STATUSES, winsNeeded, type Match, type MatchStatus } from "./types";

// ============================================================================
// One path for every match edit, so the knockout bracket can't drift:
//   → completed : winner decided from the score, pushed into next_match slot
//   ← reopened  : winner cleared and pulled back out of the next match, as
//                 long as that match hasn't started
// Participants see the change through Realtime on tournament_matches.
// ============================================================================

export type MatchPatch = Partial<Pick<Match,
  "team_a_score" | "team_b_score" | "status" | "scheduled_at" | "station" | "lobby_info" |
  "best_of" | "admin_notes" | "team_a_id" | "team_b_id" | "round_name" | "group_name">>;

export class MatchError extends Error {}

function untouched(m: Pick<Match, "status" | "team_a_score" | "team_b_score">) {
  return ["scheduled", "check_in", "ready", "delayed"].includes(m.status) && m.team_a_score === 0 && m.team_b_score === 0;
}

export async function updateMatch(matchId: string, patch: MatchPatch): Promise<Match> {
  const supabase = createSupabaseAdminClient();
  const { data: row, error } = await supabase.from("tournament_matches").select(MATCH_COLS).eq("id", matchId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new MatchError("Match not found");
  const prev = row as Match;

  if (patch.status && !MATCH_STATUSES.includes(patch.status as MatchStatus)) throw new MatchError("Invalid status");
  if (patch.best_of !== undefined && ![1, 3, 5].includes(Number(patch.best_of))) throw new MatchError("Best of must be 1, 3 or 5");

  const next: Match = { ...prev, ...patch };
  next.team_a_score = Math.max(0, Math.floor(Number(next.team_a_score) || 0));
  next.team_b_score = Math.max(0, Math.floor(Number(next.team_b_score) || 0));
  const cap = winsNeeded(next.best_of);
  if (next.team_a_score > cap || next.team_b_score > cap) throw new MatchError(`BO${next.best_of}: max ${cap} game wins`);

  const wasDone = prev.status === "completed";
  const isDone = next.status === "completed";

  if (isDone) {
    if (!next.team_a_id || !next.team_b_id) throw new MatchError("Both teams must be set before completing");
    if (next.team_a_score === next.team_b_score) throw new MatchError("A completed match needs a winner — scores are level");
    next.winner_team_id = next.team_a_score > next.team_b_score ? next.team_a_id : next.team_b_id;
  } else {
    next.winner_team_id = null;
  }

  // Knockout advancement.
  const winnerChanged = prev.winner_team_id !== next.winner_team_id;
  if (next.next_match_id && next.next_slot && (winnerChanged || (wasDone && !isDone))) {
    const { data: nm } = await supabase.from("tournament_matches").select(MATCH_COLS).eq("id", next.next_match_id).maybeSingle();
    const nextMatch = nm as Match | null;
    if (nextMatch) {
      const slotKey = next.next_slot === "a" ? "team_a_id" : "team_b_id";
      const current = nextMatch[slotKey];
      const occupiedByOld = current && current === prev.winner_team_id;
      if (current && !occupiedByOld && current !== next.winner_team_id) {
        throw new MatchError("The next match already has a different team in that slot");
      }
      if (occupiedByOld && !untouched(nextMatch)) {
        throw new MatchError(`Match #${nextMatch.match_number} has already started — reset it first`);
      }
      const { error: advErr } = await supabase
        .from("tournament_matches")
        .update({ [slotKey]: next.winner_team_id, updated_at: new Date().toISOString() })
        .eq("id", nextMatch.id);
      if (advErr) throw new Error(advErr.message);
    }
  }

  const { data: saved, error: saveErr } = await supabase
    .from("tournament_matches")
    .update({
      team_a_id: next.team_a_id,
      team_b_id: next.team_b_id,
      team_a_score: next.team_a_score,
      team_b_score: next.team_b_score,
      best_of: next.best_of,
      winner_team_id: next.winner_team_id,
      status: next.status,
      scheduled_at: next.scheduled_at,
      station: next.station,
      lobby_info: next.lobby_info,
      admin_notes: next.admin_notes ?? null,
      round_name: next.round_name,
      group_name: next.group_name,
      updated_at: new Date().toISOString(),
    })
    .eq("id", matchId)
    .select(MATCH_COLS)
    .single();
  if (saveErr) throw new Error(saveErr.message);
  return saved as Match;
}
