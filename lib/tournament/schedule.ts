import { randomUUID } from "crypto";
import { THIRD_PLACE_ROUND, type Match, type Team, type Tournament } from "./types";
import { computeStandings, groupNames } from "./standings";

// ============================================================================
// Fixture generation. Pure functions that return match rows; the API route
// writes them. Knockout rows carry next_match_id/next_slot so a completed
// match can push its winner forward (lib/tournament/results.ts).
// ============================================================================

export type NewMatch = Omit<Match, "updated_at" | "admin_notes">;

export type TimingOpts = { startAt: string | null; intervalMinutes: number; stations: number };

/** Circle-method round robin. Returns rounds of [a, b] pairs. */
export function roundRobinRounds(ids: string[]): [string, string][][] {
  const list: (string | null)[] = [...ids];
  if (list.length < 2) return [];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i];
      if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop()!); // rotate all but the first
  }
  return rounds;
}

/** Standard bracket order: seed 1 meets the last seed, 2 meets the second-last, top halves kept apart. */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const next = order.length * 2 + 1;
    order = order.flatMap(s => [s, next - s]);
  }
  return order;
}

export function knockoutRoundName(roundIndex: number, totalRounds: number) {
  const fromEnd = totalRounds - roundIndex;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semi Final";
  if (fromEnd === 2) return "Quarter Final";
  return `Round of ${2 ** (fromEnd + 1)}`;
}

function baseRow(tournamentId: string): Omit<NewMatch, "id" | "match_number" | "stage" | "round_index"> {
  return {
    tournament_id: tournamentId,
    round_name: null,
    bracket_slot: null,
    group_name: null,
    team_a_id: null,
    team_b_id: null,
    team_a_score: 0,
    team_b_score: 0,
    best_of: 1,
    winner_team_id: null,
    scheduled_at: null,
    station: null,
    lobby_info: null,
    status: "scheduled",
    next_match_id: null,
    next_slot: null,
  };
}

/** Round robin for each group, rounds interleaved across groups so no group waits. */
export function buildGroupStage(tournament: Tournament, teams: Team[], startNumber = 1): NewMatch[] {
  const perGroup = groupNames(teams).map(g => ({
    group: g,
    rounds: roundRobinRounds(teams.filter(t => (t.group_name || null) === g).map(t => t.id)),
  }));
  const maxRounds = Math.max(0, ...perGroup.map(g => g.rounds.length));
  const out: NewMatch[] = [];
  let n = startNumber;
  for (let r = 0; r < maxRounds; r++) {
    for (const g of perGroup) {
      for (const [a, b] of g.rounds[r] || []) {
        out.push({
          ...baseRow(tournament.id),
          id: randomUUID(),
          match_number: n++,
          stage: "group",
          round_index: r + 1,
          round_name: `Round ${r + 1}`,
          group_name: g.group,
          team_a_id: a,
          team_b_id: b,
          best_of: tournament.default_best_of,
        });
      }
    }
  }
  return out;
}

/**
 * Single-elimination bracket for `size` slots (rounded up to a power of two).
 * `seeded[i]` is seed i+1's team id, or null for an empty slot (a bye, or
 * "decided later" when built before the group stage finishes). First-round
 * byes are completed immediately and the team moved on.
 */
