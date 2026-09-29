"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FORMAT_LABEL, STATUS_LABEL, voucherSpecLabel, type Tournament, type VoucherSpec } from "@/lib/tournament/types";
import { ConfirmSheet, ImageField, Toggle, api, btnPrimary, cardCls, fromLocalInput, inputCls, labelCls, toLocalInput } from "../ui";
import type { TabProps } from "./page";

const OFF: VoucherSpec = { enabled: false, type: "amount", value: 0, max_discount: null, min_spend: 0 };

function VoucherEditor({ title, hint, spec, withValidity, onChange }: {
  title: string; hint: string; spec: VoucherSpec; withValidity?: boolean; onChange: (s: VoucherSpec) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-100 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <div className="text-xs text-gray-400">{hint}</div>
        </div>
        <Toggle on={spec.enabled} onChange={v => onChange({ ...spec, enabled: v })} />
      </div>
      {spec.enabled && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className={labelCls}>Jenis
            <select className={`${inputCls} mt-1`} value={spec.type} onChange={e => onChange({ ...spec, type: e.target.value as "amount" | "percent" })}>
              <option value="amount">RM off</option>
              <option value="percent">% off</option>
            </select>
          </label>
          <label className={labelCls}>Nilai
            <input type="number" min={0} step={0.5} className={`${inputCls} mt-1`} value={spec.value} onChange={e => onChange({ ...spec, value: Number(e.target.value) })} />
          </label>
          {spec.type === "percent" && (
            <label className={labelCls}>Maks RM
              <input type="number" min={0} className={`${inputCls} mt-1`} value={spec.max_discount ?? ""} onChange={e => onChange({ ...spec, max_discount: e.target.value ? Number(e.target.value) : null })} />
            </label>
          )}
          <label className={labelCls}>Min belanja
            <input type="number" min={0} className={`${inputCls} mt-1`} value={spec.min_spend ?? 0} onChange={e => onChange({ ...spec, min_spend: Number(e.target.value) })} />
          </label>
          {withValidity && (
            <label className={labelCls}>Sah (hari)
              <input type="number" min={1} className={`${inputCls} mt-1`} value={spec.validity_days ?? 30} onChange={e => onChange({ ...spec, validity_days: Number(e.target.value) })} />
            </label>
          )}
          <p className="col-span-full text-xs text-[#7F1D1D]">Kapten: {voucherSpecLabel(spec)}{spec.min_spend ? ` · min RM${spec.min_spend}` : ""}</p>
        </div>
      )}
    </div>
  );
}

