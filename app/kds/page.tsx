"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { OrderTargetBadge } from "@/app/pos/components/order-target-badge";

// ============================================================================
// Kitchen Display — one shared screen for kitchen + service crew.
//   BARU (pending) → SEDANG BUAT (preparing) → SIAP — SERAH (ready) → Selesai
// Only PAID orders appear (the cashier collects first). Sorted FCFS from the
// moment the order was paid. "Siap!" also notifies the customer (WhatsApp +
// their order tracker) through the shared state machine.
// ============================================================================

type KdsItem = {
  id: string;
  name: string;
  variant: string | null;
  sugar: string | null;
  addons: string[];
  qty: number;
  price: number;
};

type KdsOrder = {
  id: string;
  receipt_number: string;
  short_number?: string;
  customer_name: string;
  status: string;
  order_source: string | null;
  payment_status: string | null;
  order_type?: string | null;
  table_number?: string | null;
  buzzer_number?: string | null;
  created_at: string;
  paid_at?: string | null;
  queue_since?: string | null;
  elapsed_seconds: number;
  items: KdsItem[];
};

type MobileFilter = "all" | "pending" | "preparing" | "ready";

const POLL_INTERVAL = 5000;
const URGENT_AFTER_SECONDS = 300;

function formatElapsed(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function shortNo(order: KdsOrder) {
  if (order.short_number) return order.short_number;
  const m = String(order.receipt_number || "").match(/-(\d+)$/);
  return m ? m[1].padStart(3, "0") : String(order.receipt_number || order.id.slice(0, 4));
}

export default function KdsPage() {
  const [orders, setOrders] = useState<KdsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [completedFlash, setCompletedFlash] = useState<string | null>(null);
  const [mobileFilter, setMobileFilter] = useState<MobileFilter>("all");
  const [toast, setToast] = useState<string | null>(null);

  const prevOrderIds = useRef<Set<string>>(new Set());
  const soundRef = useRef(true);
  const actxRef = useRef<AudioContext | null>(null);
  const alertBufRef = useRef<AudioBuffer | null>(null);

  useEffect(() => { soundRef.current = soundEnabled; }, [soundEnabled]);

  // ━━━ Sound ━━━
  useEffect(() => {
    function initAudio() {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        actxRef.current = ctx;
        const sr = ctx.sampleRate;
        const len = Math.floor(sr * 0.3);
        const buf = ctx.createBuffer(1, len, sr);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          const t = i / sr;
          const beep1 = t < 0.1 ? Math.sin(2 * Math.PI * 880 * t) * 0.3 * (1 - t / 0.1) : 0;
          const beep2 = t > 0.15 && t < 0.25 ? Math.sin(2 * Math.PI * 1100 * (t - 0.15)) * 0.3 * (1 - (t - 0.15) / 0.1) : 0;
          ch[i] = beep1 + beep2;
        }
        alertBufRef.current = buf;
        if (ctx.state === "suspended") ctx.resume();
      } catch { /* silent */ }
    }
    function unlock() { if (!actxRef.current) initAudio(); else if (actxRef.current.state === "suspended") actxRef.current.resume(); }
    document.addEventListener("touchstart", unlock, { once: true });
    document.addEventListener("click", unlock, { once: true });
    initAudio();
    return () => {
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("click", unlock);
      if (actxRef.current && actxRef.current.state !== "closed") actxRef.current.close().catch(() => {});
    };
  }, []);

  const playAlert = useCallback(() => {
    if (!soundRef.current) return;
    try {
      const ctx = actxRef.current; const buf = alertBufRef.current;
      if (!ctx || !buf) return;
      if (ctx.state === "suspended") ctx.resume();
      const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start(0);
    } catch { /* silent */ }
  }, []);

  // ━━━ Polling ━━━
  const fetchOrders = useCallback(async (isInitial = false) => {
    try {
      const res = await fetch("/api/kds", { cache: "no-store" });
      if (!res.ok) { setError("Gagal load orders"); return; }
      const data = await res.json();
      const newOrders: KdsOrder[] = data.orders || [];
      setOrders(newOrders);
      setError(null);

      if (!isInitial) {
        const newIds = new Set(newOrders.map(o => o.id));
        for (const id of newIds) {
          if (!prevOrderIds.current.has(id)) { playAlert(); break; }
        }
      }
      prevOrderIds.current = new Set(newOrders.map(o => o.id));
    } catch {
      setError("Connection error");
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [playAlert]);

  useEffect(() => {
    void fetchOrders(true);
    const interval = setInterval(() => void fetchOrders(), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!completedFlash) return;
    const t = setTimeout(() => setCompletedFlash(null), 1500);
    return () => clearTimeout(t);
  }, [completedFlash]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ━━━ Actions ━━━
  async function updateStatus(orderId: string, newStatus: string) {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setToast(data?.error || `Gagal kemaskini (${res.status})`);
      } else if (newStatus === "completed") {
        setCompletedFlash(orderId);
      }
      await fetchOrders();
    } catch {
      setToast("Tiada sambungan. Cuba lagi.");
    } finally {
      setUpdatingId(null);
    }
  }

  function getNextStatus(status: string): { next: string; label: string; color: string } | null {
    switch (status) {
      case "pending": return { next: "preparing", label: "Mula Buat", color: "bg-blue-600 active:bg-blue-700" };
      case "preparing": return { next: "ready", label: "Siap!", color: "bg-green-600 active:bg-green-700" };
      case "ready": return { next: "completed", label: "Selesai (Serah)", color: "bg-gray-600 active:bg-gray-700" };
      default: return null;
    }
  }

  // ━━━ Grouped orders ━━━
  const pending = orders.filter(o => o.status === "pending");
  const preparing = orders.filter(o => o.status === "preparing");
  const ready = orders.filter(o => o.status === "ready");

  // Mobile filtered orders
  const mobileOrders = mobileFilter === "all" ? orders
    : orders.filter(o => o.status === mobileFilter);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-3 py-2.5 md:px-4 md:py-3">
        <div className="flex items-center gap-2 md:gap-3">
          <h1 className="text-base md:text-lg font-bold tracking-tight">🍳 Kitchen</h1>
          <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[11px] font-medium text-gray-400">
            {orders.length}
          </span>
          {ready.length > 0 && (
            <span className="hidden rounded-full bg-green-600 px-2 py-0.5 text-[11px] font-bold text-white sm:inline">
              {ready.length} sedia diserah
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-[11px] text-red-400">{error}</span>}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              soundEnabled ? "bg-green-900/50 text-green-400" : "bg-gray-800 text-gray-500"
            }`}
          >
            {soundEnabled ? "🔔" : "🔇"}
          </button>
          <button
            onClick={() => void fetchOrders()}
            className="rounded-lg bg-gray-800 px-2.5 py-1.5 text-[11px] font-medium text-gray-300 active:bg-gray-700"
          >
            ↻
          </button>
          <a href="/pos" className="hidden md:block rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200">
            ← POS
          </a>
        </div>
      </div>

      {/* Mobile filter tabs — visible on phone only */}
      <div className="flex border-b border-gray-800 md:hidden">
        {([
          { key: "all" as MobileFilter, label: "Semua", count: orders.length },
          { key: "pending" as MobileFilter, label: "Baru", count: pending.length },
          { key: "preparing" as MobileFilter, label: "Buat", count: preparing.length },
          { key: "ready" as MobileFilter, label: "Siap", count: ready.length },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setMobileFilter(tab.key)}
            className={`flex-1 py-3 text-center text-xs font-semibold transition-colors relative ${
              mobileFilter === tab.key
                ? "text-white"
                : "text-gray-500"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                tab.key === "pending" ? "bg-amber-500 text-white" :
                tab.key === "preparing" ? "bg-blue-500 text-white" :
                tab.key === "ready" ? "bg-green-500 text-white" :
                "bg-gray-700 text-gray-300"
              }`}>
                {tab.count}
              </span>
            )}
            {mobileFilter === tab.key && (
              <div className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-white" />
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-32">
          <div className="text-sm text-gray-500">Memuatkan orders...</div>
        </div>
      )}

      {/* Empty state */}
      {!loading && orders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-32">
          <div className="text-6xl mb-4">☕</div>
          <div className="text-lg font-medium text-gray-500">Tiada order aktif</div>
          <div className="text-sm text-gray-600 mt-1">Order yang telah dibayar akan muncul di sini secara automatik</div>
        </div>
      )}

      {!loading && orders.length > 0 && (
        <>
          {/* ━━━ DESKTOP: 3-column layout ━━━ */}
          <div className="hidden md:grid md:grid-cols-3 min-h-[calc(100vh-57px)]">
            <DesktopColumn
              title="BARU" count={pending.length} color="amber" orders={pending}
              now={now} updatingId={updatingId} completedFlash={completedFlash}
              onAction={(id) => updateStatus(id, "preparing")}
              actionLabel="Mula Buat" actionColor="bg-blue-600 active:bg-blue-700"
            />
            <DesktopColumn
              title="SEDANG BUAT" count={preparing.length} color="blue" orders={preparing}
              now={now} updatingId={updatingId} completedFlash={completedFlash}
              onAction={(id) => updateStatus(id, "ready")}
              actionLabel="Siap!" actionColor="bg-green-600 active:bg-green-700"
            />
            <DesktopColumn
              title="SIAP — SERAH" count={ready.length} color="green" orders={ready}
              now={now} updatingId={updatingId} completedFlash={completedFlash}
              onAction={(id) => updateStatus(id, "completed")}
              actionLabel="Selesai (Serah)" actionColor="bg-gray-600 active:bg-gray-700"
            />
          </div>

          {/* ━━━ MOBILE: Filtered list ━━━ */}
          <div className="md:hidden pb-4">
            {mobileOrders.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-sm text-gray-600">Tiada order dalam kategori ini</div>
              </div>
            ) : (
              <div className="p-3 space-y-3">
                {mobileOrders.map(order => {
                  const action = getNextStatus(order.status);
                  return (
                    <OrderCard
                      key={order.id}
                      order={order}
                      now={now}
                      updatingId={updatingId}
                      completedFlash={completedFlash}
                      actionLabel={action?.label || ""}
                      actionColor={action?.color || ""}
                      onAction={() => action && updateStatus(order.id, action.next)}
                      showStatusBadge={mobileFilter === "all"}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// ━━━ Desktop Column ━━━
function DesktopColumn({
  title, count, color, orders, now, updatingId, completedFlash,
  onAction, actionLabel, actionColor,
}: {
  title: string; count: number; color: "amber" | "blue" | "green";
  orders: KdsOrder[]; now: number; updatingId: string | null; completedFlash: string | null;
  onAction: (id: string) => void; actionLabel: string; actionColor: string;
}) {
  const headerColors = {
    amber: "bg-amber-600/20 text-amber-400 border-amber-800",
    blue: "bg-blue-600/20 text-blue-400 border-blue-800",
    green: "bg-green-600/20 text-green-400 border-green-800",
  };

  return (
    <div className="flex flex-col border-r border-gray-800 last:border-r-0">
      <div className={`flex items-center justify-between px-4 py-2.5 border-b ${headerColors[color]}`}>
        <span className="text-sm font-bold uppercase tracking-wider">{title}</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold">{count}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {orders.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            now={now}
            updatingId={updatingId}
            completedFlash={completedFlash}
            actionLabel={actionLabel}
            actionColor={actionColor}
            onAction={() => onAction(order.id)}
            showStatusBadge={false}
          />
        ))}
      </div>
    </div>
  );
}

// ━━━ Order Card (shared between mobile & desktop) ━━━
function OrderCard({
  order, now, updatingId, completedFlash,
  actionLabel, actionColor, onAction, showStatusBadge,
}: {
  order: KdsOrder; now: number; updatingId: string | null; completedFlash: string | null;
  actionLabel: string; actionColor: string; onAction: () => void; showStatusBadge: boolean;
}) {
  const since = order.queue_since || order.paid_at || order.created_at;
  const elapsed = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const isUrgent = elapsed > URGENT_AFTER_SECONDS && order.status !== "ready";
  const isFlashing = completedFlash === order.id;
  const isReady = order.status === "ready";

  const statusBadge: Record<string, { label: string; color: string }> = {
    pending: { label: "BARU", color: "bg-amber-500" },
    preparing: { label: "BUAT", color: "bg-blue-500" },
    ready: { label: "SIAP", color: "bg-green-500" },
  };
  const badge = statusBadge[order.status];

  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${
      isFlashing
        ? "border-green-400 bg-green-900/30 scale-95 opacity-50"
        : isReady
          ? "border-green-700/60 bg-gray-900"
          : isUrgent
            ? "border-red-700/50 bg-gray-900"
            : "border-gray-700/50 bg-gray-900"
    }`}>
      {/* Header */}
      <div className={`flex items-center justify-between gap-2 px-3 py-2 ${
        isUrgent ? "bg-red-900/30" : isReady ? "bg-green-900/20" : "bg-gray-800/50"
      }`}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-2xl font-black leading-none tabular-nums text-white">#{shortNo(order)}</span>
          {showStatusBadge && badge && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${badge.color}`}>{badge.label}</span>
          )}
          {order.order_source === "customer_web" && (
            <span className="rounded bg-purple-900/50 px-1.5 py-0.5 text-[10px] font-medium text-purple-300">WEB</span>
          )}
        </div>
        <span className={`shrink-0 text-xs font-mono tabular-nums ${isUrgent ? "text-red-400 font-bold" : "text-gray-400"}`}>
          {formatElapsed(elapsed)}
        </span>
      </div>

      {/* Target (table / buzzer / take away) + customer */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2 pb-1">
        <OrderTargetBadge order={order} dark size="lg" />
        <span className="truncate text-xs text-gray-500">{order.customer_name} · {order.receipt_number}</span>
      </div>

      {/* Items */}
      <div className="px-3 pb-2 pt-1 space-y-1.5">
        {order.items.map((item, idx) => (
          <div key={item.id || idx} className="flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gray-800 text-[11px] font-bold text-gray-300 mt-0.5">
              {item.qty}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-100">
                {item.name}
                {item.variant && <span className="text-gray-400"> ({item.variant})</span>}
              </div>
              {item.sugar && (
                <div className="text-[11px] text-amber-400/80">☕ {item.sugar}</div>
              )}
              {item.addons.length > 0 && (
                <div className="text-[11px] text-blue-400/80">+ {item.addons.join(", ")}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Action button */}
      {actionLabel && (
        <div className="px-3 pb-3">
          <button
            onClick={onAction}
            disabled={updatingId === order.id}
            className={`w-full rounded-lg py-2.5 text-sm font-bold text-white transition-all disabled:opacity-50 ${actionColor}`}
          >
            {updatingId === order.id ? "..." : actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}
