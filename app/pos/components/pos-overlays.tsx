"use client";

import { useState } from "react";
import { usePos } from "../pos-context";
import { LOYALTY_REDEEM_MIN_POINTS, MarketingConsentMode } from "../types";

// ━━━━━━━━━━━━━━━ CUSTOMER OVERLAY ━━━━━━━━━━━━━━━
export function CustomerOverlay() {
  const s = usePos();
  return (
    <div className="screen-enter fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <button onClick={() => s.setOverlay("cart")} className="text-sm text-gray-500">← Kembali</button>
        <span className="text-sm font-semibold">Pelanggan</span>
        <button onClick={() => s.setOverlay("cart")} className="text-sm font-medium text-[#7F1D1D]">Simpan</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <input value={s.customerName} onChange={e => s.setCustomerName(e.target.value)} placeholder="Nama" className="w-full border-b border-gray-200 py-3 text-sm outline-none placeholder:text-gray-400 focus:border-[#7F1D1D]" />
        <div className="flex gap-2">
          <input value={s.customerPhone} onChange={e => { s.setCustomerPhone(e.target.value); s.setLinkedCustomerId(null); s.setMemberPoints(0); s.setMemberExpiringPoints(0); s.setRedeemPointsInput(""); s.setMemberLookupMessage(null); }} placeholder="Telefon" className="flex-1 border-b border-gray-200 py-3 text-sm outline-none placeholder:text-gray-400 focus:border-[#7F1D1D]" />
          <button onClick={() => void lookupMember(s)} disabled={s.memberLookupLoading} className="shrink-0 rounded-lg bg-[#7F1D1D] px-4 py-2 text-xs font-medium text-white disabled:opacity-50">{s.memberLookupLoading ? "..." : "Cari"}</button>
        </div>
        {s.memberLookupMessage && <div className={`rounded-lg px-3 py-2 text-xs ${s.memberLookupTone === "success" ? "bg-green-50 text-green-700" : s.memberLookupTone === "warn" ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-600"}`}>{s.memberLookupMessage}</div>}
        {s.linkedCustomerId && <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">{s.memberPoints} points{s.memberExpiringPoints > 0 && ` · ${s.memberExpiringPoints} tamat 30 hari`}</div>}
        <input value={s.customerEmail} onChange={e => s.setCustomerEmail(e.target.value)} placeholder="Email" className="w-full border-b border-gray-200 py-3 text-sm outline-none placeholder:text-gray-400 focus:border-[#7F1D1D]" />
        <div>
          <label className="mb-1 block text-xs text-gray-500">Marketing</label>
          <select value={s.getConsentMode()} onChange={e => s.setConsentMode(e.target.value as MarketingConsentMode)} className="w-full border-b border-gray-200 py-2.5 text-sm outline-none">
            <option value="none">Tiada</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="both">Semua</option>
          </select>
        </div>
        {s.linkedCustomerId && (
          <div>
            <label className="mb-1 block text-xs text-gray-500">Tebus Points ({s.memberPoints})</label>
            <input type="number" value={s.redeemPointsInput} onChange={e => s.setRedeemPointsInput(e.target.value)} placeholder={`Min ${LOYALTY_REDEEM_MIN_POINTS}`} className="w-full border-b border-gray-200 py-3 text-sm outline-none" />
            {s.redeemStatusMessage && <div className="mt-1 text-xs text-amber-600">{s.redeemStatusMessage}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

async function lookupMember(s: ReturnType<typeof usePos>) {
  const phone = s.customerPhone.trim();
  if (!phone) { s.setMemberLookupTone("warn"); s.setMemberLookupMessage("Masukkan nombor dulu"); return; }
  s.setMemberLookupLoading(true); s.setMemberLookupMessage(null);
  try {
    const res = await fetch(`/api/pos/customers/lookup?phone=${encodeURIComponent(phone)}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) { s.setMemberLookupTone("warn"); s.setMemberLookupMessage(data?.error || "Gagal cari"); return; }
    const c = data?.customer;
    if (!c) { s.setLinkedCustomerId(null); s.setMemberPoints(0); s.setMemberExpiringPoints(0); s.setMemberLookupTone("warn"); s.setMemberLookupMessage("Tiada ahli dijumpai."); return; }
    s.setLinkedCustomerId(c.id); s.setCustomerName(c.name || s.customerName); s.setCustomerPhone(c.phone || phone); s.setCustomerEmail(c.email || "");
    s.setConsentWhatsapp(Boolean(c.consent_whatsapp)); s.setConsentEmail(Boolean(c.consent_email));
    s.setMemberPoints(Number(c.loyalty_points || 0)); s.setMemberExpiringPoints(Number(c.expiring_points_30d || 0));
    s.setMemberLookupTone("success"); s.setMemberLookupMessage(`Ahli: ${c.total_orders ?? 0} order · RM${Number(c.total_spend || 0).toFixed(2)} · ${Number(c.loyalty_points || 0)} pts`);
  } finally { s.setMemberLookupLoading(false); }
}

// ━━━━━━━━━━━━━━━ PAYMENT OVERLAY (with Cash Calculator) ━━━━━━━━━━━━━━━
export function PaymentOverlay({ onCompletePayment }: { onCompletePayment: (method?: "cash" | "qr" | "card", cash?: number) => void }) {
  const s = usePos();
  const [showCashCalc, setShowCashCalc] = useState(false);
  const [cashInput, setCashInput] = useState("");

  const cashVal = Number(cashInput) || 0;
  const change = cashVal - s.total;
  const canPay = cashVal >= s.total;

  // Quick amount buttons — smart suggestions based on total
  const quickAmounts = getQuickAmounts(s.total);

  function handleQuickAmount(amount: number) {
    setCashInput(amount.toFixed(2));
  }

  function handleCashKeypad(key: string) {
    if (key === "⌫") {
      setCashInput(prev => prev.length <= 1 ? "" : prev.slice(0, -1));
    } else if (key === ".") {
      if (!cashInput.includes(".")) setCashInput(prev => (prev || "0") + ".");
    } else if (key === "C") {
      setCashInput("");
    } else {
      setCashInput(prev => prev + key);
    }
  }

  // Payment method selection screen
  if (!showCashCalc) {
    return (
      <div className="screen-enter fixed inset-0 z-50 flex flex-col bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => s.setOverlay("cart")} className="text-2xl text-gray-400">✕</button>
          <span />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="text-4xl font-bold tabular-nums text-gray-900">RM{s.total.toFixed(2)}</div>
          <div className="mt-2 text-sm text-gray-400">Pilih kaedah pembayaran</div>
        </div>
        <div className="border-t border-gray-200">
          <button disabled={s.submittingOrder} onClick={() => { setCashInput(""); setShowCashCalc(true); }} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left disabled:opacity-50">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-lg">💵</span>
              <span className="text-base font-medium text-gray-900">Cash</span>
            </div>
            <span className="text-gray-400">›</span>
          </button>
          <button disabled={s.submittingOrder} onClick={() => onCompletePayment("qr")} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left disabled:opacity-50">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-lg">📱</span>
              <span className="text-base font-medium text-gray-900">QR Payment</span>
            </div>
            <span className="text-gray-400">›</span>
          </button>
          <button disabled={s.submittingOrder} onClick={() => onCompletePayment("card")} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left disabled:opacity-50">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-lg">💳</span>
              <span className="text-base font-medium text-gray-900">Card</span>
            </div>
            <span className="text-gray-400">›</span>
          </button>
        </div>
        <div className="h-[env(safe-area-inset-bottom,12px)]" />
      </div>
    );
  }

  // ━━━ Cash Calculator Screen ━━━
  return (
    <div className="screen-enter fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <button onClick={() => setShowCashCalc(false)} className="text-sm text-gray-500">← Kembali</button>
        <span className="text-sm font-semibold text-gray-900">Bayaran Tunai</span>
        <span className="w-16" />
      </div>

      {/* Total due */}
      <div className="border-b border-gray-100 bg-gray-50/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Jumlah</span>
          <span className="text-lg font-bold tabular-nums text-gray-900">RM{s.total.toFixed(2)}</span>
        </div>
      </div>

      {/* Cash received display */}
      <div className="px-4 pt-5 pb-2 text-center">
        <div className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">Duit Diterima</div>
        <div className={`text-4xl font-bold tabular-nums ${cashInput ? "text-gray-900" : "text-gray-300"}`}>
          RM{cashInput || "0.00"}
        </div>
      </div>

      {/* Change preview */}
      <div className="px-4 pb-3 text-center">
        {cashVal > 0 && (
          <div className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold ${
            canPay ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
          }`}>
            {canPay ? (
              <>Baki: RM{change.toFixed(2)}</>
            ) : (
              <>Kurang: RM{Math.abs(change).toFixed(2)}</>
            )}
          </div>
        )}
      </div>

      {/* Quick amount buttons */}
      <div className="px-4 pb-3">
        <div className="flex gap-2 flex-wrap justify-center">
          {/* Exact amount button */}
          <button
            onClick={() => setCashInput(s.total.toFixed(2))}
            className="rounded-lg border-2 border-[#7F1D1D]/20 bg-[#7F1D1D]/5 px-4 py-2.5 text-sm font-semibold text-[#7F1D1D] active:bg-[#7F1D1D]/10 transition-colors"
          >
            Tepat RM{s.total.toFixed(2)}
          </button>
          {quickAmounts.map(amt => (
            <button
              key={amt}
              onClick={() => handleQuickAmount(amt)}
              className={`rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium transition-colors active:bg-gray-100 ${
                cashVal === amt ? "border-[#7F1D1D] bg-[#7F1D1D]/5 text-[#7F1D1D]" : "text-gray-700"
              }`}
            >
              RM{amt}
            </button>
          ))}
        </div>
      </div>

      {/* Keypad */}
      <div className="flex-1 px-6 pb-2">
        <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
          {["1","2","3","4","5","6","7","8","9",".","0","⌫"].map(k => (
            <button
              key={k}
              onClick={() => handleCashKeypad(k)}
              className={`flex h-12 items-center justify-center rounded-xl text-lg font-medium transition-colors active:scale-95 ${
                k === "⌫" ? "bg-gray-100 text-gray-500" : "bg-gray-50 text-gray-900 active:bg-gray-200"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {/* Action button */}
      <div className="border-t border-gray-200 px-4 py-4 pb-[env(safe-area-inset-bottom,12px)]">
        <button
          disabled={!canPay || s.submittingOrder}
          onClick={() => onCompletePayment("cash", cashVal)}
          className="w-full rounded-full bg-[#7F1D1D] py-4 text-base font-semibold text-white active:bg-[#6B1818] disabled:opacity-40 disabled:active:bg-[#7F1D1D] transition-opacity"
        >
          {s.submittingOrder ? "Memproses..." : canPay ? `Terima RM${cashVal.toFixed(2)} · Baki RM${change.toFixed(2)}` : "Masukkan jumlah"}
        </button>
      </div>
    </div>
  );
}

/** Generate smart quick amount suggestions based on the total */
function getQuickAmounts(total: number): number[] {
  const amounts: number[] = [];
  const notes = [1, 2, 5, 10, 20, 50, 100];

  for (const note of notes) {
    if (note >= total && note > total * 0.5) {
      amounts.push(note);
    }
  }

  // Also add nearest round-ups
  const roundUp5 = Math.ceil(total / 5) * 5;
  const roundUp10 = Math.ceil(total / 10) * 10;
  const roundUp50 = Math.ceil(total / 50) * 50;

  if (roundUp5 > total && !amounts.includes(roundUp5)) amounts.push(roundUp5);
  if (roundUp10 > total && !amounts.includes(roundUp10)) amounts.push(roundUp10);
  if (roundUp50 > total && roundUp50 <= 200 && !amounts.includes(roundUp50)) amounts.push(roundUp50);

  // Deduplicate, sort, limit to 5
  return [...new Set(amounts)].sort((a, b) => a - b).slice(0, 5);
}

// ━━━━━━━━━━━━━━━ DONE OVERLAY (now shows change for cash) ━━━━━━━━━━━━━━━
export function DoneOverlay({ onPrintReceipt, onPrintLabel, lastCashChange }: {
  onPrintReceipt: () => void;
  onPrintLabel: () => void;
  lastCashChange?: number;
}) {
  const s = usePos();
  if (!s.receiptData) return null;
  const isCash = s.receiptData.payment_method === "cash";
  const showChange = isCash && typeof lastCashChange === "number" && lastCashChange > 0;

  return (
    <div className="screen-enter fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <span />
        <button onClick={() => { s.setReceiptData(null); s.setOverlay("none"); }} className="text-sm font-medium text-[#7F1D1D]">Selesai</button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-4xl">✓</div>
        <div className="mt-5 text-2xl font-bold">RM{s.receiptData.total.toFixed(2)}</div>
        <div className="mt-1 text-sm text-gray-500">#{s.receiptData.receipt_number} · {s.receiptData.customerName}</div>

        {/* Cash change display — big and prominent */}
        {showChange && (
          <div className="mt-4 rounded-2xl bg-green-50 border border-green-200 px-8 py-4 text-center">
            <div className="text-xs font-medium uppercase tracking-wider text-green-600 mb-1">Baki Pelanggan</div>
            <div className="text-3xl font-bold tabular-nums text-green-700">RM{lastCashChange.toFixed(2)}</div>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button onClick={onPrintReceipt} className="rounded-full border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-700">Print Receipt</button>
          {s.receiptData.order_id && <button onClick={onPrintLabel} className="rounded-full border border-gray-200 px-6 py-2.5 text-sm font-medium text-[#7F1D1D]">Cup Label</button>}
          <button onClick={() => { s.setReceiptData(null); s.setOverlay("none"); }} className="rounded-full bg-[#7F1D1D] px-6 py-2.5 text-sm font-medium text-white">New Sale</button>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━ BOTTOM NAV ━━━━━━━━━━━━━━━
export function PosBottomNav() {
  const s = usePos();
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom,0px)]">
      {(["checkout", "orders", "reports", "more"] as const).map(tab => (
        <button key={tab} onClick={() => s.setMainTab(tab)} className={`flex flex-1 flex-col items-center gap-0.5 py-3 text-xs font-medium ${s.mainTab === tab ? "text-[#7F1D1D]" : "text-gray-400"}`}>
          {tab === "checkout" ? "Checkout" : tab === "orders" ? "Orders" : tab === "reports" ? "Reports" : "More"}
        </button>
      ))}
    </div>
  );
}
