"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { STATUS_LABEL, type TournamentStatus } from "@/lib/tournament/types";
import { api, cardCls, Toggle } from "../ui";
import { QuickScore, when } from "./matches";
import type { TabProps } from "./page";

const NEXT_STATUS: Partial<Record<TournamentStatus, { to: TournamentStatus; label: string }>> = {
  draft: { to: "registration_open", label: "Buka pendaftaran" },
  registration_open: { to: "registration_closed", label: "Tutup pendaftaran" },
  registration_closed: { to: "ongoing", label: "▶ Mula tournament" },
  ongoing: { to: "completed", label: "🏁 Tamat tournament" },
};

export function OverviewTab({ bundle, reload }: TabProps) {
  const t = bundle.tournament;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const teams = useMemo(() => new Map(bundle.teams.map(x => [x.id, x])), [bundle.teams]);

  const s = useMemo(() => {
    const approved = bundle.teams.filter(x => x.registration_status === "approved");
    const real = bundle.matches.filter(m => !String(m.round_name || "").includes("(bye)"));
    const done = real.filter(m => m.status === "completed");
    const open = real.filter(m => !["completed", "cancelled"].includes(m.status));
    const byTime = (a: typeof open[number], b: typeof open[number]) =>
      (a.scheduled_at || "9").localeCompare(b.scheduled_at || "9") || a.match_number - b.match_number;
    const live = open.filter(m => m.status === "live");
    const upcoming = open.filter(m => m.status !== "live").sort(byTime);
    const current = live[0] || upcoming[0];
    return {
      teams: approved.length,
      players: approved.reduce((n, x) => n + x.players.filter(p => p.status === "active").length, 0),
      done: done.length,
      remaining: open.length,
      round: current ? current.round_name || `Round ${current.round_index}` : "—",
      next: upcoming[0],
      quick: [...live, ...upcoming].filter(m => m.team_a_id && m.team_b_id).slice(0, 4),
      recent: [...done].sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")).slice(0, 5),
      pending: bundle.teams.filter(x => x.registration_status === "payment_submitted").length,
    };
  }, [bundle]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true); setErr(null);
    const r = await api(`/api/admin/tournaments/${t.id}`, "PATCH", body);
    setBusy(false);
    if (!r.ok) { setErr(r.data.error || "Gagal"); return; }
    await reload();
  }

  const step = NEXT_STATUS[t.status];
  const nextTeams = s.next ? `${(s.next.team_a_id && teams.get(s.next.team_a_id)?.name) || "TBD"} vs ${(s.next.team_b_id && teams.get(s.next.team_b_id)?.name) || "TBD"}` : "—";
  const cards = [
    { label: "Total Teams", value: `${s.teams}/${t.max_teams}` },
    { label: "Total Players", value: s.players },
    { label: "Matches Completed", value: s.done },
    { label: "Matches Remaining", value: s.remaining },
    { label: "Current Round", value: s.round },
    { label: "Status", value: STATUS_LABEL[t.status] },
  ];

  return (
    <div className="space-y-5">
      <div className={`${cardCls} flex flex-wrap items-center justify-between gap-4`}>
        <div className="flex flex-wrap items-center gap-5">
          <Toggle on={t.published} disabled={busy} onChange={v => void patch({ published: v })} label={t.published ? "Published — peserta boleh lihat" : "Tersembunyi"} />
        </div>
        <div className="flex flex-wrap gap-2">
          {step && (
            <button disabled={busy} onClick={() => void patch({ status: step.to, ...(step.to !== "draft" && !t.published ? { published: true } : {}) })} className="rounded-xl bg-[#7F1D1D] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {step.label}
            </button>
          )}
        </div>
        {err && <p className="w-full text-sm text-red-500">{err}</p>}
      </div>

      {s.pending > 0 && (
        <Link href={`/dashboard/tournaments/${t.id}?tab=registrations`} className="block rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          🧾 {s.pending} bukti bayaran menunggu semakan →
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {cards.map(c => (
          <div key={c.label} className={cardCls}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{c.label}</div>
            <div className="mt-1.5 truncate font-display text-xl font-bold text-gray-900">{c.value}</div>
          </div>
        ))}
      </div>

      <div className={cardCls}>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Next match</div>
        <div className="mt-1 font-bold text-gray-900">{s.next ? `#${s.next.match_number} · ${nextTeams}` : "Tiada"}</div>
        {s.next && <div className="text-xs text-gray-400">{when(s.next.scheduled_at)}{s.next.station ? ` · ${s.next.station}` : ""}</div>}
      </div>

      <section>
        <h2 className="mb-2 text-sm font-bold text-gray-900">Quick result entry</h2>
        {s.quick.length === 0 ? (
          <p className={`${cardCls} text-center text-sm text-gray-400`}>Tiada match untuk dimasukkan keputusan.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {s.quick.map(m => <QuickScore key={m.id} match={m} teams={teams} tournamentId={t.id} onSaved={reload} />)}
          </div>
        )}
      </section>

      {s.recent.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-gray-900">Baru selesai</h2>
          <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {s.recent.map(m => {
              const a = m.team_a_id ? teams.get(m.team_a_id)?.name : "TBD";
              const b = m.team_b_id ? teams.get(m.team_b_id)?.name : "TBD";
              return (
                <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-gray-50">
                  <span className="truncate text-gray-600">#{m.match_number} <span className={m.winner_team_id === m.team_a_id ? "font-bold text-gray-900" : ""}>{a}</span> vs <span className={m.winner_team_id === m.team_b_id ? "font-bold text-gray-900" : ""}>{b}</span></span>
                  <span className="shrink-0 font-display font-bold tabular-nums text-gray-900">{m.team_a_score} – {m.team_b_score}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
