"use client";

import { useState } from "react";
import { PLAYER_ROLES, REG_STATUS_LABEL, ROLE_LABEL, type AdminTeam, type Player, type PlayerRole } from "@/lib/tournament/types";
import { Badge, ConfirmSheet, ImageField, Sheet, api, btnGhost, btnPrimary, cardCls, inputCls, labelCls } from "../ui";
import type { TabProps } from "./page";

type PlayerDraft = Pick<Player, "full_name" | "ign" | "mlbb_user_id" | "server_id" | "phone" | "player_role" | "is_captain"> & { id?: string };

function TeamEditor({ team, tournamentId, onClose, onSaved }: {
  team: AdminTeam | "new"; tournamentId: string; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const isNew = team === "new";
  const t = isNew ? null : team;
  const [f, setF] = useState({
    name: t?.name || "",
    short_name: t?.short_name || "",
    logo_url: t?.logo_url || null as string | null,
    team_number: t?.team_number ?? "",
    group_name: t?.group_name || "",
    seed: t?.seed ?? "",
    manual_position: t?.manual_position ?? "",
    contact_phone: t?.contact_phone || "",
    notes: t?.notes || "",
  });
  const [players, setPlayers] = useState<PlayerDraft[]>(
    t?.players.map(p => ({ id: p.id, full_name: p.full_name, ign: p.ign, mlbb_user_id: p.mlbb_user_id, server_id: p.server_id, phone: p.phone, player_role: p.player_role, is_captain: p.is_captain }))
    || [{ full_name: "", ign: "", mlbb_user_id: "", server_id: "", phone: "", player_role: "exp", is_captain: true }]
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  const setP = (i: number, patch: Partial<PlayerDraft>) => setPlayers(ps => ps.map((p, k) => (k === i ? { ...p, ...patch } : patch.is_captain ? { ...p, is_captain: false } : p)));

  async function save() {
    setBusy(true); setErr(null);
    const body = { ...f, players };
    const r = isNew
      ? await api(`/api/admin/tournaments/${tournamentId}/teams`, "POST", body)
      : await api(`/api/admin/tournaments/${tournamentId}/teams/${t!.id}`, "PATCH", body);
    setBusy(false);
    if (!r.ok) { setErr(r.data.error || "Gagal simpan"); return; }
    await onSaved(); onClose();
  }

  async function remove() {
    setBusy(true);
    const r = await api(`/api/admin/tournaments/${tournamentId}/teams/${t!.id}`, "DELETE");
    setBusy(false);
    if (!r.ok) { setErr(r.data.error || "Gagal padam"); setConfirmDel(false); return; }
    await onSaved(); onClose();
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={isNew ? "Tambah team" : `Edit ${t!.name}`}
        footer={
          <div className="flex gap-2">
            {!isNew && <button onClick={() => setConfirmDel(true)} className="rounded-xl px-3 py-2 text-sm font-semibold text-red-500">Padam</button>}
            <button onClick={onClose} className={`${btnGhost} flex-1`}>Batal</button>
            <button onClick={() => void save()} disabled={busy} className={`${btnPrimary} flex-1`}>{busy ? "…" : "Simpan"}</button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <label className={`${labelCls} col-span-2`}>Nama team
            <input className={`${inputCls} mt-1`} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          </label>
          <label className={labelCls}>Tag
            <input className={`${inputCls} mt-1`} value={f.short_name} maxLength={6} onChange={e => setF({ ...f, short_name: e.target.value.toUpperCase() })} />
          </label>
          <label className={labelCls}>No. team
            <input type="number" className={`${inputCls} mt-1`} value={f.team_number} onChange={e => setF({ ...f, team_number: e.target.value })} />
          </label>
          <label className={labelCls}>Group
            <input className={`${inputCls} mt-1`} value={f.group_name} onChange={e => setF({ ...f, group_name: e.target.value.toUpperCase() })} placeholder="A" />
          </label>
          <label className={labelCls}>Seed
            <input type="number" className={`${inputCls} mt-1`} value={f.seed} onChange={e => setF({ ...f, seed: e.target.value })} />
          </label>
          <label className={labelCls}>Kedudukan manual
            <input type="number" className={`${inputCls} mt-1`} value={f.manual_position} onChange={e => setF({ ...f, manual_position: e.target.value })} placeholder="auto" />
          </label>
          <label className={labelCls}>Telefon hubungan
            <input className={`${inputCls} mt-1`} value={f.contact_phone} onChange={e => setF({ ...f, contact_phone: e.target.value })} />
          </label>
          <div className="col-span-2"><ImageField label="Logo team" value={f.logo_url} onChange={url => setF({ ...f, logo_url: url })} /></div>
          <label className={`${labelCls} col-span-2`}>Nota
            <textarea rows={2} className={`${inputCls} mt-1`} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
          </label>
        </div>

        <div className="mt-5 mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Pemain ({players.length})</h3>
          <button onClick={() => setPlayers(ps => [...ps, { full_name: "", ign: "", mlbb_user_id: "", server_id: "", phone: "", player_role: "sub", is_captain: false }])} className="text-xs font-semibold text-[#7F1D1D]">+ Pemain</button>
        </div>
        <div className="space-y-3">
          {players.map((p, i) => (
            <div key={p.id || `new-${i}`} className="rounded-xl border border-gray-100 p-3">
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="IGN" value={p.ign} onChange={e => setP(i, { ign: e.target.value })} />
                <input className={inputCls} placeholder="Nama penuh" value={p.full_name} onChange={e => setP(i, { full_name: e.target.value })} />
                <input className={inputCls} placeholder="MLBB ID" value={p.mlbb_user_id} onChange={e => setP(i, { mlbb_user_id: e.target.value.replace(/\D/g, "") })} />
                <input className={inputCls} placeholder="Server" value={p.server_id} onChange={e => setP(i, { server_id: e.target.value.replace(/\D/g, "") })} />
                <input className={inputCls} placeholder="Telefon" value={p.phone} onChange={e => setP(i, { phone: e.target.value })} />
                <select className={inputCls} value={p.player_role} onChange={e => setP(i, { player_role: e.target.value as PlayerRole })}>
                  {PLAYER_ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <label className="flex items-center gap-1.5 text-gray-600">
                  <input type="radio" checked={p.is_captain} onChange={() => setP(i, { is_captain: true })} /> Kapten
                </label>
                <button onClick={() => setPlayers(ps => ps.filter((_, k) => k !== i))} className="font-semibold text-red-500">Buang</button>
              </div>
            </div>
          ))}
        </div>
        {!isNew && <p className="mt-3 text-xs text-gray-400">Tukar nombor telefon pemain? Lepas simpan, tekan &quot;Keluarkan semula baucar&quot; di Pendaftaran supaya nombor baru dapat baucar.</p>}
        {err && <p className="mt-3 text-sm text-red-500">{err}</p>}
      </Sheet>
      <ConfirmSheet
        open={confirmDel}
        title={`Padam ${t?.name}?`}
        message="Team, pemain dan tempatnya dalam jadual akan dibuang. Baucar yang sudah dikeluarkan kekal dengan pemain."
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setConfirmDel(false)}
      />
    </>
  );
}

export function TeamsTab({ bundle, reload }: TabProps) {
  const t = bundle.tournament;
  const [editing, setEditing] = useState<AdminTeam | "new" | null>(null);
  const [showAll, setShowAll] = useState(false);
  const teams = bundle.teams
    .filter(x => showAll || x.registration_status === "approved")
    .sort((a, b) => (a.group_name || "").localeCompare(b.group_name || "") || (a.team_number ?? 999) - (b.team_number ?? 999) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-gray-500">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Tunjuk semua status
        </label>
        <button onClick={() => setEditing("new")} className={btnPrimary}>+ Tambah team</button>
      </div>

      {teams.length === 0 ? (
        <div className={`${cardCls} py-10 text-center`}>
          <div className="text-4xl">👥</div>
          <p className="mt-2 text-sm text-gray-400">Belum ada team diluluskan.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {teams.map(team => (
            <button key={team.id} onClick={() => setEditing(team)} className={`${cardCls} text-left transition hover:shadow-md`}>
              <div className="flex items-center gap-3">
                {team.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={team.logo_url} alt="" className="h-11 w-11 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#7F1D1D]/10 text-xs font-bold text-[#7F1D1D]">{(team.short_name || team.name).slice(0, 3).toUpperCase()}</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-gray-900">{team.name}</div>
                  <div className="text-xs text-gray-400">
                    {team.team_number ? `#${team.team_number} · ` : ""}{team.group_name ? `Group ${team.group_name} · ` : ""}{team.players.length} pemain
                    {team.seed ? ` · Seed ${team.seed}` : ""}{team.manual_position ? ` · Pos ${team.manual_position} (manual)` : ""}
                  </div>
                </div>
                {team.registration_status !== "approved" && <Badge tone="amber">{REG_STATUS_LABEL[team.registration_status]}</Badge>}
              </div>
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-400">Maks {t.max_players} pemain setiap team. Team yang ditambah admin masuk &quot;Menunggu semakan&quot; — luluskan di Pendaftaran untuk keluarkan baucar.</p>

      {editing && <TeamEditor team={editing} tournamentId={t.id} onClose={() => setEditing(null)} onSaved={reload} />}
    </div>
  );
}
