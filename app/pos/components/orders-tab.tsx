"use client";

import { usePos } from "../pos-context";

function statusColor(status: string) {
  switch (status?.toLowerCase()) {
    case "completed": return "bg-green-100 text-green-800";
    case "preparing": return "bg-amber-100 text-amber-800";
    case "ready": return "bg-blue-100 text-blue-800";
    case "pending": return "bg-gray-100 text-gray-800";
    case "cancelled": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-600";
  }
}

function paymentLabel(method: string) {
  switch (method) { case "cash": return "Cash"; case "qr": return "QR"; case "card": return "Card"; case "fpx": return "FPX"; default: return method; }
}

function sourceTag(source: string | null) {
  if (source === "customer_web") return { label: "Web", color: "bg-purple-100 text-purple-700" };
  if (source === "pos") return { label: "POS", color: "bg-blue-100 text-blue-700" };
  return { label: "POS", color: "bg-gray-100 text-gray-600" };
}

export default function OrdersTab() {
  const s = usePos();

  function printCupLabel(orderId: string) {
    if (!orderId) return;
    window.open(`/api/orders/label/${encodeURIComponent(orderId)}`, "_blank", "width=300,height=250");
  }

  async function updateOrderStatus(orderId: string, newStatus: string) {
    try {
      await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      void s.loadOrders();
    } catch {}
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto pb-20">
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
        {s.ordersLoading ? (
          <div className="flex items-center justify-center py-20"><div className="text-sm text-gray-400">Memuatkan...</div></div>
        ) : s.orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="text-sm font-medium text-gray-300 mb-1">—</div>
            <div className="text-sm text-gray-400">Tiada order dijumpai</div>
          </div>
        ) : (
          <div>
            {s.orders.map(order => {
              const src = sourceTag(order.order_source);
              const st = order.status?.toLowerCase() || "pending";
              return (
              <div key={order.id} className="border-b border-gray-200 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">#{order.receipt_number}</span>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor(order.status)}`}>{order.status}</span>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${src.color}`}>{src.label}</span>
                      {order.payment_status === "pending" && <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-600">Belum Bayar</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      {order.customer_name || "Walk-in"} · {paymentLabel(order.payment_method)} · {new Date(order.created_at).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-gray-900 shrink-0">RM{Number(order.total).toFixed(2)}</span>
                </div>
                <div className="mt-2 flex gap-2 flex-wrap">
                  {st === "pending" && <button onClick={() => void updateOrderStatus(order.id, "preparing")} className="rounded-md bg-amber-500 px-3 py-1.5 text-[11px] font-medium text-white active:bg-amber-600">Preparing</button>}
                  {st === "preparing" && <button onClick={() => void updateOrderStatus(order.id, "ready")} className="rounded-md bg-blue-500 px-3 py-1.5 text-[11px] font-medium text-white active:bg-blue-600">Ready</button>}
                  {st === "ready" && <button onClick={() => void updateOrderStatus(order.id, "completed")} className="rounded-md bg-green-600 px-3 py-1.5 text-[11px] font-medium text-white active:bg-green-700">Completed</button>}
                  <button onClick={() => window.open(`/api/orders/receipt/${order.id}`, "_blank", "width=420,height=720")} className="rounded-md border border-gray-200 px-3 py-1.5 text-[11px] font-medium text-gray-500 active:bg-gray-100">Print</button>
                  <button onClick={() => printCupLabel(order.id)} className="rounded-md border border-gray-200 px-3 py-1.5 text-[11px] font-medium text-[#7F1D1D] active:bg-red-50">Label</button>
                  <button onClick={() => void s.loadOrderDetail(order.id)} className="rounded-md border border-gray-200 px-3 py-1.5 text-[11px] font-medium text-blue-600 active:bg-blue-50">View Items</button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {s.orderDetailOpen && (() => {
        const detailOrder = s.orders.find(o => o.id === s.orderDetailOpen);
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
            <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-white sm:rounded-2xl">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Order #{detailOrder?.receipt_number || "—"}</h2>
                  <div className="text-xs text-gray-400">{detailOrder?.customer_name || "Walk-in"} · {detailOrder ? new Date(detailOrder.created_at).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" }) : ""}</div>
                </div>
                <button onClick={() => s.setOrderDetailOpen(null)} className="text-xl text-gray-400 hover:text-gray-600">×</button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {s.orderDetailLoading ? (
                  <div className="flex items-center justify-center py-10"><div className="text-sm text-gray-400">Memuatkan...</div></div>
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
                <div className="flex gap-2">
                  <button onClick={() => { if (s.orderDetailOpen) window.open(`/api/orders/receipt/${s.orderDetailOpen}`, "_blank", "width=420,height=720"); }} className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 active:bg-gray-100">Print Receipt</button>
                  <button onClick={() => { if (s.orderDetailOpen) printCupLabel(s.orderDetailOpen); }} className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-[#7F1D1D] active:bg-red-50">Cup Label</button>
                  <button onClick={() => s.setOrderDetailOpen(null)} className="flex-1 rounded-lg bg-[#7F1D1D] py-2.5 text-sm font-medium text-white active:bg-[#6F1A1A]">Tutup</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
