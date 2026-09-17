"use client";

import { useCallback, useEffect, useState } from "react";
import { usePos, REGISTER_ID } from "../pos-context";
import { CashCalculator, PaymentMethodList } from "./pos-overlays";
import { OrderTargetBadge } from "./order-target-badge";
import type { OrderDetailItem } from "../hooks/use-pos-state";
import { normalizeOrderType, orderTarget, type OrderType } from "@/lib/order-flow";

// ============================================================================
// Collect Payment — the cashier's "Terima Bayaran" flow for an order the
// customer placed on their phone (status: awaiting_payment).
//
//   1. details  → confirm items, Dine In / Take Away, table or buzzer number
//   2. method   → Cash / QR / Card  (shared PaymentMethodList)
//   3. cash     → cash calculator    (shared CashCalculator)
//   → POST /api/pos/orders/[id]/pay → onPaid(order)
// ============================================================================

export type PaidOrder = {
  id: string;
  receipt_number: string | null;
  short_number: string;
  status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  cash_received: number;
  balance: number;
  total: number;
  subtotal: number;
  discount_value: number;
  customer_name: string | null;
  created_at: string;
  paid_at: string | null;
  order_type: string | null;
  table_number: string | null;
  buzzer_number: string | null;
};

type DetailOrder = {
  id: string;
  receipt_number: string | null;
  short_number?: string;
  created_at: string;
  customer_name: string | null;
  payment_method: string | null;
  payment_status?: string | null;
  subtotal: number;
  discount_value: number;
  total: number;
  status: string | null;
  order_source?: string | null;
  order_type?: string | null;
  table_number?: string | null;
  buzzer_number?: string | null;
};

type Step = "details" | "method" | "cash";

function cleanLabel(value: string) {
  return value.replace(/[^\w-]/g, "").slice(0, 10);
}

