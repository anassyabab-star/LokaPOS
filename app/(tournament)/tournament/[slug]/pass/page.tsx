"use client";

import { useState } from "react";
import { useTournament } from "@/components/tournament/tournament-provider";
import { TeamLogo, formatWhen, tz, useNow } from "@/components/tournament/ui";
import { PageHeader, TeamPicker } from "../shell";

// ============================================================================
// Player Pass — shown at the counter on tournament day for the player perk
// (e.g. 20% off drinks, every purchase). The ticking clock makes a screenshot
// from another day obvious; the cashier matches an IGN here against the
// player's MLBB profile, then applies it from the POS.
// ============================================================================

const MYT = 8 * 60 * 60 * 1000;
const dayKey = (ms: number) => new Date(ms + MYT).toISOString().slice(0, 10);

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export default function PlayerPassPage() {
  const { slug, data, teams, myTeamId } = useTournament();
  const [picking, setPicking] = useState(false);
  const now = useNow(1000);
  if (!data) return null;
  const t = data.tournament;
  const perk = data.perk;
  const team = myTeamId ? teams.get(myTeamId) : undefined;
  const players = team ? data.players.filter(p => p.team_id === team.id) : [];

  const startDay = t.start_at ? dayKey(new Date(t.start_at).getTime()) : null;
  const endDay = t.end_at ? dayKey(new Date(t.end_at).getTime()) : startDay;
  const today = dayKey(now);
  const active = !!startDay && today >= startDay && today <= (endDay || startDay);
  const before = !!startDay && today < startDay;

  return (
    <div className="pb-10">
      <PageHeader title="Player Pass" subtitle={t.name} back={`/tournament/${slug}`} />
      <div className="space-y-4 px-4 pt-5">
        {!perk ? (
          <div className="py-12 text-center text-sm text-white/50">No player discount for this tournament.</div>
        ) : !team ? (
          <div className="py-12 text-center">
            <div className="text-5xl">🎟️</div>
            <p className="mt-3 text-sm text-white/55">Select your team to get your pass.</p>
            <button onClick={() => setPicking(true)} className="mt-5 rounded-2xl bg-red-600 px-6 py-3 font-bold">Select team</button>
          </div>
        ) : (
          <>
            <div
              className={`relative overflow-hidden rounded-3xl p-6 ${active ? "bg-gradient-to-br from-violet-600 via-fuchsia-700 to-red-700" : "bg-white/[0.06]"}`}
            >
              {active && <div className="pointer-events-none absolute -inset-10 animate-pulse bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_60%)]" />}
              <div className="relative">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/80">Player Pass</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${active ? "bg-white text-fuchsia-700" : "bg-white/10 text-white/60"}`}>
                    {active ? "Valid today" : before ? "Not yet" : "Expired"}
                  </span>
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <TeamLogo team={team} size={56} />
                  <div className="min-w-0">
                    <div className="truncate font-display text-2xl font-bold">{team.name}</div>
                    <div className="text-[12px] text-white/70">{team.team_number ? `Team #${team.team_number}` : "Team"}{team.group_name ? ` · Group ${team.group_name}` : ""}</div>
                  </div>
                </div>
                <div className="mt-6 font-display text-5xl font-extrabold leading-none">{perk.percent}% OFF</div>
                <div className="mt-2 text-[14px] font-semibold text-white/90">{joinNames(perk.category_names)} · every purchase</div>
                <div className="mt-5 rounded-2xl bg-black/25 px-4 py-3 text-center">
                  <div className="font-display text-3xl font-bold tabular-nums">
                    {new Date(now).toLocaleTimeString("en-MY", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </div>
                  <div className="text-[12px] text-white/70">
                    {new Date(now).toLocaleDateString("en-MY", { timeZone: tz, weekday: "long", day: "numeric", month: "long" })}
                  </div>
                </div>
              </div>
            </div>

            {!active && (
              <p className="text-center text-[13px] text-white/55">
                {before && t.start_at ? `Your pass works on ${formatWhen(t.start_at, { dateOnly: true })}.` : "This pass was for the tournament day."}
              </p>
            )}

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Players</div>
              <div className="flex flex-wrap gap-2">
                {players.map(p => (
                  <span key={p.id} className="rounded-full bg-white/10 px-3 py-1 text-[13px] font-semibold">{p.ign}{p.is_captain ? " 👑" : ""}</span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[13px] leading-relaxed text-white/60">
              <div className="font-semibold text-white">At the counter</div>
              Show this screen and tell the cashier your IGN. They may ask to see your MLBB profile — the IGN should match.
            </div>

            <button onClick={() => setPicking(true)} className="w-full py-2 text-center text-[12px] text-white/40">Not your team? Change</button>
          </>
        )}
      </div>
      <TeamPicker open={picking} onClose={() => setPicking(false)} />
    </div>
  );
}
