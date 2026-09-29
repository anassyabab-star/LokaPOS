"use client";

import { useTournament } from "@/components/tournament/tournament-provider";
import { Bracket } from "@/components/tournament/ui";
import { PageHeader } from "../shell";

export default function BracketPage() {
  const { data, teams, myTeamId } = useTournament();
  if (!data) return null;
  const hasKnockout = data.matches.some(m => m.stage === "knockout");
  return (
    <div>
      <PageHeader title="Bracket" subtitle={data.tournament.name} />
      <div className="px-4 pt-5">
        {hasKnockout ? (
          <>
            <Bracket matches={data.matches} teams={teams} myTeamId={myTeamId} />
            <p className="mt-3 text-center text-[11px] text-white/35">Swipe sideways to follow the rounds →</p>
          </>
        ) : (
          <div className="py-12 text-center">
            <div className="text-4xl">🏆</div>
            <p className="mt-2 text-sm text-white/50">
              {data.tournament.format === "round_robin" ? "Round robin — the winner tops the Standings." : "The knockout bracket appears once it's drawn."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
