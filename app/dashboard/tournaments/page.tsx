"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FORMAT_LABEL, STATUS_LABEL, type Tournament, type TournamentFormat } from "@/lib/tournament/types";
import { Badge, Sheet, api, btnGhost, btnPrimary, cardCls, fromLocalInput, inputCls, labelCls } from "./ui";

type Row = Tournament & { team_counts: Record<string, number> };

export default function TournamentsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", format: "round_robin" as TournamentFormat, start_at: "", venue: "Loka Cafe" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ tournaments: Row[]; needs_migration?: boolean }>("/api/admin/tournaments").then(r => {
      setRows(r.data.tournaments || []);
      setNeedsMigration(!!r.data.needs_migration);
      if (!r.ok) setError(r.data.error || "Gagal muatkan");
    });
  }, []);

  async function create() {
    if (!form.name.trim()) { setError("Nama diperlukan"); return; }
    setBusy(true); setError(null);
    const r = await api<{ tournament: Tournament }>("/api/admin/tournaments", "POST", {
      ...form,
      start_at: fromLocalInput(form.start_at),
      voucher_config: {
        discount: { enabled: true, type: "amount", value: 5, min_spend: 10, validity_days: 30 },
        event_day: { enabled: true, type: "percent", value: 10, max_discount: 10 },
      },
    });
    setBusy(false);
    if (!r.ok) { setError(r.data.error || "Gagal cipta"); return; }
    router.push(`/dashboard/tournaments/${r.data.tournament.id}?tab=settings`);
  }

  return (
    <div className="py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tournaments</h1>
          <p className="mt-0.5 text-sm text-gray-400">Pendaftaran team MLBB, jadual, skor live & baucar pemain.</p>
        </div>
        <button onClick={() => setCreating(true)} className={btnPrimary}>+ Tournament</button>
      </div>

      {needsMigration && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          ⚠️ Jalankan migration <code className="font-mono">supabase/migrations/20260929_tournament.sql</code> di Supabase SQL editor dulu.
        </div>
      )}
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {rows === null ? (
        <div className="space-y-3">{[0, 1].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />)}</div>
      ) : rows.length === 0 ? (
        <div className={`${cardCls} py-12 text-center`}>
          <div className="text-5xl">🎮</div>
          <p className="mt-3 text-sm text-gray-400">Belum ada tournament.</p>
          <button onClick={() => setCreating(true)} className={`${btnPrimary} mt-4`}>Cipta tournament pertama</button>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(t => {
            const c = t.team_counts || {};
            return (
              <Link key={t.id} href={`/dashboard/tournaments/${t.id}`} className={`${cardCls} flex items-center gap-4 transition hover:shadow-md`}>
                {t.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.logo_url} alt="" className="h-12 w-12 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#7F1D1D]/10 text-2xl">🎮</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-bold text-gray-900">{t.name}</span>
                    <Badge tone={t.status === "ongoing" ? "red" : t.status === "registration_open" ? "green" : "gray"}>{STATUS_LABEL[t.status]}</Badge>
                    {!t.published && <Badge>Draft · tersembunyi</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {FORMAT_LABEL[t.format]} · {t.start_at ? new Date(t.start_at).toLocaleDateString("ms-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric" }) : "Tarikh belum set"}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs">
                  <div className="font-bold text-gray-900">{c.approved || 0} / {t.max_teams}</div>
                  <div className="text-gray-400">team lulus</div>
                  {(c.payment_submitted || 0) > 0 && <div className="mt-1 font-semibold text-amber-600">{c.payment_submitted} perlu semak</div>}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title="Tournament baru"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setCreating(false)} className={`${btnGhost} flex-1`}>Batal</button>
            <button onClick={() => void create()} disabled={busy} className={`${btnPrimary} flex-1`}>{busy ? "Mencipta…" : "Cipta"}</button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className={labelCls}>Nama
            <input className={`${inputCls} mt-1`} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Loka MLBB Cup #1" />
          </label>
          <label className={labelCls}>Format
            <select className={`${inputCls} mt-1`} value={form.format} onChange={e => setForm({ ...form, format: e.target.value as TournamentFormat })}>
              {Object.entries(FORMAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>Mula
              <input type="datetime-local" className={`${inputCls} mt-1`} value={form.start_at} onChange={e => setForm({ ...form, start_at: e.target.value })} />
            </label>
            <label className={labelCls}>Venue
              <input className={`${inputCls} mt-1`} value={form.venue} onChange={e => setForm({ ...form, venue: e.target.value })} />
            </label>
          </div>
          <p className="text-xs text-gray-400">Yuran, maklumat bank, baucar & had team diisi di tab Settings selepas ini. Tournament kekal tersembunyi sehingga anda publish.</p>
        </div>
      </Sheet>
    </div>
  );
}
