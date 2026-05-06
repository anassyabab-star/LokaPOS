"use client";
import { useEffect, useState } from "react";

type PaymentMethods = Record<string, boolean>;
type Settings = { payment_methods: PaymentMethods };

const PRESET_OPTIONS = [
  {
    key: "fpx",
    label: "Online Banking (FPX)",
    desc: "Bayar melalui internet banking — CHIP gateway",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
      </svg>
    ),
  },
  {
    key: "cash",
    label: "Cash — Pay at Counter",
    desc: "Pelanggan bayar tunai semasa ambil order",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>
      </svg>
    ),
  },
  {
    key: "card",
    label: "Card / E-Wallet",
    desc: "Kredit, debit, atau e-wallet via CHIP",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
      </svg>
    ),
  },
];

const PRESET_KEYS = new Set(PRESET_OPTIONS.map(o => o.key));

const CustomIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
);

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${enabled ? "bg-[#7F1D1D]" : "bg-gray-200 dark:bg-gray-600"}`}>
      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${enabled ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newMethod, setNewMethod] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then(r => r.json())
      .then(d => { setSettings(d); setLoading(false); })
      .catch(() => { setError("Gagal muatkan tetapan"); setLoading(false); });
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_methods: settings.payment_methods }),
      });
      if (!res.ok) throw new Error("Gagal simpan");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ralat");
    } finally { setSaving(false); }
  }

  function toggle(key: string) {
    setSettings(prev => {
      if (!prev) return prev;
      const updated = { ...prev.payment_methods, [key]: !prev.payment_methods[key] };
      if (!Object.values(updated).some(Boolean)) return prev;
      return { ...prev, payment_methods: updated };
    });
  }

  function addMethod() {
    const key = newMethod.trim().toLowerCase().replace(/\s+/g, "_");
    if (!key || !settings) return;
    if (settings.payment_methods[key] !== undefined) { setNewMethod(""); setAdding(false); return; }
    setSettings(prev => prev ? { ...prev, payment_methods: { ...prev.payment_methods, [key]: true } } : prev);
    setNewMethod(""); setAdding(false);
  }

  function removeMethod(key: string) {
    setSettings(prev => {
      if (!prev) return prev;
      const updated = { ...prev.payment_methods };
      delete updated[key];
      if (!Object.values(updated).some(Boolean)) return prev;
      return { ...prev, payment_methods: updated };
    });
  }

  const customKeys = settings ? Object.keys(settings.payment_methods).filter(k => !PRESET_KEYS.has(k)) : [];
  const enabledCount = settings ? Object.values(settings.payment_methods).filter(Boolean).length : 0;

  return (
    <div className="p-6 max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Konfigurasi operasi dan pengalaman pelanggan</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Kaedah Bayaran</h2>
            <p className="text-sm text-gray-500 mt-0.5">{loading ? "Memuatkan..." : `${enabledCount} kaedah aktif`}</p>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="20 6 9 17 4 12"/></svg>
                Tersimpan
              </span>
            )}
            {error && <span className="text-sm text-red-500">{error}</span>}
            <button onClick={save} disabled={saving || loading} className="rounded-xl bg-[#7F1D1D] px-5 py-2 text-sm font-bold text-white disabled:opacity-40 hover:bg-[#6B1818] transition-colors">
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
          {loading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-4 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="h-9 w-9 rounded-xl bg-gray-100 dark:bg-gray-700" />
                  <div className="space-y-2">
                    <div className="h-3.5 w-36 rounded bg-gray-100 dark:bg-gray-700" />
                    <div className="h-2.5 w-52 rounded bg-gray-50 dark:bg-gray-700" />
                  </div>
                </div>
                <div className="h-6 w-11 rounded-full bg-gray-100 dark:bg-gray-700" />
              </div>
            ))
          ) : (
            <>
              {PRESET_OPTIONS.map(opt => {
                const enabled = settings?.payment_methods[opt.key] ?? false;
                return (
                  <div key={opt.key} className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-4">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${enabled ? "bg-[#7F1D1D]/10 text-[#7F1D1D]" : "bg-gray-100 dark:bg-gray-700 text-gray-400"}`}>
                        {opt.icon}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold transition-colors ${enabled ? "text-gray-900 dark:text-white" : "text-gray-400"}`}>{opt.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                      </div>
                    </div>
                    <Toggle enabled={enabled} onToggle={() => toggle(opt.key)} />
                  </div>
                );
              })}

              {customKeys.map(key => {
                const enabled = settings?.payment_methods[key] ?? false;
                return (
                  <div key={key} className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-4">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${enabled ? "bg-[#7F1D1D]/10 text-[#7F1D1D]" : "bg-gray-100 dark:bg-gray-700 text-gray-400"}`}>
                        <CustomIcon />
                      </div>
                      <div>
                        <p className={`text-sm font-semibold capitalize transition-colors ${enabled ? "text-gray-900 dark:text-white" : "text-gray-400"}`}>{key.replace(/_/g, " ")}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Kaedah custom</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Toggle enabled={enabled} onToggle={() => toggle(key)} />
                      <button onClick={() => removeMethod(key)} className="text-gray-300 hover:text-red-400 transition-colors">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  </div>
                );
              })}

              {adding ? (
                <div className="flex items-center gap-3 px-5 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-400 shrink-0">
                    <CustomIcon />
                  </div>
                  <input
                    autoFocus
                    value={newMethod}
                    onChange={e => setNewMethod(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addMethod(); if (e.key === "Escape") { setAdding(false); setNewMethod(""); } }}
                    placeholder="Nama kaedah (cth: DuitNow)"
                    className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-[#7F1D1D] dark:text-white"
                  />
                  <button onClick={addMethod} className="rounded-xl bg-[#7F1D1D] px-4 py-2 text-xs font-bold text-white">Tambah</button>
                  <button onClick={() => { setAdding(false); setNewMethod(""); }} className="text-sm text-gray-400 hover:text-gray-600">Batal</button>
                </div>
              ) : (
                <button onClick={() => setAdding(true)} className="flex w-full items-center gap-3 px-5 py-3.5 text-sm font-semibold text-[#7F1D1D] hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                  Tambah kaedah bayaran
                </button>
              )}
            </>
          )}
        </div>
        <p className="text-xs text-gray-400 px-1">Sekurang-kurangnya satu kaedah mesti aktif. Tekan Simpan untuk save perubahan.</p>
      </section>
    </div>
  );
}