export function SettingsTab({ bundle, reload }: TabProps) {
  const router = useRouter();
  const t0 = bundle.tournament;
  const normalise = (t: Tournament): Tournament => ({
    ...t,
    prizes: t.prizes && t.prizes.length ? t.prizes : [],
    voucher_config: {
      discount: { ...OFF, validity_days: 30, ...t.voucher_config?.discount },
      event_day: { ...OFF, ...t.voucher_config?.event_day },
    },
  });
  const [f, setF] = useState<Tournament>(() => normalise(t0));
  // What this tab loaded. Saving sends only fields changed since then, so a
  // tab left open overnight can't overwrite edits made elsewhere meanwhile.
  const [base, setBase] = useState<Tournament>(() => normalise(t0));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (patch: Partial<Tournament>) => setF(x => ({ ...x, ...patch }));

  const changed = (Object.keys(f) as (keyof Tournament)[]).filter(
    k => JSON.stringify(f[k] ?? null) !== JSON.stringify(base[k] ?? null)
  );

  async function save() {
    if (!changed.length) { setMsg("Tiada perubahan"); return; }
    setBusy(true); setMsg(null);
    const patch = Object.fromEntries(changed.map(k => [k, f[k]]));
    const r = await api<{ tournament: Tournament; warning?: string }>(`/api/admin/tournaments/${t0.id}`, "PATCH", patch);
    setBusy(false);
    if (!r.ok) { setMsg(`⚠️ ${r.data.error || "Gagal simpan"}`); return; }
    // Continue from what the server now holds (including other people's edits).
    const fresh = normalise(r.data.tournament);
    setF(fresh); setBase(fresh);
    setMsg(r.data.warning ? `⚠️ ${r.data.warning}` : `✓ Disimpan (${changed.length} medan)`);
    await reload();
  }

  async function remove() {
    setBusy(true);
    const r = await api(`/api/admin/tournaments/${t0.id}`, "DELETE");
    setBusy(false);
    if (r.ok) router.replace("/dashboard/tournaments");
    else { setMsg(r.data.error || "Gagal padam"); setConfirmDel(false); }
  }

  const eventDayNoDate = f.voucher_config.event_day?.enabled && !f.start_at;

  return (
    <div className="space-y-5 pb-24">
      <section className={`${cardCls} space-y-3`}>
        <h2 className="font-bold text-gray-900">Maklumat</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className={`${labelCls} col-span-2`}>Nama
            <input className={`${inputCls} mt-1`} value={f.name} onChange={e => set({ name: e.target.value })} />
          </label>
          <label className={`${labelCls} col-span-2`}>Link (pos.lokacafe.my/tournament/…)
            <input className={`${inputCls} mt-1 font-mono`} value={f.slug} onChange={e => set({ slug: e.target.value })} />
          </label>
          <label className={labelCls}>Format
            <select className={`${inputCls} mt-1`} value={f.format} onChange={e => set({ format: e.target.value as Tournament["format"] })}>
              {Object.entries(FORMAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className={labelCls}>Status
            <select className={`${inputCls} mt-1`} value={f.status} onChange={e => set({ status: e.target.value as Tournament["status"] })}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className={labelCls}>Mula
            <input type="datetime-local" className={`${inputCls} mt-1`} value={toLocalInput(f.start_at)} onChange={e => set({ start_at: fromLocalInput(e.target.value) })} />
          </label>
          <label className={labelCls}>Tamat
            <input type="datetime-local" className={`${inputCls} mt-1`} value={toLocalInput(f.end_at)} onChange={e => set({ end_at: fromLocalInput(e.target.value) })} />
          </label>
          <label className={labelCls}>Venue
            <input className={`${inputCls} mt-1`} value={f.venue || ""} onChange={e => set({ venue: e.target.value })} />
          </label>
          <div className="flex items-end pb-1"><Toggle on={f.published} onChange={v => set({ published: v })} label="Published" /></div>
          <div className="col-span-2"><ImageField label="Poster (atas landing page + gambar bila link dikongsi)" value={f.cover_url} onChange={url => set({ cover_url: url })} /></div>
          <div className="col-span-2"><ImageField label="Logo tournament (kecil, jika tiada poster)" value={f.logo_url} onChange={url => set({ logo_url: url })} /></div>
          <label className={`${labelCls} col-span-2`}>Penerangan / peraturan / hadiah (dilihat peserta)
            <textarea rows={5} className={`${inputCls} mt-1`} value={f.description || ""} onChange={e => set({ description: e.target.value })} />
          </label>
        </div>
      </section>

      <section className={`${cardCls} space-y-3`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900">Hadiah</h2>
            <p className="text-xs text-gray-400">Dipapar besar di landing page pendaftaran.</p>
          </div>
          {(f.prizes || []).length < 8 && (
            <button onClick={() => set({ prizes: [...(f.prizes || []), { title: "", value: "" }] })} className="text-xs font-semibold text-[#7F1D1D]">+ Hadiah</button>
          )}
        </div>
        {(f.prizes || []).length === 0 && (
          <button
            onClick={() => set({ prizes: [{ title: "Juara", value: "" }, { title: "Naib Juara", value: "" }, { title: "MVP", value: "" }] })}
            className="w-full rounded-xl border border-dashed border-gray-200 py-3 text-sm text-gray-500"
          >
            Mula dengan Juara / Naib Juara / MVP
          </button>
        )}
        {(f.prizes || []).map((p, i) => (
          <div key={i} className="grid grid-cols-[1fr_2fr_auto] items-center gap-2">
            <input className={inputCls} placeholder="Juara" value={p.title} onChange={e => set({ prizes: (f.prizes || []).map((x, k) => (k === i ? { ...x, title: e.target.value } : x)) })} />
            <input className={inputCls} placeholder="RM300 + trofi" value={p.value} onChange={e => set({ prizes: (f.prizes || []).map((x, k) => (k === i ? { ...x, value: e.target.value } : x)) })} />
            <button onClick={() => set({ prizes: (f.prizes || []).filter((_, k) => k !== i) })} className="px-1 text-lg text-gray-400" aria-label="Buang">×</button>
          </div>
        ))}
      </section>

      <section className={`${cardCls} space-y-3`}>
        <h2 className="font-bold text-gray-900">Pendaftaran & bayaran</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className={labelCls}>Maks team
            <input type="number" min={2} className={`${inputCls} mt-1`} value={f.max_teams} onChange={e => set({ max_teams: Number(e.target.value) })} />
          </label>
          <label className={labelCls}>Min pemain
            <input type="number" min={1} className={`${inputCls} mt-1`} value={f.min_players} onChange={e => set({ min_players: Number(e.target.value) })} />
          </label>
          <label className={labelCls}>Maks pemain
            <input type="number" min={1} className={`${inputCls} mt-1`} value={f.max_players} onChange={e => set({ max_players: Number(e.target.value) })} />
          </label>
          <label className={labelCls}>Yuran / team (RM)
            <input type="number" min={0} className={`${inputCls} mt-1`} value={f.entry_fee} onChange={e => set({ entry_fee: Number(e.target.value) })} />
          </label>
          <label className={`${labelCls} col-span-2`}>Tutup pendaftaran
            <input type="datetime-local" className={`${inputCls} mt-1`} value={toLocalInput(f.registration_deadline)} onChange={e => set({ registration_deadline: fromLocalInput(e.target.value) })} />
          </label>
          <label className={`${labelCls} col-span-full`}>Arahan bayaran (bank, no. akaun, nama)
            <textarea rows={3} className={`${inputCls} mt-1`} value={f.payment_instructions || ""} onChange={e => set({ payment_instructions: e.target.value })} placeholder={"Maybank 1234 5678 9012\nLoka Cafe Enterprise"} />
          </label>
          <div className="col-span-full"><ImageField label="QR DuitNow (pilihan)" value={f.payment_qr_url} onChange={url => set({ payment_qr_url: url })} /></div>
        </div>
      </section>

      <section className={`${cardCls} space-y-3`}>
        <h2 className="font-bold text-gray-900">Baucar</h2>
        <p className="text-xs text-gray-400">Dikeluarkan bila team diluluskan, ke akaun Loka setiap pemain yang ada no. telefon — biasanya kapten sahaja (borang hanya minta nombor kapten). Admin boleh tambah nombor pemain lain di tab Teams.</p>
        <VoucherEditor
          title="Baucar diskaun"
          hint="Boleh guna mulai hari lulus"
          withValidity
          spec={f.voucher_config.discount || OFF}
          onChange={s => set({ voucher_config: { ...f.voucher_config, discount: s } })}
        />
        <VoucherEditor
          title="Baucar hari tournament"
          hint="Sah HANYA pada tarikh tournament (ikut Mula–Tamat)"
          spec={f.voucher_config.event_day || OFF}
          onChange={s => set({ voucher_config: { ...f.voucher_config, event_day: s } })}
        />
        {eventDayNoDate && <p className="text-xs font-semibold text-amber-600">⚠️ Set tarikh Mula — tanpanya baucar hari tournament tak dikeluarkan.</p>}
      </section>

      <section className={`${cardCls} space-y-3`}>
        <h2 className="font-bold text-gray-900">Format perlawanan</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className={labelCls}>Best of (group)
            <select className={`${inputCls} mt-1`} value={f.default_best_of} onChange={e => set({ default_best_of: Number(e.target.value) })}>
              {[1, 3, 5].map(n => <option key={n} value={n}>BO{n}</option>)}
            </select>
          </label>
          <label className={labelCls}>Best of (knockout)
            <select className={`${inputCls} mt-1`} value={f.knockout_best_of} onChange={e => set({ knockout_best_of: Number(e.target.value) })}>
              {[1, 3, 5].map(n => <option key={n} value={n}>BO{n}</option>)}
            </select>
          </label>
          <label className={labelCls}>Mata menang
            <input type="number" min={0} className={`${inputCls} mt-1`} value={f.points_win} onChange={e => set({ points_win: Number(e.target.value) })} />
          </label>
          <label className={labelCls}>Mata kalah
            <input type="number" min={0} className={`${inputCls} mt-1`} value={f.points_loss} onChange={e => set({ points_loss: Number(e.target.value) })} />
          </label>
          {f.format === "group_knockout" && (
            <>
              <label className={labelCls}>Bilangan group
                <input type="number" min={1} className={`${inputCls} mt-1`} value={f.group_count} onChange={e => set({ group_count: Number(e.target.value) })} />
              </label>
              <label className={labelCls}>Layak / group
                <input type="number" min={1} className={`${inputCls} mt-1`} value={f.advance_per_group} onChange={e => set({ advance_per_group: Number(e.target.value) })} />
              </label>
            </>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-red-100 p-4">
        <button onClick={() => setConfirmDel(true)} className="text-sm font-semibold text-red-500">Padam tournament</button>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-100 bg-white px-4 py-3 md:left-[248px]" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-3">
          {msg && <span className="text-sm text-gray-600">{msg}</span>}
          <button onClick={() => void save()} disabled={busy || !changed.length} className={btnPrimary}>{busy ? "Menyimpan…" : changed.length ? `Simpan (${changed.length})` : "Simpan"}</button>
        </div>
      </div>

      <ConfirmSheet
        open={confirmDel}
        title={`Padam ${t0.name}?`}
        message="Semua team, pemain, match dan pengumuman akan dibuang. Baucar yang sudah dikeluarkan kekal dengan pemain. Tak boleh undo."
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setConfirmDel(false)}
      />
    </div>
  );
}
