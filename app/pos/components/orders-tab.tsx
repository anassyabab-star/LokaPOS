"use client";

import { useEffect, useMemo, useState } from "react";
import { usePos } from "../pos-context";
import type { OrderRow } from "../hooks/use-pos-state";
import { OrderTargetBadge } from "./order-target-badge";
import { ORDER_STATUS_LABELS_MS, normalizeOrderStatus, shortOrderNumber } from "@/lib/order-flow";

const VOID_REASONS = [
  "Permintaan pelanggan",
  "Kehabisan stok",
  "Kesilapan pesanan",
  "Masalah pembayaran",
  "Lain-lain",
];

const REFUND_REASONS = [
  "Permintaan pelanggan",
  "Item salah diterima",
  "Kesilapan harga",
  "Kualiti tidak memuaskan",
  "Lain-lain",
];

function statusColor(status: string) {
  switch (status?.toLowerCase()) {
    case "awaiting_payment": return "bg-amber-100 text-amber-800";
    case "completed": return "bg-green-100 text-green-800";
    case "preparing": return "bg-blue-100 text-blue-800";
    case "ready": return "bg-emerald-600 text-white";
    case "pending": return "bg-gray-100 text-gray-800";
    case "cancelled": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-600";
  }
}

function statusLabel(status: string) {
  const s = normalizeOrderStatus(status);
  return s ? ORDER_STATUS_LABELS_MS[s] : status;
}

function paymentLabel(method: string) {
  switch (method) { case "cash": return "Cash"; case "qr": return "QR"; case "card": return "Card"; case "fpx": return "FPX"; default: return method; }
}

function sourceTag(source: string | null) {
  if (source === "customer_web") return { label: "Web", color: "bg-purple-100 text-purple-700" };
  if (source === "pos") return { label: "POS", color: "bg-blue-100 text-blue-700" };
  return { label: "POS", color: "bg-gray-100 text-gray-600" };
}

type StatusFilter = "awaiting_payment" | "all" | "pending" | "preparing" | "ready" | "completed" | "cancelled";

const FILTER_TABS: { key: StatusFilter; label: string }[] = [
  { key: "awaiting_payment", label: "Belum Bayar" },
  { key: "all", label: "Semua" },
  { key: "pending", label: "Pending" },
  { key: "preparing", label: "Dibuat" },
  { key: "ready", label: "Sedia" },
  { key: "completed", label: "Selesai" },
  { key: "cancelled", label: "Batal" },
];

function matchesQuery(order: OrderRow, q: string) {
  const needle = q.toLowerCase();
  const short = (order.short_number || shortOrderNumber(order.receipt_number, order.id)).toLowerCase();
  const digits = needle.replace(/\D/g, "");
  if (digits && short.replace(/^0+/, "") === digits.replace(/^0+/, "")) return true;
  if (String(order.receipt_number || "").toLowerCase().includes(needle)) return true;
  if (String(order.customer_name || "").toLowerCase().includes(needle)) return true;
  if (order.table_number && `meja ${order.table_number}`.toLowerCase().includes(needle)) return true;
  if (order.buzzer_number && `buzzer ${order.buzzer_number}`.toLowerCase().includes(needle)) return true;
  return false;
}

