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
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="sr-only">Settings</h1>
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

      <KdsSettingsSection />

      <TablesSettingsSection />

      <LoyaltySettingsSection />
    </div>
  );
}

// ━━━ Meja & QR — tables the customer QR flow recognises + unpaid-order expiry ━━━
function parseTableInput(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[,\s]+/)) {
    const token = part.trim();
    if (!token) continue;
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a && b - a <= 200) {
        for (let i = a; i <= b; i++) out.push(String(i));
        continue;
      }
    }
    out.push(token.replace(/[^\w-]/g, "").slice(0, 10));
  }
  return out.filter(Boolean);
}

function TablesSettingsSection() {
  const [tables, setTables] = useState<string[]>([]);
  const [expiry, setExpiry] = useState<number>(30);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d?.dine_in_tables)) setTables(d.dine_in_tables.map((t: unknown) => String(t)));
        if (Number.isFinite(Number(d?.unpaid_order_expiry_minutes))) setExpiry(Number(d.unpaid_order_expiry_minutes));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function addTables() {
    const next = parseTableInput(input);
    if (next.length === 0) return;
    setTables(prev => Array.from(new Set([...prev, ...next])));
    setInput("");
    setDirty(true);
  }

  function removeTable(t: string) {
    setTables(prev => prev.filter(x => x !== t));
    setDirty(true);
  }

  async function save() {
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dine_in_tables: tables, unpaid_order_expiry_minutes: expiry }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        const msg = String(d?.error || "");
        setError(
          /column|schema|dine_in_tables|unpaid_order/i.test(msg)
            ? "Perlu jalankan migration 20260915_order_flow_pay_at_counter.sql dahulu"
            : msg || "Gagal simpan"
        );
        return;
      }
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Tiada sambungan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Meja &amp; QR Order</h2>
          <p className="text-sm text-gray-500 mt-0.5">Senarai meja untuk QR dine-in, dan tempoh order belum bayar sebelum dibatalkan automatik.</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm font-medium text-green-600">Tersimpan</span>}
          <a
            href="/print/table-qr"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            🖨 Cetak QR Meja
          </a>
          <button onClick={save} disabled={saving || loading || !dirty} className="rounded-xl bg-[#7F1D1D] px-5 py-2 text-sm font-bold text-white disabled:opacity-40 hover:bg-[#6B1818] transition-colors">
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-5 space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Nombor meja</label>
          <p className="text-xs text-gray-400 mb-2">Setiap meja dapat QR sendiri (/t/&lt;meja&gt;). Terima julat seperti <code>1-12</code> atau senarai <code>A1, A2, B1</code>.</p>
          {loading ? (
            <div className="h-9 w-64 rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {tables.length === 0 && <span className="text-xs text-gray-400">Tiada meja — QR dine-in akan terima mana-mana nombor.</span>}
              {tables.map(t => (
                <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                  🪑 {t}
                  <button onClick={() => removeTable(t)} className="text-amber-500 hover:text-red-500" aria-label={`Buang meja ${t}`}>×</button>
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTables(); } }}
              placeholder="cth. 1-12 atau A1, A2"
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20 dark:text-white"
            />
            <button onClick={addTables} className="rounded-xl bg-gray-900 dark:bg-gray-700 px-4 py-2 text-sm font-bold text-white">Tambah meja</button>
          </div>
        </div>

        <div className="max-w-xs">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Batal automatik order belum bayar (minit)</label>
          <p className="text-xs text-gray-400 mb-1">Order QR yang tak dibayar di kaunter selepas tempoh ini dibatalkan &amp; stok dipulangkan. 0 = tak batal.</p>
          <input
            type="number"
            min={0}
            max={1440}
            value={expiry}
            onChange={e => { setExpiry(Math.max(0, Math.floor(Number(e.target.value) || 0))); setDirty(true); }}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20 dark:text-white"
          />
        </div>
      </div>
      {error && <p className="text-xs text-amber-600 px-1">{error}</p>}
      <p className="text-xs text-gray-400 px-1">Aliran: customer scan QR meja → order → bayar di kaunter (Order ID) → cashier key in meja/buzzer → Kitchen Display.</p>
    </section>
  );
}

