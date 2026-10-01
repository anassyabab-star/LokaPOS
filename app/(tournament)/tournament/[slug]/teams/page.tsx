"use client";

import { useEffect, useMemo, useState } from "react";
import { useTournament } from "@/components/tournament/tournament-provider";
import { TeamLogo } from "@/components/tournament/ui";
import { ROLE_LABEL } from "@/lib/tournament/types";
import { PageHeader } from "../shell";

// Sixteen teams of five or six players is ~90 rows, so teams start folded —
// name, captain and head-count — and open on tap. Your own team opens by
// default, and a search finds a team or a player's IGN.
export default function TeamsPage() {
  const { data, myTeamId, setMyTeamId } = useTournament();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (myTeamId) setOpen(o => new Set(o).add(myTeamId));
  }, [myTeamId]);

  const list = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.teams
      .map(t => {
        const players = data.players.filter(p => p.team_id === t.id);
        const hit = needle
          ? players.filter(p => p.ign.toLowerCase().includes(needle)).map(p => p.id)
          : [];
        const teamHit = !needle || t.name.toLowerCase().includes(needle) || (t.short_name || "").toLowerCase().includes(needle);
        return { t, players, hit, show: teamHit || hit.length > 0 };
      })
      .filter(x => x.show)
      // Your team first, then team number / name.
      .sort((a, b) => Number(b.t.id === myTeamId) - Number(a.t.id === myTeamId));
  }, [data, q, myTeamId]);

  if (!data) return null;

  const toggle = (id: string) =>
    setOpen(o => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  return (
    <div>
      <PageHeader title="Teams" subtitle={`${data.teams.length} teams · ${data.players.length} players`} />
      <div className="space-y-2.5 px-4 pt-4">
        {data.teams.length > 0 && (
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search team or IGN"
            className="mb-1 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none placeholder:text-white/30 focus:border-red-500"
          />
        )}

        {data.teams.length === 0 && (
          <div className="py-12 text-center">
            <div className="text-4xl">👥</div>
            <p className="mt-2 text-sm text-white/50">Teams show here once their registration is approved.</p>
          </div>
        )}
        {data.teams.length > 0 && list.length === 0 && (
          <p className="py-8 text-center text-sm text-white/40">No team or player matches “{q}”.</p>
        )}

        {list.map(({ t, players, hit }) => {
          const mine = t.id === myTeamId;
          const expanded = open.has(t.id) || hit.length > 0;
          const captain = players.find(p => p.is_captain);
          return (
            <div id={t.id} key={t.id} className={`scroll-mt-24 overflow-hidden rounded-2xl border ${mine ? "border-red-500/50 bg-red-500/[0.06]" : "border-white/10 bg-white/[0.03]"}`}>
              <button onClick={() => toggle(t.id)} className="flex w-full items-center gap-3 p-3.5 text-left">
                <TeamLogo team={t} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-[15px] font-bold">{t.name}</div>
                  <div className="truncate text-[12px] text-white/45">
                    {t.team_number ? `#${t.team_number} · ` : ""}{t.group_name ? `Group ${t.group_name} · ` : ""}
                    {players.length} players{captain ? ` · 👑 ${captain.ign}` : ""}
                  </div>
                </div>
                {mine && <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold">MY TEAM</span>}
                <svg className={`shrink-0 text-white/40 transition ${expanded ? "rotate-180" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {expanded && (
                <div className="border-t border-white/5 px-3.5 pb-3 pt-2">
                  {players.map(p => (
                    <div key={p.id} className="flex items-center justify-between py-1 text-[13px]">
                      <span className={`truncate ${hit.includes(p.id) ? "font-semibold text-red-300" : "text-white/85"}`}>{p.ign}{p.is_captain ? " 👑" : ""}</span>
                      <span className="shrink-0 pl-2 text-[11px] text-white/40">{ROLE_LABEL[p.player_role]}</span>
                    </div>
                  ))}
                  <button
                    onClick={() => setMyTeamId(mine ? null : t.id)}
                    className={`mt-2 w-full rounded-xl py-2 text-[12px] font-semibold ${mine ? "bg-white/5 text-white/60" : "bg-red-600/90 text-white"}`}
                  >
                    {mine ? "Not my team" : "This is my team"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
