"use client";

import { useMemo } from "react";
import { Bracket, StandingsTable } from "@/components/tournament/ui";
import { computeStandings, groupNames } from "@/lib/tournament/standings";
import type { Team } from "@/lib/tournament/types";
import type { TabProps } from "./page";

// Same components the participants see, in a dark card — what you see here is
// exactly what's on their phones.
export function StandingsTab({ bundle }: TabProps) {
  const t = bundle.tournament;
  const approved = useMemo(() => bundle.teams.filter(x => x.registration_status === "approved") as Team[], [bundle.teams]);
  const teamMap = useMemo(() => new Map(approved.map(x => [x.id, x])), [approved]);
  const tables = useMemo(() => {
    if (t.format === "single_elim") return [];
    if (t.format === "round_robin") return [{ title: null as string | null, rows: computeStandings(approved, bundle.matches, t) }];
    return groupNames(approved).map(g => ({ title: g ? `Group ${g}` : null, rows: computeStandings(approved, bundle.matches, t, g) }));
  }, [approved, bundle.matches, t]);
  const hasKnockout = bundle.matches.some(m => m.stage === "knockout");

  return (
    <div className="tournament-dark space-y-5 rounded-2xl bg-[#0A0C11] p-4 text-white" style={{ colorScheme: "dark" }}>
      {tables.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {tables.map(tb => (
            <StandingsTable key={tb.title || "all"} title={tb.title || "Standings"} rows={tb.rows} advance={t.format === "group_knockout" ? t.advance_per_group : 0} />
          ))}
        </div>
      )}
      {hasKnockout && (
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/40">Bracket</div>
          <Bracket matches={bundle.matches} teams={teamMap} />
        </div>
      )}
      {!tables.length && !hasKnockout && <p className="py-8 text-center text-sm text-white/50">Jana jadual dulu.</p>}
      <p className="text-[11px] text-white/35">Kedudukan dikira automatik (mata → menang → head-to-head → beza game). Override: Teams → Kedudukan manual.</p>
    </div>
  );
}
