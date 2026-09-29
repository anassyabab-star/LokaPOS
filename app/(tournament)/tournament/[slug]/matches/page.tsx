"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTournament } from "@/components/tournament/tournament-provider";
import { MatchCard, formatWhen } from "@/components/tournament/ui";
import type { Match } from "@/lib/tournament/types";
import { PageHeader, TeamPicker } from "../shell";

type Filter = "all" | "upcoming" | "live" | "completed" | "mine";
type GroupBy = "round" | "date" | "group";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "live", label: "Live" },
  { key: "completed", label: "Completed" },
  { key: "mine", label: "My Team" },
];

function MatchesInner() {
  const { data, teams, myTeamId } = useTournament();
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>(params.get("f") === "mine" ? "mine" : "all");
  const [groupBy, setGroupBy] = useState<GroupBy>("round");
  const [picking, setPicking] = useState(false);

  const sections = useMemo(() => {
    if (!data) return [];
    const list = data.matches.filter(m => {
      if (String(m.round_name || "").includes("(bye)")) return false;
      if (filter === "upcoming") return ["scheduled", "check_in", "ready", "delayed"].includes(m.status);
      if (filter === "live") return m.status === "live";
      if (filter === "completed") return m.status === "completed";
      if (filter === "mine") return !!myTeamId && (m.team_a_id === myTeamId || m.team_b_id === myTeamId);
      return true;
    });
    const keyOf = (m: Match) =>
      groupBy === "date" ? (m.scheduled_at ? formatWhen(m.scheduled_at, { dateOnly: true }) : "Date TBA")
      : groupBy === "group" ? (m.stage === "knockout" ? "Knockout" : m.group_name ? `Group ${m.group_name}` : "Matches")
      : `${m.stage === "knockout" ? "2" : "1"}|${String(m.round_index).padStart(3, "0")}|${m.stage === "knockout" ? m.round_name || "" : `Round ${m.round_index}`}`;
    const map = new Map<string, Match[]>();
    for (const m of [...list].sort((a, b) => (a.scheduled_at || "").localeCompare(b.scheduled_at || "") || a.match_number - b.match_number)) {
      const k = keyOf(m);
      map.set(k, [...(map.get(k) || []), m]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (groupBy === "round" ? a.localeCompare(b) : 0))
      .map(([k, ms]) => ({ title: groupBy === "round" ? k.split("|")[2].replace(" (bye)", "") : k, matches: ms }));
  }, [data, filter, groupBy, myTeamId]);

  if (!data) return null;
  const myTeam = myTeamId ? teams.get(myTeamId) : null;

  return (
    <div>
      <PageHeader title={filter === "mine" && myTeam ? "My Schedule" : "Matches"} subtitle={filter === "mine" && myTeam ? myTeam.name : data.tournament.name} />
      <div className="sticky z-20 space-y-2 bg-[#0A0C11] px-4 pb-3 pt-3" style={{ top: "calc(env(safe-area-inset-top, 0px) + 64px)" }}>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold ${filter === f.key ? "bg-red-600 text-white" : "bg-white/5 text-white/60"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-white/40">
          Group by
          {(["round", "date", "group"] as GroupBy[]).map(g => (
            <button key={g} onClick={() => setGroupBy(g)} className={`rounded-md px-2 py-0.5 capitalize ${groupBy === g ? "bg-white/10 text-white" : ""}`}>{g}</button>
          ))}
        </div>
      </div>

      <div className="space-y-6 px-4 pt-1">
        {filter === "mine" && !myTeam ? (
          <div className="py-10 text-center">
            <div className="text-4xl">👥</div>
            <p className="mt-2 text-sm text-white/50">Select your team to see its schedule.</p>
            <button onClick={() => setPicking(true)} className="mt-4 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold">Select team</button>
          </div>
        ) : sections.length === 0 ? (
          <div className="py-10 text-center">
            <div className="text-4xl">🗓️</div>
            <p className="mt-2 text-sm text-white/50">{data.matches.length ? "No matches here." : "The schedule hasn't been published yet."}</p>
          </div>
        ) : (
          sections.map(s => (
            <section key={s.title}>
              <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">{s.title}</h2>
              <div className="space-y-3">
                {s.matches.map(m => <MatchCard key={m.id} match={m} teams={teams} myTeamId={myTeamId} />)}
              </div>
            </section>
          ))
        )}
      </div>
      <TeamPicker open={picking} onClose={() => setPicking(false)} />
    </div>
  );
}

export default function MatchesPage() {
  return <Suspense fallback={null}><MatchesInner /></Suspense>;
}