function KdsSettingsSection() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then(r => r.json())
      .then(d => setEnabled(d?.kds_enabled === true))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggleKds() {
    const next = !enabled;
    setEnabled(next);
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kds_enabled: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setEnabled(!next); // revert
        const msg = String(d?.error || "");
        setError(
          /column|schema|kds_enabled/i.test(msg)
            ? "Perlu jalankan migration 20260616_kds_toggle.sql dahulu"
            : msg || "Gagal simpan"
        );
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setEnabled(!next);
      setError("Tiada sambungan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Kitchen Display (KDS)</h2>
          <p className="text-sm text-gray-500 mt-0.5">Aliran dapur — order lalu queue pending → preparing → ready</p>
        </div>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="20 6 9 17 4 12"/></svg>
            Tersimpan
          </span>
        )}
      </div>
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-4">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-base transition-colors ${enabled ? "bg-[#7F1D1D]/10" : "bg-gray-100 dark:bg-gray-700 grayscale"}`}>🍳</div>
            <div>
              <p className={`text-sm font-semibold transition-colors ${enabled ? "text-gray-900 dark:text-white" : "text-gray-400"}`}>Guna Kitchen Display</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {enabled
                  ? "Order lalu aliran dapur — staff advance di skrin KDS."
                  : "Dimatikan — order terus jadi 'completed' selepas dibayar."}
              </p>
            </div>
          </div>
          {loading ? (
            <div className="h-6 w-11 rounded-full bg-gray-100 dark:bg-gray-700 animate-pulse" />
          ) : (
            <Toggle enabled={enabled} onToggle={() => { if (!saving) void toggleKds(); }} />
          )}
        </div>
      </div>
      {error && <p className="text-xs text-amber-600 px-1">{error}</p>}
    </section>
  );
}

type LoyaltyConfigForm = {
  earnPerRM: number;
  redeemRmPerPoint: number;
  redeemMinPoints: number;
  redeemMaxRatio: number;
  expiryDays: number;
  expiringSoonDays: number;
  checkInPoints: number;
  referralPoints: number;
  birthdayPoints: number;
  voucherExpiryDays: number;
  otpExpiryMinutes: number;
  reviewPoints: number;
  reviewRewardAmount: number;
  missionsEnabled: boolean;
  couponsEnabled: boolean;
  mutualExclusivityEnabled: boolean;
  reviewRequired: boolean;
  membershipTiers?: unknown;
  voucherTiers?: unknown;
};

const LOYALTY_FIELDS: Array<{ key: keyof LoyaltyConfigForm; label: string; desc: string; step?: number }> = [
  { key: "earnPerRM", label: "Earn / RM", desc: "Points dikumpul untuk setiap RM1 dibelanja", step: 0.1 },
  { key: "redeemRmPerPoint", label: "RM / Point", desc: "Nilai RM bagi setiap point ditebus", step: 0.01 },
  { key: "redeemMinPoints", label: "Min Tebus (pts)", desc: "Minimum points untuk satu tebusan" },
  { key: "redeemMaxRatio", label: "Cap Tebus (%)", desc: "Maksimum % daripada jumlah order", step: 1 },
  { key: "expiryDays", label: "Luput (hari)", desc: "Tempoh points sah sebelum luput" },
  { key: "checkInPoints", label: "Check-in (pts)", desc: "Points setiap check-in harian" },
  { key: "referralPoints", label: "Referral (pts)", desc: "Points untuk kedua-dua pihak rujukan" },
  { key: "birthdayPoints", label: "Harijadi (pts)", desc: "Points bonus harijadi setahun sekali" },
  { key: "voucherExpiryDays", label: "Voucher Luput (hari)", desc: "Tempoh voucher boleh ditebus" },
  { key: "otpExpiryMinutes", label: "OTP Luput (minit)", desc: "Tempoh kod OTP sah" },
  { key: "reviewPoints", label: "Review (pts)", desc: "Points diberi bila customer beri review" },
  { key: "reviewRewardAmount", label: "Review Voucher (RM)", desc: "Nilai voucher dibuka selepas review (0 = tiada)", step: 0.5 },
];

