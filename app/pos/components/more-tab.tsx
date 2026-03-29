"use client";

import { usePos } from "../pos-context";

export default function MoreTab() {
  const s = usePos();

  return (
    <div className="flex-1 overflow-y-auto pb-20">
      <div className="px-4 pb-2 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">More</h1>
        <p className="text-sm text-gray-500">Loka POS v2.1</p>
      </div>
      <div className="mx-4 my-3 rounded-xl bg-[#7F1D1D]/5 border border-[#7F1D1D]/10 px-4 py-3">
        <div className="text-xs text-gray-500">Shift</div>
        <div className="text-sm font-medium">{s.currentShift ? `Aktif · RM${s.expectedCashLive.toFixed(2)} tunai` : "Tutup"}</div>
      </div>
      <button onClick={() => s.setOverlay("products")} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left text-sm font-medium text-gray-900">Products / Items <span className="text-gray-400">›</span></button>
      <button onClick={() => s.setShowQrScanner(true)} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left text-sm font-medium text-gray-900">
        <span className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#7F1D1D]/10">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7F1D1D" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="3" height="3" /><path d="M21 14h-3v3h3M21 21h-3m3 0v-3" /></svg>
          </span>
          Scan QR
        </span>
        <span className="text-gray-400">›</span>
      </button>
      {s.currentShift ? (
        <>
          <button onClick={() => s.setShowPaidOutModal(true)} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left text-sm font-medium text-gray-900">Paid Out <span className="text-gray-400">›</span></button>
          <button onClick={() => { s.setCountedCash(s.expectedCashLive.toFixed(2)); s.setShowCloseShiftModal(true); }} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left text-sm font-medium text-gray-900">Tutup Shift <span className="text-gray-400">›</span></button>
        </>
      ) : (
        <button onClick={() => s.setShowOpenShiftModal(true)} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left text-sm font-medium text-gray-900">Buka Shift <span className="text-gray-400">›</span></button>
      )}
      <a href="/dashboard" className="flex items-center justify-between border-b border-gray-200 px-4 py-4 text-sm font-medium text-gray-400">Admin Panel <span>›</span></a>
      <div className="mx-4 my-3 rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Print Settings</div>
        <label className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Auto Print Receipt</span>
          <input type="checkbox" checked={s.autoPrintEnabled} onChange={e => s.setAutoPrintEnabled(e.target.checked)} className="h-4 w-4 accent-[#7F1D1D]" />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Auto Print Cup Label</span>
          <input type="checkbox" checked={s.autoPrintLabel} onChange={e => s.setAutoPrintLabel(e.target.checked)} className="h-4 w-4 accent-[#7F1D1D]" />
        </label>
        <div className="text-[11px] text-gray-400">Label auto-print buka popup untuk setiap item. Guna sticker 50×30mm.</div>
      </div>
      <button onClick={() => s.setShowSignOutConfirm(true)} className="px-4 py-4 text-left text-sm font-medium text-[#7F1D1D]">Sign out</button>
    </div>
  );
}
