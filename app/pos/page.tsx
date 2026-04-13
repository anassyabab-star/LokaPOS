"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { buildReceiptHtml } from "@/lib/receipt-print";
import {
  ModalShell, ModalTitle, ModalSubtitle, ModalActions,
  ModalBtnPrimary, ModalBtnSecondary, ModalInput, ModalTextArea, InfoCard,
} from "./components/modal-primitives";
import dynamic from "next/dynamic";
const QrScanner = dynamic(() => import("./components/qr-scanner"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black">
      <div className="text-sm text-white/60">Membuka scanner...</div>
    </div>
  ),
});
import { useState } from "react";
import { ReceiptData, SUGAR_LEVEL_OPTIONS, sugarLabel } from "./types";
import { PosErrorBoundary } from "./components/pos-error-boundary";
import { usePosState } from "./hooks/use-pos-state";
import { PosProvider, usePos, REGISTER_ID } from "./pos-context";
import CheckoutTab from "./components/checkout-tab";
import OrdersTab from "./components/orders-tab";
import ReportsTab from "./components/reports-tab";
import MoreTab from "./components/more-tab";
import CartOverlay from "./components/cart-overlay";
import { CustomerOverlay, PaymentOverlay, DoneOverlay, PosBottomNav } from "./components/pos-overlays";
import ProductsOverlay from "./components/products-overlay";

