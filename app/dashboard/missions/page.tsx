"use client";

import { useEffect, useState } from "react";

type Mission = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  type: string;
  threshold: number;
  window_days: number;
  weekday: number | null;
  qualifying_min_spend: number;
  reward_points: number;
  reward_free_label: string | null;
  reward_voucher_expiry_days: number;
  repeatable: boolean;
  in_progress?: number;
  completed?: number;
};

const WEEKDAYS = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
const blank = (): Partial<Mission> => ({
  code: "", name: "", description: "", active: true, type: "count_in_window",
  threshold: 4, window_days: 8, weekday: 2, qualifying_min_spend: 0,
  reward_points: 0, reward_free_label: "1 Cup Percuma", reward_voucher_expiry_days: 30, repeatable: true,
});

const input = "w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20 dark:text-white";

export default function MissionsPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Partial<Mission> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/admin/missions", { cache: "no-store" })
      .then(r => r.json())
      .then(d => setMissions(d.missions || []))
      .catch(() => setError("Gagal muatkan mission"))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function save() {
    if (!form) return;
    setSaving(true); setError(null);
    try {
      const isNew = !form.id;
      const res = await fetch(isNew ? "/api/admin/missions" : `/api/admin/missions/${form.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "Gagal simpan"); return; }
      setForm(null); load();
    } finally { setSaving(false); }
  }

  async function toggleActive(m: Mission) {
    await fetch(`/api/admin/missions/${m.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !m.active }),
    });
    load();
  }

  async function remove(m: Mission) {
    if (!confirm(`Padam mission "${m.name}"?`)) return;
    await fetch(`/api/admin/missions/${m.id}`, { method: "DELETE" });
    load();
  }

  function ruleText(m: Mission) {
    const base = `Beli ${m.threshold} kali dalam ${m.window_days} hari`;
    return m.type === "count_on_weekday_in_window" && m.weekday != null
      ? `Beli ${m.threshold} kali pada ${WEEKDAYS[m.weekday]} (dalam ${m.window_days} hari)`
      : base;
  }

  return (
    <div className="py-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Missions</h1>
          <p className="text-sm text-gray-500 mt-0.5">Cabaran kumpul — beli X kali → reward automatik</p>
        </div>
        <button onClick={() => setForm(blank())} className="rounded-xl bg-[#7F1D1D] px-4 py-2 text-sm font-bold text-white hover:bg-[#6B1818]">+ Tambah</button>
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Memuatkan...</p>
      ) : missions.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center text-sm text-gray-400">Tiada mission lagi.</div>
      ) : (
        <div className="space-y-3">
          {missions.map(m => (
            <div key={m.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{m.name}</span>
                    <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-[10px] font-mono text-gray-500">{m.code}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${m.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>{m.active ? "Aktif" : "Off"}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{ruleText(m)}</p>
                  <p className="mt-0.5 text-xs text-[#7F1D1D]">🎁 {m.reward_free_label || "—"}{m.reward_points > 0 ? ` + ${m.reward_points} pts` : ""}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">Tengah jalan: {m.in_progress ?? 0} · Siap: {m.completed ?? 0}</p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button onClick={() => toggleActive(m)} className="text-xs font-semibold text-[#7F1D1D]">{m.active ? "Matikan" : "Hidupkan"}</button>
                  <button onClick={() => setForm(m)} className="text-xs font-semibold text-blue-600">Edit</button>
                  <button onClick={() => remove(m)} className="text-xs font-semibold text-red-500">Padam</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center p-0 sm:p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-gray-800 p-5">
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">{form.id ? "Edit Mission" : "Mission Baru"}</h2>
            <div className="grid grid-cols-2 gap-3">
              {!form.id && (
                <label className="col-span-2 text-xs font-semibold text-gray-600 dark:text-gray-300">Kod (unik)
                  <input className={input} value={form.code || ""} onChange={e => setForm({ ...form, code: e.target.value })} />
                </label>
              )}
              <label className="col-span-2 text-xs font-semibold text-gray-600 dark:text-gray-300">Nama
                <input className={input} value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="col-span-2 text-xs font-semibold text-gray-600 dark:text-gray-300">Jenis
                <select className={input} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option value="count_in_window">Beli X kali dalam tempoh</option>
                  <option value="count_on_weekday_in_window">Beli X kali pada hari tertentu</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Bilangan (threshold)
                <input type="number" min={1} className={input} value={form.threshold ?? 1} onChange={e => setForm({ ...form, threshold: Number(e.target.value) })} />
              </label>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Tempoh (hari)
                <input type="number" min={1} className={input} value={form.window_days ?? 8} onChange={e => setForm({ ...form, window_days: Number(e.target.value) })} />
              </label>
              {form.type === "count_on_weekday_in_window" && (
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Hari
                  <select className={input} value={form.weekday ?? 2} onChange={e => setForm({ ...form, weekday: Number(e.target.value) })}>
                    {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </label>
              )}
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Min belanja (RM)
                <input type="number" min={0} step={0.5} className={input} value={form.qualifying_min_spend ?? 0} onChange={e => setForm({ ...form, qualifying_min_spend: Number(e.target.value) })} />
              </label>
              <label className="col-span-2 text-xs font-semibold text-gray-600 dark:text-gray-300">Label reward (cup percuma)
                <input className={input} value={form.reward_free_label || ""} onChange={e => setForm({ ...form, reward_free_label: e.target.value })} />
              </label>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Bonus point
                <input type="number" min={0} className={input} value={form.reward_points ?? 0} onChange={e => setForm({ ...form, reward_points: Number(e.target.value) })} />
              </label>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Voucher luput (hari)
                <input type="number" min={1} className={input} value={form.reward_voucher_expiry_days ?? 30} onChange={e => setForm({ ...form, reward_voucher_expiry_days: Number(e.target.value) })} />
              </label>
            </div>
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
            <div className="mt-5 flex gap-2">
              <button onClick={() => setForm(null)} className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300">Batal</button>
              <button onClick={() => void save()} disabled={saving} className="flex-1 rounded-xl bg-[#7F1D1D] py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? "Menyimpan..." : "Simpan"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