const LOYALTY_TOGGLES: Array<{ key: keyof LoyaltyConfigForm; label: string; desc: string }> = [
  { key: "missionsEnabled", label: "Mission", desc: "Cabaran kumpul (beli X kali → reward)" },
  { key: "couponsEnabled", label: "Coupon", desc: "Auto-keluar coupon diskaun selepas beli" },
  { key: "mutualExclusivityEnabled", label: "Coupon ≠ Mission", desc: "Guna coupon → order tak dikira mission" },
  { key: "reviewRequired", label: "Review wajib", desc: "Customer kena review sebelum voucher dibuka" },
];

function LoyaltySettingsSection() {
  const [cfg, setCfg] = useState<LoyaltyConfigForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/public/store-status", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        const lc = d?.loyalty_config || {};
        setCfg({
          earnPerRM: Number(lc.earnPerRM ?? 1),
          redeemRmPerPoint: Number(lc.redeemRmPerPoint ?? 0.05),
          redeemMinPoints: Number(lc.redeemMinPoints ?? 100),
          // stored as ratio (0–1) but edited as percent
          redeemMaxRatio: Math.round(Number(lc.redeemMaxRatio ?? 0.3) * 100),
          expiryDays: Number(lc.expiryDays ?? 365),
          expiringSoonDays: Number(lc.expiringSoonDays ?? 30),
          checkInPoints: Number(lc.checkInPoints ?? 1),
          referralPoints: Number(lc.referralPoints ?? 50),
          birthdayPoints: Number(lc.birthdayPoints ?? 50),
          voucherExpiryDays: Number(lc.voucherExpiryDays ?? 30),
          otpExpiryMinutes: Number(lc.otpExpiryMinutes ?? 5),
          reviewPoints: Number(lc.reviewPoints ?? 0),
          reviewRewardAmount: Number(lc.reviewRewardAmount ?? 0),
          missionsEnabled: lc.missionsEnabled !== false,
          couponsEnabled: lc.couponsEnabled === true,
          mutualExclusivityEnabled: lc.mutualExclusivityEnabled !== false,
          reviewRequired: lc.reviewRequired !== false,
          membershipTiers: lc.membershipTiers,
          voucherTiers: lc.voucherTiers,
        });
        setLoading(false);
      })
      .catch(() => { setError("Gagal muatkan tetapan loyalty"); setLoading(false); });
  }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      const payload = {
        ...cfg,
        redeemMaxRatio: Math.min(1, Math.max(0, cfg.redeemMaxRatio / 100)),
      };
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loyalty_config: payload }),
      });
      if (!res.ok) throw new Error("Gagal simpan");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ralat");
    } finally { setSaving(false); }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Loyalty</h2>
          <p className="text-sm text-gray-500 mt-0.5">Ekonomi points — POS &amp; app pelanggan ikut nilai ini terus.</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm font-medium text-green-600">Tersimpan</span>}
          {error && <span className="text-sm text-red-500">{error}</span>}
          <button onClick={save} disabled={saving || loading} className="rounded-xl bg-[#7F1D1D] px-5 py-2 text-sm font-bold text-white disabled:opacity-40 hover:bg-[#6B1818] transition-colors">
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-5">
        {loading || !cfg ? (
          <p className="text-sm text-gray-400">Memuatkan...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {LOYALTY_FIELDS.map(field => (
              <div key={String(field.key)}>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">{field.label}</label>
                <p className="text-xs text-gray-400 mb-1">{field.desc}</p>
                <input
                  type="number"
                  step={field.step || 1}
                  min={0}
                  value={Number(cfg[field.key] as number)}
                  onChange={e =>
                    setCfg(prev => (prev ? { ...prev, [field.key]: Number(e.target.value) } : prev))
                  }
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20 dark:text-white"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {cfg && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-5 space-y-4">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Ciri Smart Loyalty</p>
          {LOYALTY_TOGGLES.map(t => {
            const on = Boolean(cfg[t.key]);
            return (
              <div key={String(t.key)} className="flex items-center justify-between">
                <div>
                  <p className={`text-sm font-semibold ${on ? "text-gray-900 dark:text-white" : "text-gray-400"}`}>{t.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t.desc}</p>
                </div>
                <Toggle enabled={on} onToggle={() => setCfg(prev => (prev ? { ...prev, [t.key]: !prev[t.key] } : prev))} />
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 px-1">Tier keahlian &amp; tier voucher dikekalkan automatik. Tekan Simpan untuk terpakai serta-merta.</p>
    </section>
  );
}