function POSPageInner() {
  const searchParams = useSearchParams();
  const scannedOrderId = searchParams.get("order");
  const s = usePos();
  const [lastCashChange, setLastCashChange] = useState<number>(0);

  // ━━━ Init ━━━
  useEffect(() => { fetch("/api/products").then(r => r.json()).then(d => s.setProducts(Array.isArray(d) ? d : [])).catch(() => s.setProducts([])); void s.refreshShiftState(); }, [s.refreshShiftState]);
  useEffect(() => { if (!s.currentShift) { s.setRecentPaidOuts([]); return; } void s.loadPaidOuts(); }, [s.currentShift]);
  useEffect(() => { if (s.mainTab === "orders") void s.loadOrders(); }, [s.mainTab]);
  useEffect(() => { if (s.mainTab === "reports") void s.loadReport(s.reportRange); }, [s.mainTab, s.reportRange]);

  // ━━━ QR Scan ━━━
  useEffect(() => { if (!scannedOrderId) return; s.setMainTab("orders"); s.setOverlay("none"); void s.loadOrders(); void s.loadOrderDetail(scannedOrderId); window.history.replaceState({}, "", "/pos"); }, [scannedOrderId]);
  function handleQrScan(orderId: string) { s.setShowQrScanner(false); s.setMainTab("orders"); s.setOverlay("none"); void s.loadOrders(); void s.loadOrderDetail(orderId); }

  // ━━━ Polling ━━━
  useEffect(() => {
    const interval = setInterval(async () => {
      try { const res = await fetch("/api/orders?limit=1&today=1", { cache: "no-store" }); const data = await res.json(); const n = data?.orders?.length || 0;
        if (s.lastOrderCount.current > 0 && n > s.lastOrderCount.current) { s.setAddedToast("Order baru masuk!"); s.playBeep(); s.playBeep(); if (s.mainTab === "orders") void s.loadOrders(); }
        s.lastOrderCount.current = n;
      } catch {}
    }, 15000);
    fetch("/api/orders?limit=1&today=1", { cache: "no-store" }).then(r => r.json()).then(d => { s.lastOrderCount.current = d?.orders?.length || 0; }).catch(() => {});
    return () => clearInterval(interval);
  }, [s.mainTab]);

  // ━━━ Actions ━━━
  async function openShift() { const val = Number(s.openingCash || 0); if (!Number.isFinite(val) || val < 0) { alert("Opening cash tak valid"); return; } s.setShiftSubmitting(true); s.setShiftError(null); try { const res = await fetch("/api/pos/shift", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open", register_id: REGISTER_ID, opening_cash: val, opening_note: s.openingNote }) }); const data = await res.json(); if (!res.ok) { s.setShiftError(data?.error || "Gagal buka shift"); return; } s.setCurrentShift(data.shift || null); s.setCashSalesLive(Number(data.cash_sales || 0)); s.setPaidOutTotalLive(Number(data.paid_out_total || 0)); s.setExpectedCashLive(Number(data.expected_cash_live || 0)); s.setOpeningCash(""); s.setOpeningNote(""); s.setRecentPaidOuts([]); s.setShowOpenShiftModal(false); } finally { s.setShiftSubmitting(false); } }
  async function closeShift() { if (s.items.length > 0) { alert("Kosongkan cart dulu."); return; } const val = Number(s.countedCash || 0); if (!Number.isFinite(val) || val < 0) { alert("Counted cash tak valid"); return; } s.setShiftSubmitting(true); s.setShiftError(null); try { const res = await fetch("/api/pos/shift", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "close", register_id: REGISTER_ID, counted_cash: val, closing_note: s.closingNote }) }); const data = await res.json(); if (!res.ok) { s.setShiftError(data?.error || "Gagal tutup shift"); return; } s.setCurrentShift(null); s.setCashSalesLive(0); s.setPaidOutTotalLive(0); s.setExpectedCashLive(0); s.setRecentPaidOuts([]); s.setCountedCash(""); s.setClosingNote(""); s.setShowCloseShiftModal(false); s.setShowOpenShiftModal(true); } finally { s.setShiftSubmitting(false); } }
  async function submitPaidOut() { if (!s.currentShift) { alert("Buka shift dulu"); return; } const amount = Number(s.paidOutAmount || 0); if (!Number.isFinite(amount) || amount <= 0) { alert("Amaun tak valid"); return; } if (!s.paidOutReason.trim()) { alert("Sebab diperlukan"); return; } if (!s.paidOutStaffName.trim()) { alert("Nama staf diperlukan"); return; } s.setPaidOutSubmitting(true); try { const res = await fetch("/api/pos/paid-outs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ register_id: REGISTER_ID, amount, staff_name: s.paidOutStaffName.trim(), reason: s.paidOutReason, vendor_name: s.paidOutVendor, invoice_number: s.paidOutInvoiceNumber, invoice_url: s.paidOutInvoiceUrl, notes: s.paidOutNotes }) }); const data = await res.json(); if (!res.ok) { alert(data?.error || "Gagal simpan"); return; } s.setPaidOutAmount(""); s.setPaidOutReason(""); s.setPaidOutVendor(""); s.setPaidOutInvoiceNumber(""); s.setPaidOutInvoiceUrl(""); s.setPaidOutNotes(""); s.setShowPaidOutModal(false); s.setCashSalesLive(Number(data.cash_sales || s.cashSalesLive)); s.setPaidOutTotalLive(Number(data.paid_out_total || s.paidOutTotalLive)); s.setExpectedCashLive(Number(data.expected_cash_live || s.expectedCashLive)); await s.loadPaidOuts(); } finally { s.setPaidOutSubmitting(false); } }

  async function completePayment(overrideMethod?: "cash" | "qr" | "card", overrideCash?: number) {
    if (s.submittingOrder) return; const method = overrideMethod || s.paymentMethod; const cashVal = overrideCash ?? s.cashNum;
    if (!s.currentShift) { alert("Buka shift dulu"); return; } const finalName = s.customerName.trim() || "Walk-in";
    if (s.consentWhatsapp && !s.customerPhone.trim()) { alert("Telefon diperlukan"); return; } if (s.consentEmail && !s.customerEmail.trim()) { alert("Email diperlukan"); return; }
    if (method === "cash" && (!cashVal || cashVal < s.total)) { alert("Duit tak cukup"); return; }
    let pw: Window | null = null; if (s.autoPrintEnabled && !s.printerIp) { pw = window.open("", "_blank", "noopener,noreferrer,width=420,height=720"); if (!pw) { alert("Popup blocked. Isi Printer IP dalam More > Print Settings untuk print tanpa popup."); return; } }
    s.setSubmittingOrder(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      let res: Response;
      try {
        res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ items: s.items, register_id: REGISTER_ID, customer_name: finalName, customer: { id: s.linkedCustomerId || undefined, name: finalName, phone: s.customerPhone, email: s.customerEmail, consent_whatsapp: s.consentWhatsapp, consent_email: s.consentEmail }, loyalty_redeem_points: s.appliedRedeemPoints, subtotal: s.subtotal, discount_type: s.discountType, discount_value: s.discountValue, total: s.total, payment_method: method, cash_received: method === "cash" ? cashVal : s.total, balance: method === "cash" ? cashVal - s.total : 0 }) });
      } finally { clearTimeout(timeout); }
      const data = await res.json();
      if (!data.success) { pw?.close(); alert(data?.error || "Gagal"); return; }
      const receipt: ReceiptData = { order_id: String(data.order_id || ""), receipt_number: data.receipt_number, customerName: finalName, items: s.items, subtotal: s.subtotal, discount: s.discountAmount + s.redeemAmount, total: s.total, payment_method: method, created_at: new Date().toISOString() };
      s.setReceiptData(receipt); if (s.autoPrintEnabled) printReceipt(receipt, pw); if (s.autoPrintLabel && data.order_id) printCupLabel(String(data.order_id));
      setLastCashChange(method === "cash" ? cashVal - s.total : 0);
      s.clearCart(); s.resetCustomerState(); s.setOverlay("done"); void s.refreshShiftState({ autoPrompt: false });
    } catch (err) { pw?.close(); alert(err instanceof Error && err.name === "AbortError" ? "Timeout — server lambat respond. Cuba semula." : "Ralat pelayan"); } finally { s.setSubmittingOrder(false); }
  }

  function printReceipt(data: ReceiptData, ew?: Window | null) {
    if (data.order_id && s.printerIp) {
      fetch("/api/print/receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: data.order_id, printerIp: s.printerIp }) })
        .then(r => r.json()).then(r => { if (!r.ok) alert(`Print gagal: ${r.error || "Cuba semula"}`); });
      return;
    }
    if (data.order_id) { const url = `/api/orders/receipt/${encodeURIComponent(data.order_id)}`; if (ew && !ew.closed) { ew.location.replace(url); return; } window.open(url, "_blank", "width=420,height=720"); return; }
    const html = buildReceiptHtml({ receiptNumber: data.receipt_number, createdAt: data.created_at, customerName: data.customerName, paymentMethod: data.payment_method, subtotal: data.subtotal, discount: data.discount, total: data.total, items: data.items.map(i => ({ name: i.name + (i.supports_sugar ? ` · ${sugarLabel(i.sugar_level)}` : ""), qty: i.qty, unitPrice: i.price, lineTotal: i.price * i.qty })), autoPrint: true });
    const w = ew && !ew.closed ? ew : window.open("", "_blank", "width=420,height=720"); if (!w) return; w.document.open(); w.document.write(html); w.document.close();
  }
  function printCupLabel(orderId: string) { if (!orderId) return; window.open(`/api/orders/label/${encodeURIComponent(orderId)}`, "_blank", "width=300,height=250"); }

  // ━━━ RENDER ━━━
  return (
    <div className="pos-surface flex min-h-[100dvh] flex-col bg-white text-gray-900">
      {/* No-shift warning banner */}
      {!s.currentShift && !s.shiftLoading && s.overlay === "none" && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            background: "#7F1D1D",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 500,
            gap: 8,
          }}
        >
          <span>⚠️ Tiada shift aktif — transaksi tidak boleh diproses.</span>
          <button
            type="button"
            onClick={() => s.setShowOpenShiftModal(true)}
            style={{
              background: "#fff",
              color: "#7F1D1D",
              border: "none",
              borderRadius: 6,
              padding: "4px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Buka Shift
          </button>
        </div>
      )}
      {s.mainTab === "checkout" && s.overlay === "none" && <CheckoutTab checkoutSub={s.checkoutSub} setCheckoutSub={s.setCheckoutSub} keypadValue={s.keypadValue} setKeypadValue={s.setKeypadValue} keypadNote={s.keypadNote} setKeypadNote={s.setKeypadNote} addKeypadAmount={s.addKeypadAmount} currentShift={s.currentShift} setShowOpenShiftModal={s.setShowOpenShiftModal} products={s.products} category={s.category} setCategory={s.setCategory} searchQuery={s.searchQuery} setSearchQuery={s.setSearchQuery} categories={s.categories} handleSelectProduct={s.handleSelectProduct} totalQty={s.totalQty} setOverlay={s.setOverlay} shiftLoading={s.shiftLoading} />}
      {s.mainTab === "orders" && s.overlay === "none" && <OrdersTab />}
      {s.mainTab === "reports" && s.overlay === "none" && <ReportsTab />}
      {s.mainTab === "more" && s.overlay === "none" && <MoreTab />}
      {s.overlay === "products" && <ProductsOverlay />}
      {s.overlay === "none" && <PosBottomNav />}
      {s.overlay === "cart" && <CartOverlay />}
      {s.overlay === "customer" && <CustomerOverlay />}
      {s.overlay === "payment" && <PaymentOverlay onCompletePayment={completePayment} />}
      {s.overlay === "done" && s.receiptData && <DoneOverlay onPrintReceipt={() => printReceipt(s.receiptData!)} onPrintLabel={() => s.receiptData?.order_id && printCupLabel(s.receiptData.order_id)} lastCashChange={lastCashChange} />}
      {s.addedToast && <div className="animate-toast fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-[#7F1D1D] px-4 py-2 text-sm text-white shadow-lg">{s.addedToast}</div>}

      {/* Modals */}
      {s.showSugarPicker && s.sugarPickerPayload && (<ModalShell onClose={() => { s.setShowSugarPicker(false); s.setSugarPickerPayload(null); }}><ModalTitle>Tahap Gula</ModalTitle><ModalSubtitle>{s.sugarPickerPayload.product_name}</ModalSubtitle><div className="mt-4 grid grid-cols-2 gap-2">{SUGAR_LEVEL_OPTIONS.map(o => <button key={o.value} onClick={() => s.submitSugar(o.value)} className="pos-tile rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-medium text-gray-800">{o.emoji} {o.label}</button>)}</div><button onClick={() => { s.setShowSugarPicker(false); s.setSugarPickerPayload(null); }} className="mt-3 w-full py-2.5 text-sm text-gray-500">Batal</button></ModalShell>)}
      {s.selectedProduct && !s.showAddonModal && (<ModalShell onClose={() => { s.setSelectedProduct(null); s.setSelectedVariant(null); s.setSelectedAddons([]); }}><ModalTitle>{s.selectedProduct.name}</ModalTitle><ModalSubtitle>Pilih saiz</ModalSubtitle><div className="mt-4 space-y-2">{s.selectedProduct.variants?.map(v => <button key={v.id} onClick={() => { if (s.selectedProduct!.addons?.length) { s.setSelectedVariant(v.id); s.setShowAddonModal(true); } else { s.addProductWithSugar({ product: s.selectedProduct!, variantId: v.id }); s.setSelectedProduct(null); }}} className="pos-tile w-full rounded-xl border border-gray-200 px-4 py-3.5 text-left text-sm font-medium">{v.name} <span className="text-gray-400">+RM{v.price_adjustment.toFixed(2)}</span></button>)}</div><button onClick={() => { s.setSelectedProduct(null); s.setSelectedVariant(null); s.setSelectedAddons([]); }} className="mt-3 w-full py-2.5 text-sm text-gray-500">Batal</button></ModalShell>)}
      {s.showAddonModal && s.selectedProduct && (<ModalShell onClose={() => { s.setShowAddonModal(false); s.setSelectedAddons([]); }}><ModalTitle>Tambahan</ModalTitle><div className="mt-4 space-y-2">{s.selectedProduct.addons?.map(a => <label key={a.id} className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3"><input type="checkbox" checked={s.selectedAddons.includes(a.id)} onChange={e => s.setSelectedAddons(e.target.checked ? [...s.selectedAddons, a.id] : s.selectedAddons.filter(x => x !== a.id))} className="h-4 w-4 accent-[#7F1D1D]" /><span className="flex-1 text-sm">{a.name}</span><span className="text-sm text-gray-400">+RM{a.price.toFixed(2)}</span></label>)}</div><ModalActions><ModalBtnSecondary onClick={() => { if (s.selectedProduct?.variants?.length) s.setShowAddonModal(false); else { s.setSelectedProduct(null); s.setShowAddonModal(false); } s.setSelectedAddons([]); }}>Batal</ModalBtnSecondary><ModalBtnPrimary onClick={() => { s.addProductWithSugar({ product: s.selectedProduct!, variantId: s.selectedVariant || undefined, addonIds: s.selectedAddons }); s.setSelectedProduct(null); s.setSelectedVariant(null); s.setSelectedAddons([]); s.setShowAddonModal(false); }}>Tambah</ModalBtnPrimary></ModalActions></ModalShell>)}
      {s.showOpenShiftModal && (<ModalShell onClose={() => s.setShowOpenShiftModal(false)}><ModalTitle>Buka Shift</ModalTitle><ModalSubtitle>Masukkan duit permulaan.</ModalSubtitle><div className="mt-4 space-y-3"><ModalInput type="number" value={s.openingCash} onChange={s.setOpeningCash} placeholder="Duit permulaan (RM)" /><ModalTextArea value={s.openingNote} onChange={s.setOpeningNote} placeholder="Nota (pilihan)" /></div><ModalActions><ModalBtnSecondary onClick={() => s.setShowOpenShiftModal(false)}>Batal</ModalBtnSecondary><ModalBtnPrimary onClick={() => void openShift()} disabled={s.shiftSubmitting}>{s.shiftSubmitting ? "Membuka..." : "Buka"}</ModalBtnPrimary></ModalActions></ModalShell>)}
      {s.showCloseShiftModal && s.currentShift && (<ModalShell onClose={() => s.setShowCloseShiftModal(false)}><ModalTitle>Tutup Shift</ModalTitle><InfoCard><div className="space-y-0.5"><div>Permulaan: RM{Number(s.currentShift.opening_cash || 0).toFixed(2)}</div><div>Jualan: RM{s.cashSalesLive.toFixed(2)}</div><div>Paid out: RM{s.paidOutTotalLive.toFixed(2)}</div><div className="font-semibold">Jangkaan: RM{s.expectedCashLive.toFixed(2)}</div></div></InfoCard><div className="mt-3 space-y-3"><ModalInput type="number" value={s.countedCash} onChange={s.setCountedCash} placeholder="Duit dikira (RM)" /><div className="text-sm">Lebih/Kurang: <span className="font-semibold">RM{(Number(s.countedCash || 0) - s.expectedCashLive).toFixed(2)}</span></div><ModalTextArea value={s.closingNote} onChange={s.setClosingNote} placeholder="Nota penutup" /></div><ModalActions><ModalBtnSecondary onClick={() => s.setShowCloseShiftModal(false)}>Batal</ModalBtnSecondary><ModalBtnPrimary onClick={() => void closeShift()} disabled={s.shiftSubmitting}>{s.shiftSubmitting ? "Menutup..." : "Tutup"}</ModalBtnPrimary></ModalActions></ModalShell>)}
      {s.showPaidOutModal && s.currentShift && (<ModalShell onClose={() => s.setShowPaidOutModal(false)}><ModalTitle>Paid Out</ModalTitle><InfoCard><div>Tunai: RM{s.cashSalesLive.toFixed(2)} · Keluar: RM{s.paidOutTotalLive.toFixed(2)} · Baki: RM{s.expectedCashLive.toFixed(2)}</div></InfoCard><div className="mt-3 space-y-2"><ModalInput type="number" value={s.paidOutAmount} onChange={s.setPaidOutAmount} placeholder="Amaun (RM)" /><ModalInput value={s.paidOutReason} onChange={s.setPaidOutReason} placeholder="Sebab" /><ModalInput value={s.paidOutStaffName} onChange={s.setPaidOutStaffName} placeholder="Nama staf" /><ModalInput value={s.paidOutVendor} onChange={s.setPaidOutVendor} placeholder="Vendor (pilihan)" /></div>{s.recentPaidOuts.length > 0 && <div className="mt-2 max-h-20 overflow-auto rounded-lg bg-gray-50 p-2"><div className="mb-1 text-[11px] font-medium text-gray-500">Terkini</div>{s.recentPaidOuts.slice(0, 3).map(e => <div key={e.id} className="flex justify-between text-xs"><span className="truncate text-gray-600">{e.reason}</span><span className="text-red-600">RM{Number(e.amount || 0).toFixed(2)}</span></div>)}</div>}<ModalActions><ModalBtnSecondary onClick={() => s.setShowPaidOutModal(false)}>Batal</ModalBtnSecondary><ModalBtnPrimary onClick={() => void submitPaidOut()} disabled={s.paidOutSubmitting}>{s.paidOutSubmitting ? "Saving..." : "Simpan"}</ModalBtnPrimary></ModalActions></ModalShell>)}
      {s.showSignOutConfirm && (<ModalShell onClose={() => s.setShowSignOutConfirm(false)}><ModalTitle>Log keluar?</ModalTitle><ModalActions><ModalBtnSecondary onClick={() => s.setShowSignOutConfirm(false)}>Batal</ModalBtnSecondary><a href="/auth/logout?next=/staff/login" className="flex flex-1 items-center justify-center rounded-xl bg-[#7F1D1D] px-4 py-3 text-sm font-semibold text-white">Ya</a></ModalActions></ModalShell>)}
      {s.showQrScanner && <QrScanner onScan={handleQrScan} onClose={() => s.setShowQrScanner(false)} />}
    </div>
  );
}

function POSPageWithState() {
  const state = usePosState();
  return <PosProvider value={state}><POSPageInner /></PosProvider>;
}

export default function POSPage() {
  return (
    <PosErrorBoundary>
      <Suspense fallback={<div className="flex h-screen items-center justify-center text-gray-400">Loading...</div>}>
        <POSPageWithState />
      </Suspense>
    </PosErrorBoundary>
  );
}
