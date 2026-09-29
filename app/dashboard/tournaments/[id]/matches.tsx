"use client";

import { useEffect, useMemo, useState } from "react";
import { MATCH_STATUSES, MATCH_STATUS_LABEL, winsNeeded, type AdminTeam, type Match, type MatchStatus } from "@/lib/tournament/types";
import { Badge, ConfirmSheet, Sheet, api, btnGhost, btnPrimary, cardCls, fromLocalInput, inputCls, labelCls, toLocalInput } from "../ui";
import type { TabProps } from "./page";

const STATUS_TONE: Record<MatchStatus, "gray" | "green" | "amber" | "red" | "blue" | "maroon"> = {
  scheduled: "blue", check_in: "maroon", ready: "green", live: "red", completed: "gray", delayed: "amber", cancelled: "gray",
};

export function when(iso: string | null) {
  if (!iso) return "Masa TBA";
  return new Date(iso).toLocaleString("ms-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/**
 * The phone-first result entry: [-] 1 : 0 [+], then one tap to save.
 * Everything a live event needs is on the card — no sheet to open.
 */
export function QuickScore({ match, teams, tournamentId, onSaved, onEdit }: {
  match: Match; teams: Map<string, AdminTeam>; tournamentId: string; onSaved: () => Promise<void>; onEdit?: () => void;
}) {
  const [a, setA] = useState(match.team_a_score);
  const [b, setB] = useState(match.team_b_score);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setA(match.team_a_score); setB(match.team_b_score); }, [match.team_a_score, match.team_b_score]);

  const ta = match.team_a_id ? teams.get(match.team_a_id) : null;
  const tb = match.team_b_id ? teams.get(match.team_b_id) : null;
  const cap = winsNeeded(match.best_of);
  const dirty = a !== match.team_a_score || b !== match.team_b_score;
  const done = match.status === "completed";
  const ready = !!ta && !!tb;

  async function save(patch: Record<string, unknown>, label: string) {
    setBusy(label); setErr(null);
    const r = await api(`/api/admin/tournaments/${tournamentId}/matches/${match.id}`, "PATCH", { team_a_score: a, team_b_score: b, ...patch });
    setBusy(null);
    if (!r.ok) { setErr(r.data.error || "Gagal simpan"); return; }
    await onSaved();
  }

  const stepper = (val: number, set: (n: number) => void) => (
    <div className="flex items-center gap-1.5">
      <button disabled={done || val <= 0} onClick={() => set(val - 1)} className="h-10 w-10 rounded-xl border border-gray-200 text-lg font-bold text-gray-600 disabled:opacity-30">−</button>
      <span className="w-8 text-center font-display text-3xl font-bold tabular-nums text-gray-900">{val}</span>
      <button disabled={done || val >= cap} onClick={() => set(val + 1)} className="h-10 w-10 rounded-xl border border-gray-200 text-lg font-bold text-gray-600 disabled:opacity-30">+</button>
    </div>
  );

  return (
    <div className={`${cardCls} ${match.status === "live" ? "ring-2 ring-red-500/40" : ""}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="truncate text-xs font-semibold text-gray-400">
          #{match.match_number} · {match.round_name || `Round ${match.round_index}`}{match.group_name ? ` · Grp ${match.group_name}` : ""} · BO{match.best_of}
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[match.status]}>{MATCH_STATUS_LABEL[match.status]}</Badge>
          {onEdit && <button onClick={onEdit} className="text-xs font-semibold text-sky-600">Edit</button>}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2">
        <div className={`truncate font-semibold ${match.winner_team_id && match.winner_team_id === match.team_a_id ? "text-[#7F1D1D]" : "text-gray-900"}`}>{ta?.name || "TBD"}</div>
        {stepper(a, setA)}
        <div className={`truncate font-semibold ${match.winner_team_id && match.winner_team_id === match.team_b_id ? "text-[#7F1D1D]" : "text-gray-900"}`}>{tb?.name || "TBD"}</div>
        {stepper(b, setB)}
      </div>

      <div className="mt-2 text-xs text-gray-400">{when(match.scheduled_at)}{match.station ? ` · ${match.station}` : ""}</div>
      {err && <p className="mt-2 text-xs font-semibold text-red-500">{err}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {done ? (
          <button disabled={!!busy} onClick={() => void save({ status: "live" }, "reopen")} className={`${btnGhost} flex-1`}>
            {busy === "reopen" ? "…" : "Buka semula"}
          </button>
        ) : (
          <>
            {match.status !== "live" && (
              <button disabled={!!busy || !ready} onClick={() => void save({ status: "live" }, "live")} className="flex-1 rounded-xl bg-red-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">
                {busy === "live" ? "…" : "▶ Start"}
              </button>
            )}
            {dirty && (
              <button disabled={!!busy} onClick={() => void save({}, "save")} className={`${btnGhost} flex-1`}>
                {busy === "save" ? "…" : "Save score"}
              </button>
            )}
            <button
              disabled={!!busy || !ready || a === b}
              onClick={() => void save({ status: "completed" }, "done")}
              className={`${btnPrimary} flex-1`}
              title={a === b ? "Skor sama — tiada pemenang" : ""}
            >
              {busy === "done" ? "…" : "✓ Save result"}
            </button>
            {match.status !== "delayed" && match.status !== "live" && (
              <button disabled={!!busy} onClick={() => void save({ status: "delayed" }, "delay")} className="rounded-xl border border-amber-200 px-3 py-2 text-sm font-semibold text-amber-700">
                {busy === "delay" ? "…" : "Delay"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MatchEditor({ match, teams, tournamentId, onClose, onSaved }: {
  match: Match | "new"; teams: AdminTeam[]; tournamentId: string; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const isNew = match === "new";
  const m = isNew ? null : match;
  const [f, setF] = useState({
    team_a_id: m?.team_a_id || "",
    team_b_id: m?.team_b_id || "",
    scheduled_at: toLocalInput(m?.scheduled_at),
    station: m?.station || "",
    lobby_info: m?.lobby_info || "",
    best_of: m?.best_of || 1,
    status: (m?.status || "scheduled") as MatchStatus,
    round_name: m?.round_name || "",
    group_name: m?.group_name || "",
    admin_notes: m?.admin_notes || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  async function save() {
    setBusy(true); setErr(null);
    const body = { ...f, scheduled_at: fromLocalInput(f.scheduled_at), team_a_id: f.team_a_id || null, team_b_id: f.team_b_id || null };
    const r = isNew
      ? await api(`/api/admin/tournaments/${tournamentId}/matches`, "POST", body)
      : await api(`/api/admin/tournaments/${tournamentId}/matches/${m!.id}`, "PATCH", body);
    setBusy(false);
    if (!r.ok) { setErr(r.data.error || "Gagal simpan"); return; }
    await onSaved(); onClose();
  }

  async function remove() {
    setBusy(true);
    const r = await api(`/api/admin/tournaments/${tournamentId}/matches/${m!.id}`, "DELETE");
    setBusy(false);
    if (!r.ok) { setErr(r.data.error || "Gagal padam"); setConfirmDel(false); return; }
    await onSaved(); onClose();
  }

  const teamOpts = teams.filter(t => t.registration_status === "approved");
  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={isNew ? "Match baru" : `Match #${m!.match_number}`}
        footer={
          <div className="flex gap-2">
            {!isNew && <button onClick={() => setConfirmDel(true)} className="rounded-xl px-3 py-2 text-sm font-semibold text-red-500">Padam</button>}
            <button onClick={onClose} className={`${btnGhost} flex-1`}>Batal</button>
            <button onClick={() => void save()} disabled={busy} className={`${btnPrimary} flex-1`}>{busy ? "…" : "Simpan"}</button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>Team A
            <select className={`${inputCls} mt-1`} value={f.team_a_id} onChange={e => setF({ ...f, team_a_id: e.target.value })}>
              <option value="">TBD</option>
              {teamOpts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className={labelCls}>Team B
            <select className={`${inputCls} mt-1`} value={f.team_b_id} onChange={e => setF({ ...f, team_b_id: e.target.value })}>
              <option value="">TBD</option>
              {teamOpts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className={labelCls}>Masa
            <input type="datetime-local" className={`${inputCls} mt-1`} value={f.scheduled_at} onChange={e => setF({ ...f, scheduled_at: e.target.value })} />
          </label>
          <label className={labelCls}>Station
            <input className={`${inputCls} mt-1`} value={f.station} onChange={e => setF({ ...f, station: e.target.value })} placeholder="Station 1" />
          </label>
          <label className={labelCls}>Best of
            <select className={`${inputCls} mt-1`} value={f.best_of} onChange={e => setF({ ...f, best_of: Number(e.target.value) })}>
              {[1, 3, 5].map(n => <option key={n} value={n}>BO{n}</option>)}
            </select>
          </label>
          {!isNew && (
            <label className={labelCls}>Status
              <select className={`${inputCls} mt-1`} value={f.status} onChange={e => setF({ ...f, status: e.target.value as MatchStatus })}>
                {MATCH_STATUSES.map(s => <option key={s} value={s}>{MATCH_STATUS_LABEL[s]}</option>)}
              </select>
            </label>
          )}
          <label className={labelCls}>Round
            <input className={`${inputCls} mt-1`} value={f.round_name} onChange={e => setF({ ...f, round_name: e.target.value })} placeholder="Round 1 / Final" />
          </label>
          <label className={labelCls}>Group
            <input className={`${inputCls} mt-1`} value={f.group_name} onChange={e => setF({ ...f, group_name: e.target.value.toUpperCase() })} placeholder="A" />
          </label>
          <label className={`${labelCls} col-span-2`}>Lobby / room info (dilihat peserta)
            <input className={`${inputCls} mt-1`} value={f.lobby_info} onChange={e => setF({ ...f, lobby_info: e.target.value })} placeholder="Room ID 12345 · pass loka" />
          </label>
          <label className={`${labelCls} col-span-2`}>Nota admin (dalaman)
            <textarea rows={2} className={`${inputCls} mt-1`} value={f.admin_notes} onChange={e => setF({ ...f, admin_notes: e.target.value })} />
          </label>
        </div>
        {err && <p className="mt-3 text-sm text-red-500">{err}</p>}
      </Sheet>
      <ConfirmSheet open={confirmDel} title="Padam match?" message="Match dan skornya akan dibuang terus." busy={busy} onConfirm={() => void remove()} onClose={() => setConfirmDel(false)} />
    </>
  );
}

export function MatchesTab({ bundle, reload }: TabProps) {
  const t = bundle.tournament;
  const teams = useMemo(() => new Map(bundle.teams.map(x => [x.id, x])), [bundle.teams]);
  const [editing, setEditing] = useState<Match | "new" | null>(null);
  const [gen, setGen] = useState({ start_at: toLocalInput(t.start_at), interval_minutes: 30, stations: 2 });
  const [confirm, setConfirm] = useState<null | "generate" | "force" | "seed" | "seed_force">(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "done">("open");

  const approved = bundle.teams.filter(x => x.registration_status === "approved").length;
  const hasKnockout = bundle.matches.some(m => m.stage === "knockout");

  async function run(action: "generate" | "seed_knockout", force = false) {
    setBusy(true); setMsg(null);
    const r = await api(`/api/admin/tournaments/${t.id}/schedule`, "POST", { action, force, ...gen, start_at: fromLocalInput(gen.start_at) });
    setBusy(false);
    if (r.status === 409 && (r.data as { code?: string }).code === "HAS_RESULTS") { setConfirm("force"); return; }
    if (r.status === 409 && (r.data as { code?: string }).code === "GROUPS_UNFINISHED") { setMsg(r.data.error || ""); setConfirm("seed_force"); return; }
    setConfirm(null);
    if (!r.ok) { setMsg(r.data.error || "Gagal"); return; }
    setMsg(action === "generate" ? `✓ ${(r.data as { matches?: number }).matches} match dijana` : "✓ Knockout diisi dari standings");
    await reload();
  }

  const list = bundle.matches.filter(m =>
    String(m.round_name || "").includes("(bye)") ? false :
    filter === "open" ? !["completed", "cancelled"].includes(m.status) :
    filter === "done" ? m.status === "completed" : true
  );

  return (
    <div className="space-y-5">
      <div className={cardCls}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-bold text-gray-900">Jana jadual</div>
            <p className="text-xs text-gray-400">{approved} team lulus · format {t.format === "round_robin" ? "round robin" : t.format === "single_elim" ? "single elimination" : `${t.group_count} group + knockout (top ${t.advance_per_group})`}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className={`${labelCls} col-span-2`}>Match pertama
            <input type="datetime-local" className={`${inputCls} mt-1`} value={gen.start_at} onChange={e => setGen({ ...gen, start_at: e.target.value })} />
          </label>
          <label className={labelCls}>Selang (minit)
            <input type="number" min={0} className={`${inputCls} mt-1`} value={gen.interval_minutes} onChange={e => setGen({ ...gen, interval_minutes: Number(e.target.value) })} />
          </label>
          <label className={labelCls}>Station serentak
            <input type="number" min={1} className={`${inputCls} mt-1`} value={gen.stations} onChange={e => setGen({ ...gen, stations: Number(e.target.value) })} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={busy || approved < 2} onClick={() => (bundle.matches.length ? setConfirm("generate") : void run("generate"))} className={btnPrimary}>
            {bundle.matches.length ? "Jana semula" : "Jana jadual"}
          </button>
          {t.format === "group_knockout" && hasKnockout && (
            <button disabled={busy} onClick={() => setConfirm("seed")} className={btnGhost}>Isi knockout dari standings</button>
          )}
          <button onClick={() => setEditing("new")} className={btnGhost}>+ Match manual</button>
        </div>
        {msg && <p className="mt-2 text-sm text-gray-600">{msg}</p>}
      </div>

      <div className="flex items-center gap-2">
        {(["open", "done", "all"] as const).map(k => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === k ? "bg-[#7F1D1D] text-white" : "bg-gray-100 text-gray-500"}`}>
            {k === "open" ? "Belum selesai" : k === "done" ? "Selesai" : "Semua"}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">{list.length} match</span>
      </div>

      {list.length === 0 ? (
        <div className={`${cardCls} py-10 text-center`}>
          <div className="text-4xl">🗓️</div>
          <p className="mt-2 text-sm text-gray-400">{bundle.matches.length ? "Tiada match di sini." : "Belum ada jadual. Luluskan team, kemudian Jana jadual."}</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map(m => (
            <QuickScore key={m.id} match={m} teams={teams} tournamentId={t.id} onSaved={reload} onEdit={() => setEditing(m)} />
          ))}
        </div>
      )}

      {editing && <MatchEditor match={editing} teams={bundle.teams} tournamentId={t.id} onClose={() => setEditing(null)} onSaved={reload} />}

      <ConfirmSheet
        open={confirm === "generate"}
        title="Jana semula jadual?"
        message={`Semua ${bundle.matches.length} match sedia ada akan diganti.`}
        confirmLabel="Jana semula"
        busy={busy}
        onConfirm={() => void run("generate")}
        onClose={() => setConfirm(null)}
      />
      <ConfirmSheet
        open={confirm === "force"}
        title="Match dah ada keputusan"
        message="Jana semula akan MEMADAM keputusan yang sudah dimasukkan. Teruskan?"
        confirmLabel="Ya, padam & jana"
        busy={busy}
        onConfirm={() => void run("generate", true)}
        onClose={() => setConfirm(null)}
      />
      <ConfirmSheet
        open={confirm === "seed"}
        title="Isi knockout?"
        message={`Top ${t.advance_per_group} setiap group akan dimasukkan ke pusingan pertama knockout ikut standings semasa.`}
        confirmLabel="Isi knockout"
        danger={false}
        busy={busy}
        onConfirm={() => void run("seed_knockout")}
        onClose={() => setConfirm(null)}
      />
      <ConfirmSheet
        open={confirm === "seed_force"}
        title="Group belum habis"
        message={`${msg || ""} Isi juga ikut standings sekarang?`}
        confirmLabel="Isi juga"
        busy={busy}
        onConfirm={() => void run("seed_knockout", true)}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