export default function CollectPaymentSheet({
  orderId,
  onPaid,
  onClose,
}: {
  orderId: string;
  onPaid: (order: PaidOrder, preOpenedWindow: Window | null) => void;
  onClose: () => void;
}) {
  const s = usePos();
  const [order, setOrder] = useState<DetailOrder | null>(null);
  const [items, setItems] = useState<OrderDetailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("details");
  const [orderType, setOrderType] = useState<OrderType>("take_away");
  const [table, setTable] = useState("");
  const [buzzer, setBuzzer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/pos/orders?order_id=${encodeURIComponent(orderId)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.order) {
        setLoadError(data?.error || "Order tidak dijumpai");
        return;
      }
      const o = data.order as DetailOrder;
      setOrder(o);
      setItems(Array.isArray(data.items) ? data.items : []);
      const type = normalizeOrderType(o.order_type) ?? (o.table_number ? "dine_in" : "take_away");
      setOrderType(type);
      setTable(String(o.table_number || ""));
      setBuzzer(String(o.buzzer_number || ""));
    } catch {
      setLoadError("Tiada sambungan. Cuba lagi.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  const status = String(order?.status || "").toLowerCase();
  const alreadyPaid = String(order?.payment_status || "").toLowerCase() === "paid";
  const cancelled = status === "cancelled";
  const collectable = Boolean(order) && !alreadyPaid && !cancelled;
  const canContinue = collectable && (orderType === "take_away" || table.trim() !== "" || buzzer.trim() !== "");
  const shortNo = order?.short_number || String(order?.receipt_number || "").split("-").pop() || "";
  const targetPreview = orderTarget({
    order_type: orderType,
    table_number: orderType === "dine_in" ? table : null,
    buzzer_number: buzzer,
  });

  async function submit(method: "cash" | "qr" | "card", cash?: number) {
    if (!order || submitting) return;
    // Pre-open the receipt window inside the click so the browser doesn't block it.
    let pw: Window | null = null;
    if (s.autoPrintEnabled && !s.printerIp) {
      pw = window.open("", "_blank", "noopener,noreferrer,width=420,height=720");
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/pos/orders/${encodeURIComponent(orderId)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_method: method,
          cash_received: method === "cash" ? cash : undefined,
          order_type: orderType,
          table_number: orderType === "dine_in" ? cleanLabel(table.trim()) : "",
          buzzer_number: cleanLabel(buzzer.trim()),
          register_id: REGISTER_ID,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.order) {
        pw?.close();
        setError(data?.error || `Gagal terima bayaran (${res.status})`);
        setStep("details");
        void load();
        return;
      }
      onPaid(data.order as PaidOrder, pw);
    } catch {
      pw?.close();
      setError("Tiada sambungan. Cuba lagi.");
      setStep("details");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "method" && order) {
    return (
      <PaymentMethodList
        total={order.total}
        disabled={submitting}
        subtitle={`#${shortNo} · ${targetPreview.text}`}
        onClose={() => setStep("details")}
        onCash={() => setStep("cash")}
        onQr={() => void submit("qr")}
        onCard={() => void submit("card")}
      />
    );
  }

  if (step === "cash" && order) {
    return (
      <CashCalculator
        total={order.total}
        submitting={submitting}
        title={`Bayaran Tunai · #${shortNo}`}
        onBack={() => setStep("method")}
        onConfirm={cash => void submit("cash", cash)}
      />
    );
  }

  return (
    <div className="screen-enter fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <button onClick={onClose} className="text-2xl leading-none text-gray-400">✕</button>
        <span className="text-sm font-semibold text-gray-900">Terima Bayaran</span>
        <button onClick={() => void load()} className="text-xs font-medium text-gray-500">↻</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-400">Memuatkan order...</div>
        ) : loadError || !order ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="text-sm text-red-500">{loadError || "Order tidak dijumpai"}</div>
            <button onClick={() => void load()} className="text-xs text-[#7F1D1D] underline">Cuba semula</button>
          </div>
        ) : (
          <>
            {/* Order ID hero */}
            <div className="border-b border-gray-100 bg-[#FDF8F4] px-4 py-5 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Order ID</div>
              <div className="mt-1 text-5xl font-black tabular-nums tracking-tight text-[#7F1D1D]">#{shortNo}</div>
              <div className="mt-1 text-xs text-gray-400">{order.receipt_number}</div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-sm text-gray-700">
                <span className="font-medium">{order.customer_name || "Walk-in"}</span>
                <span className="text-gray-300">·</span>
                <span className="text-gray-500">{new Date(order.created_at).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" })}</span>
                {order.order_source === "customer_web" && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">Web</span>
                )}
                <OrderTargetBadge order={order} hideCounter />
              </div>
            </div>

            {!collectable && (
              <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {cancelled ? "Order ini telah dibatalkan." : alreadyPaid ? "Order ini sudah dibayar." : "Order ini tidak boleh dibayar sekarang."}
              </div>
            )}

            {/* Items */}
            <div className="px-4 pt-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Item</div>
              {items.length === 0 ? (
                <div className="py-4 text-center text-sm text-gray-400">Tiada item</div>
              ) : (
                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3 last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          <span className="mr-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded bg-gray-100 px-1 text-[11px] font-bold text-gray-600">{item.qty}</span>
                          {item.name}{item.variant_name ? <span className="text-gray-500"> ({item.variant_name})</span> : null}
                        </div>
                        {item.addon_names.length > 0 && <div className="mt-0.5 text-xs text-[#7F1D1D]">+ {item.addon_names.join(", ")}</div>}
                        {item.sugar_level && <div className="mt-0.5 text-xs text-gray-400">Sugar: {item.sugar_level}</div>}
                      </div>
                      <div className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">RM{item.line_total.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
                {order.discount_value > 0 ? (
                  <span className="text-xs text-gray-400">Subjumlah RM{order.subtotal.toFixed(2)} · Diskaun −RM{order.discount_value.toFixed(2)}</span>
                ) : <span />}
                <span className="text-lg font-bold tabular-nums text-gray-900">RM{order.total.toFixed(2)}</span>
              </div>
            </div>

            {/* Order type */}
            <div className="px-4 pt-5">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Jenis pesanan</div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: "dine_in" as OrderType, label: "🪑 Dine In" },
                  { key: "take_away" as OrderType, label: "🥡 Take Away" },
                ]).map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={!collectable}
                    onClick={() => setOrderType(opt.key)}
                    className={`rounded-xl border px-3 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
                      orderType === opt.key
                        ? "border-[#7F1D1D] bg-[#7F1D1D] text-white"
                        : "border-gray-200 bg-white text-gray-700 active:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Table (dine in) */}
            {orderType === "dine_in" && (
              <div className="px-4 pt-5">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Nombor meja</div>
                {s.dineInTables.length > 0 && (
                  <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
                    {s.dineInTables.map(t => (
                      <button
                        key={t}
                        type="button"
                        disabled={!collectable}
                        onClick={() => setTable(t)}
                        className={`flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-xl border px-3 text-sm font-bold transition-colors disabled:opacity-50 ${
                          table === t
                            ? "border-amber-500 bg-amber-100 text-amber-900"
                            : "border-gray-200 bg-white text-gray-700 active:bg-gray-50"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  value={table}
                  onChange={e => setTable(cleanLabel(e.target.value))}
                  disabled={!collectable}
                  inputMode="text"
                  placeholder={s.dineInTables.length > 0 ? "Atau taip nombor meja lain" : "Taip nombor meja"}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none placeholder:text-gray-400 focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20 disabled:opacity-50"
                />
              </div>
            )}

            {/* Buzzer */}
            <div className="px-4 pt-5 pb-6">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Nombor buzzer {orderType === "dine_in" ? "(jika tiada meja)" : "(pilihan)"}
              </div>
              <input
                value={buzzer}
                onChange={e => setBuzzer(cleanLabel(e.target.value))}
                disabled={!collectable}
                inputMode="numeric"
                placeholder="cth. 12"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none placeholder:text-gray-400 focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20 disabled:opacity-50"
              />
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-4 py-3 pb-[max(env(safe-area-inset-bottom,12px),12px)]">
        {error && <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        {order && collectable && (
          <div className="mb-2 text-center text-xs text-gray-500">
            Serah ke: <span className="font-semibold text-gray-800">{targetPreview.text}</span>
          </div>
        )}
        {collectable ? (
          <button
            type="button"
            disabled={!canContinue || loading || submitting}
            onClick={() => setStep("method")}
            className="w-full rounded-full bg-[#7F1D1D] py-4 text-base font-semibold text-white active:bg-[#6B1818] disabled:opacity-40"
          >
            {orderType === "dine_in" && !canContinue
              ? "Masukkan nombor meja atau buzzer"
              : `Teruskan ke Bayaran · RM${(order?.total || 0).toFixed(2)}`}
          </button>
        ) : (
          <button type="button" onClick={onClose} className="w-full rounded-full bg-gray-900 py-4 text-base font-semibold text-white">
            Tutup
          </button>
        )}
      </div>
    </div>
  );
}
