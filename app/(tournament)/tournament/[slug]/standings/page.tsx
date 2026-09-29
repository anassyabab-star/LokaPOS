"use client";

import { useMemo } from "react";
import { useTournament } from "@/components/tournament/tournament-provider";
import { StandingsTable } from "@/components/tournament/ui";
import { computeStandings, groupNames } from "@/lib/tournament/standings";
import { PageHeader } from "../shell";

export default function StandingsPage() {
  const { data, myTeamId } = useTournament();
  const tables = useMemo(() => {
    if (!data) return [];
    const t = data.tournament;
    if (t.format === "round_robin") return [{ title: null as string | null, rows: computeStandings(data.teams, data.matches, t) }];
    return groupNames(data.teams).map(g => ({ title: g ? `Group ${g}` : null, rows: computeStandings(data.teams, data.matches, t, g) }));
  }, [data]);
  if (!data) return null;
  const t = data.tournament;

  return (
    <div>
      <PageHeader title="Standings" subtitle={`Win ${t.points_win} pts · Loss ${t.points_loss} pts`} />
      <div className="space-y-4 px-4 pt-4">
        {t.format === "single_elim" ? (
          <div className="py-10 text-center text-sm text-white/50">This is a knockout tournament — see the Bracket.</div>
        ) : (
          tables.map(tb => (
            <StandingsTable
              key={tb.title || "all"}
              title={tb.title || undefined}
              rows={tb.rows}
              myTeamId={myTeamId}
              advance={t.format === "group_knockout" ? t.advance_per_group : 0}
            />
          ))
        )}
        <p className="px-1 text-[11px] leading-relaxed text-white/35">
          Ranked by points, then match wins, head-to-head, and game difference.
          {t.format === "group_knockout" ? ` Top ${t.advance_per_group} of each group advance.` : ""}
        </p>
      </div>
    </div>
  );
}
