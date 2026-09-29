import type { Match, Team } from "./types";

// ============================================================================
// Standings, computed from match results every time rather than stored — so a
// corrected score can never leave a stale table behind. Client-safe.
//
// Order: points → match wins → head-to-head (mini-table among the tied teams)
// → game difference → games won → name. An admin `manual_position` pins a
// team to that spot afterwards.
// ============================================================================

export type StandingRow = {
  team: Team;
  played: number;
  wins: number;
  losses: number;
  game_wins: number;
  game_losses: number;
  diff: number;
  points: number;
  position: number;
};

type Scoring = { points_win: number; points_loss: number };

function tally(teams: Team[], matches: Match[], scoring: Scoring) {
  const rows = new Map<string, StandingRow>();
  for (const t of teams) {
    rows.set(t.id, { team: t, played: 0, wins: 0, losses: 0, game_wins: 0, game_losses: 0, diff: 0, points: 0, position: 0 });
  }
  for (const m of matches) {
    if (m.status !== "completed" || !m.team_a_id || !m.team_b_id || !m.winner_team_id) continue;
    const a = rows.get(m.team_a_id);
    const b = rows.get(m.team_b_id);
    if (!a || !b) continue;
    a.played++; b.played++;
    a.game_wins += m.team_a_score; a.game_losses += m.team_b_score;
    b.game_wins += m.team_b_score; b.game_losses += m.team_a_score;
    const [w, l] = m.winner_team_id === a.team.id ? [a, b] : [b, a];
    w.wins++; w.points += scoring.points_win;
    l.losses++; l.points += scoring.points_loss;
  }
  for (const r of rows.values()) r.diff = r.game_wins - r.game_losses;
  return rows;
}

export function computeStandings(
  teams: Team[],
  matches: Match[],
  scoring: Scoring,
  group?: string | null
): StandingRow[] {
  const inGroup = group === undefined ? teams : teams.filter(t => (t.group_name || null) === (group || null));
  const ids = new Set(inGroup.map(t => t.id));
  const groupMatches = matches.filter(
    m => m.stage === "group" && m.team_a_id && m.team_b_id && ids.has(m.team_a_id) && ids.has(m.team_b_id)
  );
  const rows = [...tally(inGroup, groupMatches, scoring).values()];

  const tieBreak = (x: StandingRow, y: StandingRow) =>
    y.diff - x.diff || y.game_wins - x.game_wins || x.team.name.localeCompare(y.team.name);

  rows.sort((x, y) => y.points - x.points || y.wins - x.wins || tieBreak(x, y));

  // Head-to-head inside each cluster still level on points + wins.
  const out: StandingRow[] = [];
  for (let i = 0; i < rows.length; ) {
    let j = i + 1;
    while (j < rows.length && rows[j].points === rows[i].points && rows[j].wins === rows[i].wins) j++;
    const cluster = rows.slice(i, j);
    if (cluster.length > 1) {
      const cIds = new Set(cluster.map(r => r.team.id));
      const mini = tally(
        cluster.map(r => r.team),
        groupMatches.filter(m => cIds.has(m.team_a_id!) && cIds.has(m.team_b_id!)),
        scoring
      );
      cluster.sort((x, y) => {
        const mx = mini.get(x.team.id)!, my = mini.get(y.team.id)!;
        return my.points - mx.points || my.diff - mx.diff || tieBreak(x, y);
      });
    }
    out.push(...cluster);
    i = j;
  }

  // Manual overrides pin a team to a spot; everyone else fills around them.
  const pinned = out.filter(r => r.team.manual_position && r.team.manual_position > 0)
    .sort((x, y) => x.team.manual_position! - y.team.manual_position!);
  if (pinned.length) {
    const free = out.filter(r => !pinned.includes(r));
    const slots: (StandingRow | null)[] = new Array(out.length).fill(null);
    for (const p of pinned) {
      let at = Math.min(out.length, p.team.manual_position!) - 1;
      while (at < slots.length && slots[at]) at++;
      if (at >= slots.length) { free.unshift(p); continue; }
      slots[at] = p;
    }
    for (let k = 0; k < slots.length; k++) if (!slots[k]) slots[k] = free.shift() || null;
    out.splice(0, out.length, ...(slots.filter(Boolean) as StandingRow[]));
  }

  out.forEach((r, k) => { r.position = k + 1; });
  return out;
}

/** Distinct group names in play, sorted; [null] when there are no groups. */
export function groupNames(teams: Team[]): (string | null)[] {
  const names = [...new Set(teams.map(t => t.group_name).filter(Boolean) as string[])].sort();
  return names.length ? names : [null];
}
