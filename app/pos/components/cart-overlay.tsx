"use client";

import { usePos } from "../pos-context";
import { sugarLabel, LOYALTY_REDEEM_MIN_POINTS, LOYALTY_REDEEM_MAX_RATIO, LOYALTY_REDEEM_RM_PER_POINT } from "../types";

export default function CartOverlay() {
  const s = usePos();

  return (
    <div className="animate-slide-up fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <button onClick={() => s.setOverlay("none")} className="text-xl text-gray-500">✕</button>
        <span className="text-sm font-semibold text-gray-900">Current sale ({s.totalQty})</span>
        <button onClick={() => { s.clearCart(); s.setOverlay("none"); }} className="text-xs font-medium text-[#7F1D1D]">Clear all</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <button onClick={() => s.setOverlay("customer")} className="flex w-full items-center gap-3 border-b border-gray-200 px-4 py-3.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7F1D1D]/10 text-xs font-bold text-[#7F1D1D]">C</div>
          <span className="flex-1 text-left text-sm text-gray-700">{s.linkedCustomerId ? s.customerName || "Customer linked" : "Add a customer"}</span>
          <span className="text-gray-400">›</span>
        </button>

        {/* Points quick-action banner */}
        {(() => {
          if (!s.linkedCustomerId || s.memberPoints <= 0) return null;
          const maxByAmt = Math.floor((s.totalAfterDiscount * LOYALTY_REDEEM_MAX_RATIO) / LOYALTY_REDEEM_RM_PER_POINT);
          const eligibleMax = Math.min(s.memberPoints, maxByAmt);
          const canRedeem = eligibleMax >= LOYALTY_REDEEM_MIN_POINTS;
          const applied = s.appliedRedeemPoints > 0;
          return (
            <div className={`flex items-center justify-between border-b px-4 py-2.5 ${applied ? "border-green-200 bg-green-50" : "border-blue-100 bg-blue-50"}`}>
              <div className="text-xs">
                {applied ? (
                  <span className="font-semibold text-green-700">✓ -{s.appliedRedeemPoints} pts (−RM{s.redeemAmount.toFixed(2)})</span>
                ) : (
                  <span className="text-blue-700">🏆 {s.memberPoints} pts tersedia</span>
                )}
              </div>
              {canRedeem && !applied && (
                <button
                  onClick={() => s.setRedeemPointsInput(String(eligibleMax))}
                  className="rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white active:bg-blue-700"
                >
                  Guna Points
                </button>
              )}
              {applied && (
                <button
                  onClick={() => s.setRedeemPointsInput("")}
                  className="rounded-full bg-gray-200 px-3 py-1 text-[11px] font-semibold text-gray-600 active:bg-gray-300"
                >
                  Batalkan
                </button>
              )}
            </div>
          );
        })()}
        <div className="px-4">
          {s.items.map(item => (
            <div key={item.id} className="flex items-center gap-2 border-b border-gray-200 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-900">{item.name}</div>
                {s.customNotes[item.id] && <div className="text-[11px] text-[#7F1D1D]">Nota: {s.customNotes[item.id]}</div>}
                {item.supports_sugar && <div className="text-[11px] text-gray-400">{sugarLabel(item.sugar_level)}</div>}
                {item.addon_names?.length > 0 && <div className="text-[11px] text-gray-400">+ {item.addon_names.join(", ")}</div>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => s.removeFromCart(item.id)} className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-500 text-sm font-bold active:bg-gray-100">−</button>
                <span className="w-6 text-center text-sm font-semibold tabular-nums text-gray-900">{item.qty}</span>
                <button onClick={() => s.addToCart(item.product_id, item.variant_id || undefined, item.addon_ids.length ? item.addon_ids : undefined, item.sugar_level, undefined, true)} className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-500 text-sm font-bold active:bg-gray-100">+</button>
              </div>
              <span className="text-sm tabular-nums text-gray-900 shrink-0 w-20 text-right">RM{(item.price * item.qty).toFixed(2)}</span>
              <button onClick={() => s.deleteFromCart(item.id)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500 transition-colors hover:bg-red-100 active:bg-red-200" aria-label="Delete item">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              </button>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-b border-gray-100">
          <button onClick={() => s.setShowDiscountPanel(!s.showDiscountPanel)} className="text-sm font-medium text-[#7F1D1D]">
            {s.showDiscountPanel ? "▾ Tutup diskaun" : "＋ Tambah diskaun"}
          </button>
          {s.showDiscountPanel && (
            <div className="mt-3 space-y-2">
              <div className="flex gap-2">
                {(["none", "percent", "fixed"] as const).map(dt => (
                  <button key={dt} onClick={() => { s.setDiscountType(dt); if (dt === "none") s.setDiscountValue(""); }} className={`rounded-full px-4 py-2 text-xs font-medium transition-colors ${s.discountType === dt ? "bg-[#7F1D1D] text-white" : "bg-gray-100 text-gray-600"}`}>
                    {dt === "none" ? "Tiada" : dt === "percent" ? "% Peratus" : "RM Tetap"}
                  </button>
                ))}
              </div>
              {s.discountType !== "none" && (
                <input
                  type="number"
                  min="0"
                  max={s.discountType === "percent" ? 100 : s.subtotal}
                  value={s.discountValue}
                  onChange={e => {
                    const raw = e.target.value;
                    const num = parseFloat(raw);
                    if (raw === "" || raw === ".") { s.setDiscountValue(raw); return; }
                    if (isNaN(num) || num < 0) { s.setDiscountValue("0"); return; }
                    if (s.discountType === "percent" && num > 100) { s.setDiscountValue("100"); return; }
                    if (s.discountType === "fixed" && num > s.subtotal) { s.setDiscountValue(s.subtotal.toFixed(2)); return; }
                    s.setDiscountValue(raw);
                  }}
                  placeholder={s.discountType === "percent" ? "Masukkan % (cth: 10)" : "Masukkan RM (cth: 5.00)"}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20"
                />
              )}
            </div>
          )}
          {s.discountAmount > 0 && <div className="mt-2 text-xs font-medium text-green-600">Diskaun: -RM{s.discountAmount.toFixed(2)}</div>}
        </div>
      </div>
      <div className="border-t border-gray-200 px-4 py-4 pb-[env(safe-area-inset-bottom,12px)]">
        <button onClick={() => s.setOverlay("payment")} className="w-full rounded-full bg-[#7F1D1D] py-4 text-base font-semibold text-white active:bg-[#6B1818]">
          Charge RM{s.total.toFixed(2)}
        </button>
      </div>
    </div>
  );
}
