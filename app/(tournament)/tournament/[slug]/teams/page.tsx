"use client";

import { useTournament } from "@/components/tournament/tournament-provider";
import { TeamLogo } from "@/components/tournament/ui";
import { ROLE_LABEL } from "@/lib/tournament/types";
import { PageHeader } from "../shell";

export default function TeamsPage() {
  const { data, myTeamId, setMyTeamId } = useTournament();
  if (!data) return null;
  return (
    <div>
      <PageHeader title="Teams" subtitle={`${data.teams.length} teams`} />
      <div className="space-y-3 px-4 pt-4">
        {data.teams.length === 0 && (
          <div className="py-12 text-center">
            <div className="text-4xl">👥</div>
            <p className="mt-2 text-sm text-white/50">Teams show here once their registration is approved.</p>
          </div>
        )}
        {data.teams.map(t => {
          const players = data.players.filter(p => p.team_id === t.id);
          const mine = t.id === myTeamId;
          return (
            <div id={t.id} key={t.id} className={`scroll-mt-24 rounded-2xl border p-4 ${mine ? "border-red-500/50 bg-red-500/[0.06]" : "border-white/10 bg-white/[0.03]"}`}>
              <div className="flex items-center gap-3">
                <TeamLogo team={t} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-[16px] font-bold">{t.name}</div>
                  <div className="text-[12px] text-white/45">
                    {t.team_number ? `#${t.team_number}` : ""}{t.group_name ? ` · Group ${t.group_name}` : ""}{t.seed ? ` · Seed ${t.seed}` : ""}
                  </div>
                </div>
                <button
                  onClick={() => setMyTeamId(mine ? null : t.id)}
                  className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${mine ? "bg-red-600 text-white" : "bg-white/5 text-white/60"}`}
                >
                  {mine ? "My team ✓" : "This is me"}
                </button>
              </div>
              {players.length > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-1.5 border-t border-white/5 pt-3">
                  {players.map(p => (
                    <div key={p.id} className="flex items-center justify-between text-[13px]">
                      <span className="truncate text-white/85">{p.ign}{p.is_captain ? " 👑" : ""}</span>
                      <span className="shrink-0 text-[11px] text-white/40">{ROLE_LABEL[p.player_role]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
