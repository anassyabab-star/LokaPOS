"use client";

import { usePos } from "../pos-context";
import { sugarLabel, isKopiCategory } from "../types";

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
          const maxByAmt = Math.floor((s.totalAfterDiscount * s.loyaltyConfig.redeemMaxRatio) / s.loyaltyConfig.redeemRmPerPoint);
          const eligibleMax = Math.min(s.memberPoints, maxByAmt);
          const canRedeem = eligibleMax >= s.loyaltyConfig.redeemMinPoints;
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
        {/* B1F1 Kopi banner */}
        {(() => {
          if (!s.linkedCustomerId || s.memberB1f1Redeemed) return null;
          const eligibleItems = s.items.filter(item => {
            const product = s.products.find(p => p.id === item.product_id);
            return isKopiCategory(product?.category) && item.qty >= 2;
          }).sort((a, b) => a.price - b.price);
          const eligible = eligibleItems[0] || null;
          if (!eligible) return null;
          const applied = s.b1f1Applied;
          return (
            <div className={`flex items-center justify-between border-b px-4 py-2.5 ${applied ? "border-amber-200 bg-amber-50" : "border-orange-100 bg-orange-50"}`}>
              <div className="text-xs">
                {applied ? (
                  <span className="font-semibold text-amber-700">☕ B1F1 −RM{s.b1f1DiscountAmount.toFixed(2)}</span>
                ) : (
                  <span className="text-orange-700">☕ B1F1 tersedia — {eligible.name}</span>
                )}
              </div>
              {!applied ? (
                <button
                  onClick={() => { s.setB1f1Applied(true); s.setB1f1DiscountAmount(eligible.price); }}
                  className="rounded-full bg-orange-500 px-3 py-1 text-[11px] font-semibold text-white active:bg-orange-600"
                >
                  Guna B1F1
                </button>
              ) : (
                <button
                  onClick={() => { s.setB1f1Applied(false); s.setB1f1DiscountAmount(0); }}
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
          {/* Voucher — points redemption and mission rewards land here. */}
          <div className="mt-3 border-t border-gray-100 pt-3">
            {s.voucherApplied ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                <span className="min-w-0 text-xs font-medium text-green-800">
                  🎟 {s.voucherApplied.code} · {s.voucherApplied.note}
                </span>
                <button onClick={s.clearVoucher} className="shrink-0 text-xs font-semibold text-red-600">Buang</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={s.voucherCode}
                  onChange={e => s.setVoucherCode(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void s.applyVoucher(s.voucherCode); } }}
                  placeholder="Kod voucher / ganjaran"
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm uppercase outline-none focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20"
                />
                <button
                  onClick={() => void s.applyVoucher(s.voucherCode)}
                  disabled={s.voucherBusy || !s.voucherCode.trim()}
                  className="shrink-0 rounded-lg bg-[#7F1D1D] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {s.voucherBusy ? "…" : "Guna"}
                </button>
              </div>
            )}
            {s.voucherError && <div className="mt-1.5 text-xs font-medium text-red-600">{s.voucherError}</div>}
          </div>

          {s.discountAmount > 0 && <div className="mt-2 text-xs font-medium text-green-600">Diskaun: -RM{s.discountAmount.toFixed(2)}</div>}
          {s.voucherDiscount > 0 && <div className="mt-1 text-xs font-medium text-green-600">Voucher: -RM{s.voucherDiscount.toFixed(2)}</div>}
          {s.b1f1Applied && s.b1f1DiscountAmount > 0 && <div className="mt-1 text-xs font-medium text-amber-600">B1F1 Kopi: -RM{s.b1f1DiscountAmount.toFixed(2)}</div>}
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