export default function OrdersTab() {
  const s = usePos();
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [lookupResults, setLookupResults] = useState<OrderRow[] | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ action: "void" | "refund"; orderId: string } | null>(null);
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const trimmedQuery = query.trim();
  const localHits = useMemo(
    () => (trimmedQuery ? s.orders.filter(o => matchesQuery(o, trimmedQuery)) : []),
    [s.orders, trimmedQuery]
  );

  // No local hit (older order, other day, phone number) → ask the server.
  useEffect(() => {
    if (!trimmedQuery || localHits.length > 0) { setLookupResults(null); setLookupLoading(false); return; }
    let cancelled = false;
    setLookupLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/pos/orders/lookup?q=${encodeURIComponent(trimmedQuery)}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setLookupResults(Array.isArray(data?.orders) ? data.orders : []);
      } catch {
        if (!cancelled) setLookupResults([]);
      } finally {
        if (!cancelled) setLookupLoading(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [trimmedQuery, localHits.length]);

  function printCupLabel(orderId: string) {
    if (!orderId) return;
    window.open(`/api/orders/label/${encodeURIComponent(orderId)}`, "_blank", "width=300,height=250");
  }

  async function updateOrderStatus(orderId: string, newStatus: string) {
    setStatusError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatusError(data.error || `Gagal kemaskini status (${res.status})`);
      }
      void s.loadOrders();
    } catch {
      setStatusError("Tiada sambungan. Cuba lagi.");
    }
  }

  const [notifiedId, setNotifiedId] = useState<string | null>(null);
  // Mark an order "ready" and WhatsApp the customer — works even with KDS off.
  async function notifyReady(orderId: string) {
    setStatusError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/ready`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setStatusError(data.error || "Gagal notify"); return; }
      if (data.notified) {
        setNotifiedId(orderId);
        setTimeout(() => setNotifiedId(null), 2500);
      } else {
        setStatusError(`Ditanda sedia — WhatsApp tak dihantar (${data.reason || "?"})`);
      }
      void s.loadOrders();
    } catch {
      setStatusError("Tiada sambungan. Cuba lagi.");
    }
  }

  function openAction(orderId: string, action: "void" | "refund") {
    setPendingAction({ action, orderId });
    setSelectedReason("");
    setCustomReason("");
    setActionError(null);
  }

  function cancelAction() {
    setPendingAction(null);
    setSelectedReason("");
    setCustomReason("");
    setActionError(null);
  }

  async function submitAction() {
    if (!pendingAction) return;
    const reason = selectedReason === "Lain-lain" ? customReason.trim() : selectedReason;
    if (!reason || reason.length < 3) {
      setActionError("Sila pilih atau masukkan sebab.");
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/orders/${pendingAction.orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: pendingAction.action, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || `Gagal (${res.status})`);
        return;
      }
      cancelAction();
      s.setOrderDetailOpen(null);
      void s.loadOrders();
    } catch {
      setActionError("Tiada sambungan. Cuba lagi.");
    } finally {
      setActionLoading(false);
    }
  }

  const awaitingCount = s.orders.filter(o => o.status?.toLowerCase() === "awaiting_payment").length;

  function renderRow(order: OrderRow) {
    const src = sourceTag(order.order_source);
    const st = order.status?.toLowerCase() || "pending";
    const short = order.short_number || shortOrderNumber(order.receipt_number, order.id);
    const isAwaiting = st === "awaiting_payment";
    const isReady = st === "ready";
    return (
      <div key={order.id} className={`border-b border-gray-200 px-4 py-3 ${isReady ? "bg-green-50" : isAwaiting ? "bg-amber-50/40" : ""}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-base font-bold tabular-nums text-gray-900">#{short}</span>
              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor(order.status)}`}>
                {isReady ? "SEDIA — SERAH" : statusLabel(order.status)}
              </span>
              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${src.color}`}>{src.label}</span>
              <OrderTargetBadge order={order} hideCounter />
            </div>
            <div className="mt-0.5 truncate text-xs text-gray-400">
              {order.customer_name || "Walk-in"} · {order.receipt_number} · {isAwaiting ? "Belum bayar" : paymentLabel(order.payment_method)} · {new Date(order.created_at).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
          <span className="shrink-0 text-sm font-bold tabular-nums text-gray-900">RM{Number(order.total).toFixed(2)}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {isAwaiting && (
            <button onClick={() => s.openCollectPayment(order.id)} className="rounded-md bg-[#7F1D1D] px-3.5 py-1.5 text-[11px] font-semibold text-white active:bg-[#6B1818]">
              💵 Terima Bayaran
            </button>
          )}
          {st === "pending" && <button onClick={() => void updateOrderStatus(order.id, "preparing")} className="rounded-md bg-amber-500 px-3 py-1.5 text-[11px] font-medium text-white active:bg-amber-600">Mula Buat</button>}
          {st === "preparing" && <button onClick={() => void updateOrderStatus(order.id, "ready")} className="rounded-md bg-blue-500 px-3 py-1.5 text-[11px] font-medium text-white active:bg-blue-600">Siap</button>}
          {isReady && <button onClick={() => void updateOrderStatus(order.id, "completed")} className="rounded-md bg-green-600 px-3.5 py-1.5 text-[11px] font-semibold text-white active:bg-green-700">✓ Selesai (Serah)</button>}
          {(st === "pending" || st === "preparing" || st === "completed") && (
            <button onClick={() => void notifyReady(order.id)} className={`rounded-md px-3 py-1.5 text-[11px] font-medium text-white ${notifiedId === order.id ? "bg-green-600" : "bg-blue-500 active:bg-blue-600"}`}>
              {notifiedId === order.id ? "✓ Dinotify" : "🔔 Notify Sedia"}
            </button>
          )}
          {!isAwaiting && st !== "cancelled" && (
            <>
              <button onClick={() => window.open(`/api/orders/receipt/${order.id}`, "_blank", "width=420,height=720")} className="rounded-md border border-gray-200 px-3 py-1.5 text-[11px] font-medium text-gray-500 active:bg-gray-100">Print</button>
              <button onClick={() => printCupLabel(order.id)} className="rounded-md border border-gray-200 px-3 py-1.5 text-[11px] font-medium text-[#7F1D1D] active:bg-red-50">Label</button>
            </>
          )}
          <button onClick={() => void s.loadOrderDetail(order.id)} className="rounded-md border border-gray-200 px-3 py-1.5 text-[11px] font-medium text-blue-600 active:bg-blue-50">View Items</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto pb-20">
        {statusError && (
          <div className="flex items-center justify-between bg-red-50 border-b border-red-200 px-4 py-2">
            <span className="text-xs text-red-700">{statusError}</span>
            <button onClick={() => setStatusError(null)} className="text-red-400 text-sm ml-2">×</button>
          </div>
        )}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900">Orders</h1>
          <div className="flex gap-2">
            <button onClick={() => s.setShowQrScanner(true)} className="rounded-lg bg-[#7F1D1D] px-3 py-1.5 text-xs font-medium text-white active:bg-[#6F1A1A] flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="3" height="3" />
                <path d="M21 14h-3v3h3M21 21h-3m3 0v-3" />
              </svg>
              Scan
            </button>
            <button onClick={() => void s.loadOrders()} className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 active:bg-gray-200">
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Search: Order ID the customer quotes (042), receipt, name, phone */}
        <div className="border-b border-gray-200 px-4 py-2.5">
          <div className="relative">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              inputMode="search"
              placeholder="Cari Order ID (cth. 042), nama atau telefon"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-9 text-sm outline-none placeholder:text-gray-400 focus:border-[#7F1D1D] focus:bg-white focus:ring-1 focus:ring-[#7F1D1D]/20"
            />
            <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></svg>
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-1.5 text-lg leading-none text-gray-400">×</button>
            )}
          </div>
        </div>

        {/* Status filter tabs */}
        {!trimmedQuery && (
          <div className="scrollbar-hide flex gap-1.5 overflow-x-auto border-b border-gray-200 px-4 py-2.5">
            {FILTER_TABS.map(tab => {
              const count = tab.key === "all"
                ? s.orders.length
                : s.orders.filter(o => o.status?.toLowerCase() === tab.key).length;
              const active = statusFilter === tab.key;
              const amber = tab.key === "awaiting_payment" && count > 0 && !active;
              return (
                <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
                  className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${active ? "bg-[#7F1D1D] text-white" : amber ? "bg-amber-100 text-amber-800 active:bg-amber-200" : "bg-gray-100 text-gray-600 active:bg-gray-200"}`}>
                  {tab.label}{count > 0 ? ` (${count})` : ""}
                </button>
              );
            })}
          </div>
        )}

        {trimmedQuery ? (
          localHits.length > 0 ? (
            <div>{localHits.map(renderRow)}</div>
          ) : lookupLoading ? (
            <div className="flex items-center justify-center py-20"><div className="text-sm text-gray-400">Mencari...</div></div>
          ) : lookupResults && lookupResults.length > 0 ? (
            <div>
              <div className="bg-gray-50 px-4 py-1.5 text-[11px] text-gray-500">Hasil carian pelayan</div>
              {lookupResults.map(renderRow)}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="text-sm text-gray-400">Tiada order sepadan &ldquo;{trimmedQuery}&rdquo;</div>
            </div>
          )
        ) : s.ordersLoading && s.orders.length === 0 ? (
          <div className="flex items-center justify-center py-20"><div className="text-sm text-gray-400">Memuatkan...</div></div>
        ) : (() => {
          const filtered = statusFilter === "all"
            ? s.orders
            : s.orders.filter(o => o.status?.toLowerCase() === statusFilter);
          if (filtered.length === 0) return (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="text-sm font-medium text-gray-300 mb-1">—</div>
              <div className="text-sm text-gray-400">
                {s.orders.length === 0
                  ? "Tiada order dijumpai"
                  : statusFilter === "awaiting_payment"
                    ? "Tiada order menunggu bayaran"
                    : `Tiada order ${FILTER_TABS.find(t => t.key === statusFilter)?.label.toLowerCase()}`}
              </div>
            </div>
          );
          return (
            <div>
              {statusFilter === "all" && awaitingCount > 0 && (
                <button onClick={() => setStatusFilter("awaiting_payment")} className="flex w-full items-center justify-between bg-amber-50 px-4 py-2 text-left text-xs font-medium text-amber-800">
                  <span>🧾 {awaitingCount} order menunggu bayaran di kaunter</span>
                  <span>Lihat ›</span>
                </button>
              )}
              {filtered.map(renderRow)}
            </div>
          );
        })()}
      </div>

      {/* Order Detail Modal */}
      {s.orderDetailOpen && (() => {
        const detailOrder = s.orders.find(o => o.id === s.orderDetailOpen) || lookupResults?.find(o => o.id === s.orderDetailOpen);
        const detailStatus = detailOrder?.status?.toLowerCase() || "";
        const detailShort = detailOrder ? (detailOrder.short_number || shortOrderNumber(detailOrder.receipt_number, detailOrder.id)) : "—";
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
            <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-white sm:rounded-2xl">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
                    Order #{detailShort}
                    {detailOrder && <OrderTargetBadge order={detailOrder} hideCounter />}
                  </h2>
                  <div className="text-xs text-gray-400">{detailOrder?.receipt_number} · {detailOrder?.customer_name || "Walk-in"} · {detailOrder ? new Date(detailOrder.created_at).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" }) : ""}</div>
                </div>
                <button onClick={() => s.setOrderDetailOpen(null)} className="text-xl text-gray-400 hover:text-gray-600">×</button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {s.orderDetailLoading ? (
                  <div className="flex items-center justify-center py-10"><div className="text-sm text-gray-400">Memuatkan...</div></div>
                ) : s.orderDetailError ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <div className="text-sm text-red-500">Gagal muatkan item. Cuba semula.</div>
                    <button onClick={() => s.orderDetailOpen && s.loadOrderDetail(s.orderDetailOpen)} className="text-xs text-[#7F1D1D] underline">Cuba semula</button>
                  </div>
                ) : s.orderDetailItems.length === 0 ? (
                  <div className="flex items-center justify-center py-10"><div className="text-sm text-gray-400">Tiada item dijumpai</div></div>
                ) : (
                  <div className="space-y-3">
                    {s.orderDetailItems.map((item, idx) => (
                      <div key={idx} className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3 last:border-0">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-900">{item.name}{item.variant_name ? <span className="text-gray-500"> ({item.variant_name})</span> : null}</div>
                          {item.addon_names.length > 0 && <div className="mt-0.5 text-xs text-[#7F1D1D]">+ {item.addon_names.join(", ")}</div>}
                          {item.sugar_level && <div className="mt-0.5 text-xs text-gray-400">Sugar: {item.sugar_level}</div>}
                          <div className="mt-0.5 text-xs text-gray-400">RM{item.price.toFixed(2)} × {item.qty}</div>
                        </div>
                        <div className="text-sm font-semibold tabular-nums text-gray-900 shrink-0">RM{item.line_total.toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t bg-gray-50 px-4 py-3">
                {detailOrder && (
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">Total</span>
                    <span className="text-lg font-bold text-gray-900">RM{Number(detailOrder.total).toFixed(2)}</span>
                  </div>
                )}

                {/* Void/Refund reason picker */}
                {pendingAction && pendingAction.orderId === s.orderDetailOpen && (
                  <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3">
                    <p className="mb-2 text-xs font-bold text-red-800 uppercase tracking-wide">
                      {pendingAction.action === "void" ? "Sebab Void" : "Sebab Refund"}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {(pendingAction.action === "void" ? VOID_REASONS : REFUND_REASONS).map(r => (
                        <button key={r} onClick={() => setSelectedReason(r)}
                          className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${selectedReason === r ? "bg-[#7F1D1D] text-white" : "bg-white border border-gray-200 text-gray-700 active:bg-gray-100"}`}>
                          {r}
                        </button>
                      ))}
                    </div>
                    {selectedReason === "Lain-lain" && (
                      <input value={customReason} onChange={e => setCustomReason(e.target.value)}
                        placeholder="Nyatakan sebab lain..."
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#7F1D1D] mb-2" />
                    )}
                    {actionError && <p className="mb-2 text-[11px] text-red-600">{actionError}</p>}
                    <div className="flex gap-2">
                      <button onClick={cancelAction} className="flex-1 rounded-lg border border-gray-300 py-2 text-xs font-medium text-gray-600 active:bg-gray-100">Batal</button>
                      <button onClick={() => void submitAction()} disabled={actionLoading}
                        className="flex-1 rounded-lg bg-[#7F1D1D] py-2 text-xs font-medium text-white active:bg-[#6F1A1A] disabled:opacity-50">
                        {actionLoading ? "Proses..." : `Sahkan ${pendingAction.action === "void" ? "Void" : "Refund"}`}
                      </button>
                    </div>
                  </div>
                )}

                {detailStatus === "awaiting_payment" ? (
                  <div className="flex gap-2">
                    <button onClick={() => { const id = s.orderDetailOpen; s.setOrderDetailOpen(null); if (id) s.openCollectPayment(id); }} className="flex-[2] rounded-lg bg-[#7F1D1D] py-2.5 text-sm font-semibold text-white active:bg-[#6F1A1A]">💵 Terima Bayaran</button>
                    <button onClick={() => s.setOrderDetailOpen(null)} className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 active:bg-gray-100">Tutup</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => { if (s.orderDetailOpen) window.open(`/api/orders/receipt/${s.orderDetailOpen}`, "_blank", "width=420,height=720"); }} className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 active:bg-gray-100">Print Receipt</button>
                    <button onClick={() => { if (s.orderDetailOpen) printCupLabel(s.orderDetailOpen); }} className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-[#7F1D1D] active:bg-red-50">Cup Label</button>
                    <button onClick={() => s.setOrderDetailOpen(null)} className="flex-1 rounded-lg bg-[#7F1D1D] py-2.5 text-sm font-medium text-white active:bg-[#6F1A1A]">Tutup</button>
                  </div>
                )}

                {/* Void / Refund trigger buttons */}
                {detailOrder && detailStatus !== "cancelled" && !pendingAction && (
                  <div className="mt-2 flex gap-2">
                    {detailOrder.payment_status?.toLowerCase() !== "paid" && (
                      <button onClick={() => openAction(detailOrder.id, "void")}
                        className="flex-1 rounded-lg border border-red-200 py-2 text-xs font-medium text-red-600 active:bg-red-50">
                        Void Order
                      </button>
                    )}
                    {detailOrder.payment_status?.toLowerCase() === "paid" && (
                      <button onClick={() => openAction(detailOrder.id, "refund")}
                        className="flex-1 rounded-lg border border-red-200 py-2 text-xs font-medium text-red-600 active:bg-red-50">
                        Refund
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
