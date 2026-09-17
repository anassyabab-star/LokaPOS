"use client";

// Customer-facing view of the challenge engine (mission_definitions +
// mission_progress). The engine has always run server-side; until now nothing
// in the app told a customer a challenge existed, so nobody could act on one.
//
// Three shapes, one data source:
//   <MissionStrip/>  one line on /menu — the nudge at the point of ordering
//   <MissionList/>   full cards on /rewards — for someone deliberately collecting
//   <MissionDone/>   on the order tracker, when a purchase just completed one

import { useEffect, useState } from "react";

export type Mission = {
  code: string;
  name: string;
  rule: string;
  reward: string;
  threshold: number;
  progress: number;
  remaining: number;
  days_left: number | null;
  started: boolean;
  completed_at: string | null;
};

/** Shared fetch. Returns [] on any failure — a challenge widget must never
 *  break the page it sits on. */
export function useMissions(phone: string | null | undefined) {
  const [missions, setMissions] = useState<Mission[] | null>(null);

  useEffect(() => {
    let live = true;
    const qs = phone ? `?phone=${encodeURIComponent(phone)}` : "";
    fetch(`/api/public/missions${qs}`, { cache: "no-store" })
      .then(r => r.json())
      .then(d => { if (live) setMissions(Array.isArray(d?.missions) ? d.missions : []); })
      .catch(() => { if (live) setMissions([]); });
    return () => { live = false; };
  }, [phone]);

  return missions;
}

function Progress({ m }: { m: Mission }) {
  const pct = m.threshold > 0 ? Math.min(100, (m.progress / m.threshold) * 100) : 0;
  return (
    <div className="mt-2 h-[6px] w-full overflow-hidden rounded-full bg-hairline">
      <div className="h-full rounded-full bg-leaf transition-all" style={{ width: `${Math.max(pct, m.progress > 0 ? 8 : 0)}%` }} />
    </div>
  );
}

/** What to say about where they are, in plain words. */
function statusLine(m: Mission): string {
  if (!m.started) return `Start today · ${m.rule.toLowerCase()}`;
  if (m.remaining <= 0) return "Reward unlocked — check your vouchers";
  const buys = `${m.remaining} more ${m.remaining === 1 ? "visit" : "visits"}`;
  if (m.days_left === null) return `${buys} to go`;
  if (m.days_left <= 0) return "Last day to finish this one";
  return `${buys} · ${m.days_left} ${m.days_left === 1 ? "day" : "days"} left`;
}

/** One line for the menu header — the most-seen screen in the app. */
export function MissionStrip({ phone }: { phone: string | null | undefined }) {
  const missions = useMissions(phone);
  if (!missions || missions.length === 0) return null;

  // Show the one closest to paying off, so the nudge is the most achievable.
  const live = missions.filter(m => m.remaining > 0);
  const m = (live.length > 0 ? live : missions).sort((a, b) => a.remaining - b.remaining)[0];
  if (!m) return null;

  return (
    <div className="mt-3 rounded-[14px] border border-leaf/30 bg-leaf/10 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-sans text-[13px] font-semibold text-cream">🎯 {m.name}</span>
        <span className="font-display text-[13px] font-semibold text-cream">{m.progress}/{m.threshold}</span>
      </div>
      <div className="mt-1 font-sans text-[12px] text-[#C9A88F]">{statusLine(m)} · {m.reward}</div>
      <Progress m={m} />
    </div>
  );
}

/** Full cards for the rewards screen. */
export function MissionList({ phone }: { phone: string | null | undefined }) {
  const missions = useMissions(phone);
  if (!missions || missions.length === 0) return null;

  return (
    <div>
      <div className="mb-2 px-1 font-sans text-[12px] font-semibold uppercase tracking-label text-muted">Challenges</div>
      <div className="space-y-2.5">
        {missions.map(m => (
          <div key={m.code} className="rounded-[16px] border border-hairline bg-card p-4 shadow-card">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-sans text-[14px] font-semibold text-espresso">{m.name}</span>
              <span className="font-display text-[14px] font-semibold text-leaf">{m.progress}/{m.threshold}</span>
            </div>
            <div className="mt-0.5 font-sans text-[12px] text-muted">{m.rule}</div>
            <Progress m={m} />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="font-sans text-[12px] text-muted">{statusLine(m)}</span>
              <span className="font-sans text-[12px] font-semibold text-maroon">🎁 {m.reward}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Shown on the order tracker. `sinceIso` is when this order was placed — a
 * mission completed at or after it was completed *by* this order, which is the
 * moment worth celebrating.
 */
export function MissionDone({ phone, sinceIso }: { phone: string | null | undefined; sinceIso: string | null }) {
  const missions = useMissions(phone);
  if (!missions || !sinceIso) return null;

  const since = new Date(sinceIso).getTime();
  const justDone = missions.filter(m => {
    if (!m.completed_at) return false;
    const t = new Date(m.completed_at).getTime();
    // A small grace window: settlement runs moments after the order is placed.
    return t >= since - 60_000;
  });
  if (justDone.length === 0) return null;

  return (
    <div className="mt-4 rounded-[18px] border border-leaf/40 bg-leaf/10 p-4">
      {justDone.map(m => (
        <div key={m.code} className="flex items-start gap-3">
          <span className="text-[22px]">🎉</span>
          <div className="min-w-0">
            <div className="font-sans text-[14px] font-semibold text-espresso">Challenge complete — {m.name}</div>
            <div className="mt-0.5 font-sans text-[12px] text-muted">
              You earned {m.reward}. It is in your rewards, ready to use.
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