export function buildKnockout(
  tournament: Tournament,
  seeded: (string | null)[],
  startNumber: number,
  fillLater = false
): NewMatch[] {
  const size = Math.max(2, 2 ** Math.ceil(Math.log2(Math.max(2, seeded.length))));
  const totalRounds = Math.log2(size);
  const rounds: NewMatch[][] = [];
  for (let r = 1; r <= totalRounds; r++) {
    const count = size / 2 ** r;
    rounds.push(
      Array.from({ length: count }, (_, slot) => ({
        ...baseRow(tournament.id),
        id: randomUUID(),
        match_number: 0,
        stage: "knockout" as const,
        round_index: r,
        round_name: knockoutRoundName(r, totalRounds),
        bracket_slot: slot,
        best_of: tournament.knockout_best_of,
      }))
    );
  }
  // Wire each match to the one its winner goes to.
  for (let r = 0; r < rounds.length - 1; r++) {
    rounds[r].forEach((m, slot) => {
      m.next_match_id = rounds[r + 1][Math.floor(slot / 2)].id;
      m.next_slot = slot % 2 ? "b" : "a";
    });
  }
  // Seed the first round.
  const order = seedOrder(size);
  rounds[0].forEach((m, slot) => {
    m.team_a_id = seeded[order[slot * 2] - 1] ?? null;
    m.team_b_id = seeded[order[slot * 2 + 1] - 1] ?? null;
  });
  if (!fillLater) {
    const byId = new Map(rounds.flat().map(m => [m.id, m]));
    for (const m of rounds[0]) {
      const only = (m.team_a_id && !m.team_b_id) ? m.team_a_id : (!m.team_a_id && m.team_b_id) ? m.team_b_id : null;
      if (!only) continue;
      m.status = "completed";
      m.winner_team_id = only;
      m.round_name = `${m.round_name} (bye)`;
      const next = m.next_match_id ? byId.get(m.next_match_id) : null;
      if (next) {
        if (m.next_slot === "a") next.team_a_id = only; else next.team_b_id = only;
      }
    }
  }
  // Third-place match once there are semi-finals: the semi losers drop into it.
  const third: NewMatch | null = totalRounds >= 2
    ? {
        ...baseRow(tournament.id),
        id: randomUUID(),
        match_number: 0,
        stage: "knockout",
        round_index: totalRounds,
        round_name: THIRD_PLACE_ROUND,
        bracket_slot: 1,
        best_of: tournament.knockout_best_of,
      }
    : null;
  // Numbered (and so timed) just before the Final.
  const ordered = third ? [...rounds.slice(0, -1).flat(), third, ...rounds[rounds.length - 1]] : rounds.flat();
  let n = startNumber;
  for (const m of ordered) m.match_number = n++;
  return ordered;
}

/** Give each match a start time and station, in match-number order. */
export function applyTiming(matches: NewMatch[], opts: TimingOpts) {
  const stations = Math.max(1, Math.floor(opts.stations || 1));
  const interval = Math.max(0, Number(opts.intervalMinutes || 0));
  const start = opts.startAt ? new Date(opts.startAt).getTime() : null;
  const playable = [...matches].filter(m => m.status !== "completed").sort((a, b) => a.match_number - b.match_number);
  // A knockout round waits for the one before it, so it starts a fresh slot.
  let slot = 0, used = 0, round = "";
  for (const m of playable) {
    const key = m.stage === "knockout" ? `ko:${m.round_index}` : "group";
    if (key !== round && used > 0) { slot++; used = 0; }
    if (used === stations) { slot++; used = 0; }
    round = key;
    m.station = `Station ${used + 1}`;
    if (start !== null) m.scheduled_at = new Date(start + slot * interval * 60_000).toISOString();
    used++;
  }
  return matches;
}

/** Snake-draft teams into groups A, B, C… by seed (then team number, then name). */
export function assignGroups(teams: Team[], groupCount: number): Map<string, string> {
  const count = Math.max(1, Math.floor(groupCount));
  const sorted = [...teams].sort(
    (a, b) =>
      (a.seed ?? 999) - (b.seed ?? 999) ||
      (a.team_number ?? 999) - (b.team_number ?? 999) ||
      a.name.localeCompare(b.name)
  );
  const out = new Map<string, string>();
  sorted.forEach((t, i) => {
    const lap = Math.floor(i / count);
    const idx = lap % 2 ? count - 1 - (i % count) : i % count;
    out.set(t.id, String.fromCharCode(65 + idx));
  });
  return out;
}

/**
 * Knockout seeds from finished group tables: all group winners first (A1, B1…),
 * then runners-up, etc. With standard seeding that pairs A1 v B2, B1 v A2.
 */
export function seedsFromGroups(tournament: Tournament, teams: Team[], matches: Match[]): string[] {
  const tables = groupNames(teams).map(g => computeStandings(teams, matches, tournament, g));
  const seeds: string[] = [];
  for (let place = 0; place < tournament.advance_per_group; place++) {
    for (const table of tables) if (table[place]) seeds.push(table[place].team.id);
  }
  return seeds;
}
