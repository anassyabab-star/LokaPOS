"use client";

import { usePos } from "../pos-context";
import { LOYALTY_REDEEM_MIN_POINTS, MarketingConsentMode } from "../types";

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
    s.setMemberLookupTone("success"); s.setMemberLookupMessage(`Ahli: ${c.total_orders} order · RM${c.total_spend.toFixed(2)} · ${Number(c.loyalty_points || 0)} pts`);
  } finally { s.setMemberLookupLoading(false); }
}

export function PaymentOverlay({ onCompletePayment }: { onCompletePayment: (method?: "cash" | "qr" | "card", cash?: number) => void }) {
  const s = usePos();
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
        <button disabled={s.submittingOrder} onClick={() => onCompletePayment("cash", s.total)} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left disabled:opacity-50">
          <span className="text-base font-medium text-gray-900">{s.submittingOrder ? "Memproses..." : "Cash"}</span><span className="text-gray-400">›</span>
        </button>
        <button disabled={s.submittingOrder} onClick={() => onCompletePayment("qr")} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left disabled:opacity-50">
          <span className="text-base font-medium text-gray-900">QR Payment</span><span className="text-gray-400">›</span>
        </button>
        <button disabled={s.submittingOrder} onClick={() => onCompletePayment("card")} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left disabled:opacity-50">
          <span className="text-base font-medium text-gray-900">Record Card Payment</span><span className="text-gray-400">›</span>
        </button>
      </div>
      <div className="h-[env(safe-area-inset-bottom,12px)]" />
    </div>
  );
}

export function DoneOverlay({ onPrintReceipt, onPrintLabel }: { onPrintReceipt: () => void; onPrintLabel: () => void }) {
  const s = usePos();
  if (!s.receiptData) return null;
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
        <div className="mt-6 flex gap-3">
          <button onClick={onPrintReceipt} className="rounded-full border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-700">Print Receipt</button>
          {s.receiptData.order_id && <button onClick={onPrintLabel} className="rounded-full border border-gray-200 px-6 py-2.5 text-sm font-medium text-[#7F1D1D]">Cup Label</button>}
          <button onClick={() => { s.setReceiptData(null); s.setOverlay("none"); }} className="rounded-full bg-[#7F1D1D] px-6 py-2.5 text-sm font-medium text-white">New Sale</button>
        </div>
      </div>
    </div>
  );
}

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
