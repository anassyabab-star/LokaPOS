"use client";

import { useEffect, useState } from "react";

type Coupon = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  discount_type: string;
  discount_value: number;
  max_discount: number | null;
  applies_to: string;
  product_id?: string | null;
  category_id?: string | null;
  min_spend: number;
  validity_days: number;
  issue_min_spend: number;
  one_active_per_customer: boolean;
  issued_count?: number;
  redeemed_count?: number;
};

const blank = (): Partial<Coupon> => ({
  code: "", name: "", description: "", active: true, discount_type: "percent",
  discount_value: 10, max_discount: 5, applies_to: "all", min_spend: 0,
  validity_days: 14, issue_min_spend: 0, one_active_per_customer: true,
});

const input = "w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20 dark:text-white";

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Partial<Coupon> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/admin/coupons", { cache: "no-store" })
      .then(r => r.json())
      .then(d => setCoupons(d.coupons || []))
      .catch(() => setError("Gagal muatkan coupon"))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function save() {
    if (!form) return;
    setSaving(true); setError(null);
    try {
      const isNew = !form.id;
      const res = await fetch(isNew ? "/api/admin/coupons" : `/api/admin/coupons/${form.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "Gagal simpan"); return; }
      setForm(null); load();
    } finally { setSaving(false); }
  }

  async function toggleActive(c: Coupon) {
    await fetch(`/api/admin/coupons/${c.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !c.active }),
    });
    load();
  }

  async function remove(c: Coupon) {
    if (!confirm(`Padam coupon "${c.name}"?`)) return;
    await fetch(`/api/admin/coupons/${c.id}`, { method: "DELETE" });
    load();
  }

  function discountText(c: Coupon) {
    const v = c.discount_type === "percent" ? `${c.discount_value}%` : `RM${Number(c.discount_value).toFixed(2)}`;
    const scope = c.applies_to === "all" ? "semua" : c.applies_to === "product" ? "produk terpilih" : "kategori terpilih";
    return `${v} off (${scope})${c.max_discount ? ` · maks RM${c.max_discount}` : ""}`;
  }

  return (
    <div className="py-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Coupons</h1>
          <p className="text-sm text-gray-500 mt-0.5">Auto-keluar diskaun selepas beli. Hidupkan di Settings → Loyalty.</p>
        </div>
        <button onClick={() => setForm(blank())} className="rounded-xl bg-[#7F1D1D] px-4 py-2 text-sm font-bold text-white hover:bg-[#6B1818]">+ Tambah</button>
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Memuatkan...</p>
      ) : coupons.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center text-sm text-gray-400">Tiada coupon lagi.</div>
      ) : (
        <div className="space-y-3">
          {coupons.map(c => (
            <div key={c.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{c.name}</span>
                    <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-[10px] font-mono text-gray-500">{c.code}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${c.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>{c.active ? "Aktif" : "Off"}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#7F1D1D]">{discountText(c)}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">Sah {c.validity_days} hari · Dikeluar: {c.issued_count ?? 0} · Digunakan: {c.redeemed_count ?? 0}</p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button onClick={() => toggleActive(c)} className="text-xs font-semibold text-[#7F1D1D]">{c.active ? "Matikan" : "Hidupkan"}</button>
                  <button onClick={() => setForm(c)} className="text-xs font-semibold text-blue-600">Edit</button>
                  <button onClick={() => remove(c)} className="text-xs font-semibold text-red-500">Padam</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center p-0 sm:p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-gray-800 p-5">
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">{form.id ? "Edit Coupon" : "Coupon Baru"}</h2>
            <div className="grid grid-cols-2 gap-3">
              {!form.id && (
                <label className="col-span-2 text-xs font-semibold text-gray-600 dark:text-gray-300">Kod (unik)
                  <input className={input} value={form.code || ""} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} />
                </label>
              )}
              <label className="col-span-2 text-xs font-semibold text-gray-600 dark:text-gray-300">Nama
                <input className={input} value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Jenis diskaun
                <select className={input} value={form.discount_type} onChange={e => setForm({ ...form, discount_type: e.target.value })}>
                  <option value="percent">Peratus (%)</option>
                  <option value="fixed">Tetap (RM)</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Nilai
                <input type="number" min={0} step={0.5} className={input} value={form.discount_value ?? 0} onChange={e => setForm({ ...form, discount_value: Number(e.target.value) })} />
              </label>
              {form.discount_type === "percent" && (
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Maks diskaun (RM)
                  <input type="number" min={0} step={0.5} className={input} value={form.max_discount ?? 0} onChange={e => setForm({ ...form, max_discount: Number(e.target.value) })} />
                </label>
              )}
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Guna pada
                <select className={input} value={form.applies_to} onChange={e => setForm({ ...form, applies_to: e.target.value })}>
                  <option value="all">Semua produk</option>
                  <option value="category">Kategori terpilih</option>
                  <option value="product">Produk terpilih</option>
                </select>
              </label>
              {form.applies_to === "category" && (
                <label className="col-span-2 text-xs font-semibold text-gray-600 dark:text-gray-300">Category ID
                  <input className={input} value={form.category_id || ""} onChange={e => setForm({ ...form, category_id: e.target.value })} placeholder="UUID kategori" />
                </label>
              )}
              {form.applies_to === "product" && (
                <label className="col-span-2 text-xs font-semibold text-gray-600 dark:text-gray-300">Product ID
                  <input className={input} value={form.product_id || ""} onChange={e => setForm({ ...form, product_id: e.target.value })} placeholder="UUID produk" />
                </label>
              )}
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Min belanja guna (RM)
                <input type="number" min={0} step={0.5} className={input} value={form.min_spend ?? 0} onChange={e => setForm({ ...form, min_spend: Number(e.target.value) })} />
              </label>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Sah (hari)
                <input type="number" min={1} className={input} value={form.validity_days ?? 14} onChange={e => setForm({ ...form, validity_days: Number(e.target.value) })} />
              </label>
              <label className="col-span-2 text-xs font-semibold text-gray-600 dark:text-gray-300">Min belanja untuk dapat coupon (RM)
                <input type="number" min={0} step={0.5} className={input} value={form.issue_min_spend ?? 0} onChange={e => setForm({ ...form, issue_min_spend: Number(e.target.value) })} />
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
