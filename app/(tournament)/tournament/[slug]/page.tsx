"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTournament } from "@/components/tournament/tournament-provider";
import { AnnouncementCard, Countdown, MatchCard, TeamLogo, formatWhen, useNow } from "@/components/tournament/ui";
import { computeStandings } from "@/lib/tournament/standings";
import { STATUS_LABEL } from "@/lib/tournament/types";
import { TeamPicker } from "./shell";
import { PrizesCard, RegistrationLanding, StickyRegister } from "./landing";

const ACTIVE = ["live", "ready", "check_in", "delayed", "scheduled"];

export default function TournamentHome() {
  const { slug, data, teams, myTeamId, live } = useTournament();
  const [picking, setPicking] = useState(false);
  const now = useNow(30_000);
  const base = `/tournament/${slug}`;

  const view = useMemo(() => {
    if (!data) return null;
    const { tournament: t, matches } = data;
    const liveMatches = matches.filter(m => m.status === "live");
    const upcoming = matches
      .filter(m => ACTIVE.includes(m.status) && m.status !== "live" && m.team_a_id && m.team_b_id)
      .sort((a, b) => (a.scheduled_at || "9").localeCompare(b.scheduled_at || "9") || a.match_number - b.match_number);
    const mine = (m: (typeof matches)[number]) => m.team_a_id === myTeamId || m.team_b_id === myTeamId;
    const myTeam = myTeamId ? teams.get(myTeamId) : undefined;
    const myNext = myTeamId ? [...liveMatches, ...upcoming].find(mine) : undefined;
    let myPosition: number | null = null;
    if (myTeam) {
      const rows = computeStandings(data.teams, matches, t, t.format === "round_robin" ? undefined : myTeam.group_name);
      myPosition = rows.find(r => r.team.id === myTeam.id)?.position ?? null;
    }
    const done = matches.filter(m => m.status === "completed" && !String(m.round_name || "").includes("(bye)")).length;
    return { t, liveMatches, nextOverall: upcoming[0], myTeam, myNext, myPosition, done, total: matches.length };
  }, [data, teams, myTeamId]);

  if (!data || !view) return null;
  const { t } = view;
  const started = t.start_at && new Date(t.start_at).getTime() <= now;
  const alert = data.announcements.find(a => a.priority === "urgent") || data.announcements.find(a => a.priority === "important");

  return (
    <>
    <div className="animate-scrIn">
      {/* hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#7F1D1D] via-[#5a1212] to-[#0A0C11] px-5 pb-6 pt-8">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(white 1px, transparent 1px)", backgroundSize: "14px 14px" }} />
        <div className="relative flex items-start gap-4">
          {t.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.logo_url} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-1 ring-white/20" />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-3xl ring-1 ring-white/20">🎮</div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">{STATUS_LABEL[t.status]}</span>
              {live && <span className="flex items-center gap-1 text-[10px] font-semibold text-white/60"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Live updates</span>}
            </div>
            <h1 className="mt-1.5 font-display text-2xl font-bold leading-tight">{t.name}</h1>
            <p className="mt-1 text-[12px] text-white/60">
              {t.start_at ? formatWhen(t.start_at) : "Date TBA"}{t.venue ? ` · ${t.venue}` : ""}
            </p>
          </div>
        </div>
        <div className="relative mt-5">
          {!started && t.start_at ? (
            <Countdown to={t.start_at} label="Tournament starts in" />
          ) : t.status === "completed" ? (
            <div className="text-center text-sm font-semibold text-white/70">🏁 Tournament completed</div>
          ) : view.total > 0 ? (
            <div>
              <div className="mb-1.5 flex justify-between text-[11px] text-white/50">
                <span>Tournament started</span><span>{view.done}/{view.total} matches</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-red-400" style={{ width: `${Math.round((view.done / Math.max(1, view.total)) * 100)}%` }} />
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <div className="space-y-5 px-4 pt-5">
        {alert && (
          <Link href={`${base}/announcements`} className="block"><AnnouncementCard {...alert} /></Link>
        )}

        {t.status === "registration_open" && <RegistrationLanding data={data} base={base} />}

        {/* my team */}
        {(t.status !== "registration_open" || data.teams.length > 0) && (
        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">My team</h2>
            {data.teams.length > 0 && (
              <button onClick={() => setPicking(true)} className="text-[12px] font-semibold text-red-400">{view.myTeam ? "Change" : "Select"}</button>
            )}
          </div>
          {view.myTeam ? (
            <Link href={`${base}/teams#${view.myTeam.id}`} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <TeamLogo team={view.myTeam} size={52} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-lg font-bold">{view.myTeam.name}</div>
                <div className="text-[12px] text-white/50">{view.myTeam.group_name ? `Group ${view.myTeam.group_name}` : "Team"}{view.myTeam.team_number ? ` · #${view.myTeam.team_number}` : ""}</div>
              </div>
              {view.myPosition && (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">Position</div>
                  <div className="font-display text-3xl font-bold">{view.myPosition}</div>
                </div>
              )}
            </Link>
          ) : (
            <button onClick={() => setPicking(true)} disabled={!data.teams.length} className="w-full rounded-2xl border border-dashed border-white/15 p-5 text-center text-sm text-white/50">
              {data.teams.length ? "Tap to select your team" : "Teams appear here once approved"}
            </button>
          )}
        </section>
        )}

        {/* next match */}
        {(view.myNext || view.nextOverall) && (
          <section>
            <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">
              {view.myNext ? (view.myNext.status === "live" ? "Your match — live" : "Your next match") : "Next match"}
            </h2>
            {(() => {
              const m = view.myNext || view.nextOverall!;
              return (
                <div className="space-y-3">
                  <MatchCard match={m} teams={teams} myTeamId={myTeamId} />
                  {m.status !== "live" && m.scheduled_at && new Date(m.scheduled_at).getTime() > now && (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] py-3"><Countdown to={m.scheduled_at} label="Starts in" /></div>
                  )}
                </div>
              );
            })()}
          </section>
        )}

        {view.liveMatches.filter(m => m.id !== view.myNext?.id).length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-red-400">Live now</h2>
            <div className="space-y-3">
              {view.liveMatches.filter(m => m.id !== view.myNext?.id).map(m => <MatchCard key={m.id} match={m} teams={teams} myTeamId={myTeamId} compact />)}
            </div>
          </section>
        )}

        {/* shortcuts */}
        <section className="grid grid-cols-3 gap-2">
          {[
            { href: "/matches?f=mine", label: "My Schedule", icon: "📅" },
            { href: "/matches", label: "All Matches", icon: "⚔️" },
            { href: "/standings", label: "Standings", icon: "📊" },
            { href: "/bracket", label: "Bracket", icon: "🏆" },
            { href: "/teams", label: "Teams", icon: "👥" },
            { href: "/announcements", label: "News", icon: "📣" },
          ].map(s => (
            <Link key={s.href} href={`${base}${s.href}`} className="rounded-2xl border border-white/10 bg-white/[0.03] px-2 py-3.5 text-center active:scale-[.98]">
              <div className="text-xl">{s.icon}</div>
              <div className="mt-1 text-[11px] font-semibold text-white/70">{s.label}</div>
            </Link>
          ))}
        </section>

        {data.announcements.length > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Announcements</h2>
              <Link href={`${base}/announcements`} className="text-[12px] font-semibold text-red-400">All</Link>
            </div>
            <div className="space-y-2">
              {data.announcements.slice(0, 3).map(a => <AnnouncementCard key={a.id} {...a} />)}
            </div>
          </section>
        )}

        {t.status !== "registration_open" && <PrizesCard prizes={t.prizes || []} compact />}

        {t.description && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">About</h2>
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-white/70">{t.description}</p>
          </section>
        )}

        <Link href="/menu" className={`block py-2 text-center text-[12px] text-white/35 ${t.status === "registration_open" ? "mb-20" : ""}`}>☕ Order from Loka</Link>
      </div>

    </div>
    {/* Fixed-position overlays live outside the animated wrapper (see StickyRegister). */}
    <StickyRegister data={data} base={base} />
    <TeamPicker open={picking} onClose={() => setPicking(false)} />
    </>
  );
}
