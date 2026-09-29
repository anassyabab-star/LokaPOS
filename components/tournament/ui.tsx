"use client";

import { useEffect, useState } from "react";
import { MATCH_STATUS_LABEL, type Match, type MatchStatus, type Team } from "@/lib/tournament/types";
import type { StandingRow } from "@/lib/tournament/standings";

// ============================================================================
// Tournament building blocks, dark esports style. Used by the participant app
// and (inside a dark card) by the dashboard, so both show the same thing.
// ============================================================================

export const tz = "Asia/Kuala_Lumpur";

export function formatWhen(iso: string | null | undefined, opts?: { dateOnly?: boolean; timeOnly?: boolean }) {
  if (!iso) return "TBA";
  const d = new Date(iso);
  if (opts?.timeOnly) return d.toLocaleTimeString("en-MY", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  if (opts?.dateOnly) return d.toLocaleDateString("en-MY", { timeZone: tz, day: "numeric", month: "long", year: "numeric" });
  return d.toLocaleString("en-MY", { timeZone: tz, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** Re-renders every `ms`; for countdowns. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function countdownParts(target: string | null | undefined, now: number) {
  if (!target) return null;
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return null;
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return { d, text: d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}` };
}

export function Countdown({ to, label }: { to: string | null | undefined; label: string }) {
  const now = useNow();
  const parts = countdownParts(to, now);
  if (!parts) return null;
  return (
    <div className="text-center">
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">{label}</div>
      <div className="mt-1 font-display text-3xl font-bold tabular-nums tracking-tight text-white">{parts.text}</div>
    </div>
  );
}

const PILL: Record<MatchStatus, string> = {
  scheduled: "bg-sky-500/15 text-sky-300",
  check_in: "bg-violet-500/15 text-violet-300",
  ready: "bg-emerald-500/15 text-emerald-300",
  live: "bg-red-500 text-white",
  completed: "bg-white/10 text-white/60",
  delayed: "bg-amber-500/15 text-amber-300",
  cancelled: "bg-white/5 text-white/30 line-through",
};

export function StatusPill({ status, className = "" }: { status: MatchStatus; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PILL[status]} ${className}`}>
      {status === "live" && <span className="h-1.5 w-1.5 animate-blink rounded-full bg-white" />}
      {MATCH_STATUS_LABEL[status]}
    </span>
  );
}

export function TeamLogo({ team, size = 36 }: { team: Pick<Team, "name" | "short_name" | "logo_url"> | null | undefined; size?: number }) {
  const label = (team?.short_name || team?.name || "?").slice(0, 3).toUpperCase();
  if (team?.logo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={team.logo_url} alt="" width={size} height={size} className="shrink-0 rounded-xl object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-700 to-red-950 font-display font-bold text-white/90"
      style={{ width: size, height: size, fontSize: size * 0.3 }}
    >
      {team ? label : "?"}
    </div>
  );
}

export type TeamsById = Map<string, Team>;

function TeamLine({ team, score, won, dim, showScore, highlight }: {
  team: Team | undefined; score: number; won: boolean; dim: boolean; showScore: boolean; highlight: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 ${dim ? "opacity-45" : ""}`}>
      <TeamLogo team={team} size={30} />
      <span className={`min-w-0 flex-1 truncate text-[15px] font-semibold ${highlight ? "text-red-300" : "text-white"}`}>
        {team?.name || "TBD"}
      </span>
      {showScore && (
        <span className={`font-display text-2xl font-bold tabular-nums ${won ? "text-white" : "text-white/50"}`}>{score}</span>
      )}
    </div>
  );
}

export function MatchCard({ match, teams, myTeamId, onClick, compact }: {
  match: Match; teams: TeamsById; myTeamId?: string | null; onClick?: () => void; compact?: boolean;
}) {
  const a = match.team_a_id ? teams.get(match.team_a_id) : undefined;
  const b = match.team_b_id ? teams.get(match.team_b_id) : undefined;
  const done = match.status === "completed";
  const live = match.status === "live";
  const showScore = done || live || match.team_a_score > 0 || match.team_b_score > 0;
  const mine = !!myTeamId && (match.team_a_id === myTeamId || match.team_b_id === myTeamId);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`block w-full rounded-2xl border p-4 text-left transition ${
        live ? "border-red-500/60 bg-red-500/[0.07]" : mine ? "border-red-400/30 bg-white/[0.04]" : "border-white/10 bg-white/[0.03]"
      } ${onClick ? "active:scale-[.99]" : ""}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-bold uppercase tracking-wider text-white/40">
          Match #{String(match.match_number).padStart(2, "0")}
          {match.round_name ? ` · ${match.round_name}` : ""}
          {match.group_name ? ` · Group ${match.group_name}` : ""}
        </span>
        <StatusPill status={match.status} />
      </div>
      <div className="space-y-2">
        <TeamLine team={a} score={match.team_a_score} won={match.winner_team_id === match.team_a_id && !!a} dim={done && match.winner_team_id !== match.team_a_id} showScore={showScore} highlight={match.team_a_id === myTeamId} />
        <TeamLine team={b} score={match.team_b_score} won={match.winner_team_id === match.team_b_id && !!b} dim={done && match.winner_team_id !== match.team_b_id} showScore={showScore} highlight={match.team_b_id === myTeamId} />
      </div>
      {!compact && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/5 pt-3 text-[12px] text-white/50">
          <span>{formatWhen(match.scheduled_at)}</span>
          {match.station && <span>· {match.station}</span>}
          <span>· BO{match.best_of}</span>
          {match.lobby_info && !done && <span className="w-full text-white/70">🎮 {match.lobby_info}</span>}
        </div>
      )}
    </Tag>
  );
}

export function StandingsTable({ rows, myTeamId, advance = 0, title }: {
  rows: StandingRow[]; myTeamId?: string | null; advance?: number; title?: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      {title && <div className="border-b border-white/10 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white/50">{title}</div>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[340px] text-[13px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-white/35">
              <th className="px-3 py-2 text-left font-semibold">#</th>
              <th className="px-2 py-2 text-left font-semibold">Team</th>
              <th className="px-1.5 py-2 text-center font-semibold">P</th>
              <th className="px-1.5 py-2 text-center font-semibold">W</th>
              <th className="px-1.5 py-2 text-center font-semibold">L</th>
              <th className="px-1.5 py-2 text-center font-semibold">+/-</th>
              <th className="px-3 py-2 text-right font-semibold">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const mine = r.team.id === myTeamId;
              const through = advance > 0 && r.position <= advance;
              return (
                <tr key={r.team.id} className={`border-t border-white/5 ${mine ? "bg-red-500/10" : ""}`}>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-lg text-[12px] font-bold ${through ? "bg-emerald-500/20 text-emerald-300" : "text-white/50"}`}>
                      {r.position}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <TeamLogo team={r.team} size={24} />
                      <span className={`truncate font-semibold ${mine ? "text-red-300" : "text-white"}`}>{r.team.name}</span>
                    </div>
                  </td>
                  <td className="px-1.5 py-2.5 text-center tabular-nums text-white/60">{r.played}</td>
                  <td className="px-1.5 py-2.5 text-center tabular-nums text-white/80">{r.wins}</td>
                  <td className="px-1.5 py-2.5 text-center tabular-nums text-white/60">{r.losses}</td>
                  <td className="px-1.5 py-2.5 text-center tabular-nums text-white/60">{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                  <td className="px-3 py-2.5 text-right font-display text-[15px] font-bold tabular-nums text-white">{r.points}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-white/40">No teams yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Knockout bracket: one column per round, horizontal scroll on phones. */
export function Bracket({ matches, teams, myTeamId, onMatchClick }: {
  matches: Match[]; teams: TeamsById; myTeamId?: string | null; onMatchClick?: (m: Match) => void;
}) {
  const ko = matches.filter(m => m.stage === "knockout");
  if (!ko.length) return null;
  const rounds = [...new Set(ko.map(m => m.round_index))].sort((a, b) => a - b);
  const final = ko.find(m => m.round_index === rounds[rounds.length - 1]);
  const champion = final?.status === "completed" && final.winner_team_id ? teams.get(final.winner_team_id) : null;
  const firstCount = ko.filter(m => m.round_index === rounds[0]).length;
  const colHeight = Math.max(1, firstCount) * 104;

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 no-scrollbar">
      <div className="flex gap-3" style={{ minWidth: (rounds.length + (champion ? 1 : 0)) * 188 }}>
        {rounds.map(r => {
          const col = ko.filter(m => m.round_index === r).sort((a, b) => (a.bracket_slot ?? 0) - (b.bracket_slot ?? 0));
          return (
            <div key={r} className="w-[176px] shrink-0">
              <div className="mb-2 text-center text-[10px] font-bold uppercase tracking-wider text-white/40">
                {String(col[0]?.round_name || `Round ${r}`).replace(" (bye)", "")}
              </div>
              <div className="flex flex-col justify-around" style={{ height: colHeight }}>
                {col.map(m => (
                  <BracketCell key={m.id} match={m} teams={teams} myTeamId={myTeamId} onClick={onMatchClick ? () => onMatchClick(m) : undefined} />
                ))}
              </div>
            </div>
          );
        })}
        {champion && (
          <div className="flex w-[160px] shrink-0 flex-col">
            <div className="mb-2 text-center text-[10px] font-bold uppercase tracking-wider text-amber-300/80">Champion</div>
            <div className="flex flex-1 items-center">
              <div className="w-full rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-center">
                <div className="text-3xl">🏆</div>
                <div className="mx-auto mt-2 w-fit"><TeamLogo team={champion} size={40} /></div>
                <div className="mt-2 truncate font-display text-sm font-bold text-amber-200">{champion.name}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BracketCell({ match, teams, myTeamId, onClick }: { match: Match; teams: TeamsById; myTeamId?: string | null; onClick?: () => void }) {
  const row = (id: string | null, score: number) => {
    const t = id ? teams.get(id) : undefined;
    const won = match.status === "completed" && match.winner_team_id === id && !!id;
    const lost = match.status === "completed" && !!id && match.winner_team_id !== id;
    return (
      <div className={`flex items-center gap-2 px-2.5 py-1.5 ${lost ? "opacity-40" : ""}`}>
        <span className={`min-w-0 flex-1 truncate text-[12px] font-semibold ${id === myTeamId ? "text-red-300" : "text-white"}`}>
          {t?.short_name || t?.name || (id ? "?" : "TBD")}
        </span>
        <span className={`text-[13px] font-bold tabular-nums ${won ? "text-white" : "text-white/40"}`}>
          {match.status === "completed" || match.status === "live" ? score : ""}
        </span>
      </div>
    );
  };
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`block w-full overflow-hidden rounded-xl border text-left ${match.status === "live" ? "border-red-500/60 bg-red-500/10" : "border-white/10 bg-white/[0.04]"}`}
    >
      {row(match.team_a_id, match.team_a_score)}
      <div className="h-px bg-white/5" />
      {row(match.team_b_id, match.team_b_score)}
    </Tag>
  );
}

export function AnnouncementCard({ title, message, priority, created_at }: { title: string; message: string; priority: string; created_at: string }) {
  const tone =
    priority === "urgent" ? "border-red-500/60 bg-red-500/15" :
    priority === "important" ? "border-amber-400/40 bg-amber-400/10" :
    "border-white/10 bg-white/[0.03]";
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="font-semibold text-white">
          {priority === "urgent" ? "🚨 " : priority === "important" ? "📌 " : ""}{title}
        </div>
        <span className="shrink-0 text-[11px] text-white/40">{formatWhen(created_at, { timeOnly: true })}</span>
      </div>
      {message && <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-white/70">{message}</p>}
    </div>
  );
}
