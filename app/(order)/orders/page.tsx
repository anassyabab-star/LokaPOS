"use client";

// Order history — every order on the customer's phone (last 30 days), newest
// first. Tap an order to open its tracker.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOrder, rm } from "../order-provider";

type Row = { id: string; receipt_number: string | null; short_number?: string; status: string | null; total: number | null; created_at: string };

const STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Awaiting payment",
  pending: "In queue",
  preparing: "Being prepared",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};
const ACTIVE = new Set(["awaiting_payment", "pending", "preparing", "ready"]);

function shortNo(o: Row) {
  if (o.short_number) return o.short_number;
  const m = String(o.receipt_number || "").match(/-(\d+)$/);
  return m ? m[1].padStart(3, "0") : (o.receipt_number || o.id.slice(0, 6));
}

export default function OrdersPage() {
  const router = useRouter();
  const { contact } = useOrder();
  const phone = contact.phone;
  const [orders, setOrders] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!phone) { setOrders([]); return; }
    let live = true;
    fetch(`/api/public/orders/track?phone=${encodeURIComponent(phone)}`, { cache: "no-store" })
      .then(r => r.json())
      .then(d => { if (!live) return; if (d?.error) setError(d.error); setOrders(Array.isArray(d?.orders) ? d.orders : []); })
      .catch(() => { if (live) { setError("No connection."); setOrders([]); } });
    return () => { live = false; };
  }, [phone]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-cream">
      <div className="safe-top flex flex-none items-center gap-3.5 px-5 pb-3.5 pt-5">
        <button onClick={() => router.push("/rewards")} className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border border-hairline bg-card text-[18px] text-espresso active:scale-95" aria-label="Back">←</button>
        <h1 className="font-display text-[20px] font-semibold tracking-[-.01em] text-espresso">My orders</h1>
      </div>

      <div className="no-scrollbar flex-1 space-y-2 overflow-auto px-5 pb-8">
        {!phone ? (
          <div className="rounded-[18px] bg-espresso p-5">
            <div className="font-display text-[18px] font-semibold text-cream">Sign in to see your orders</div>
            <p className="mt-1.5 font-sans text-[13px] text-[#C9A88F]">Your order history follows your phone number.</p>
            <Link href="/signin?next=/orders" className="mt-4 inline-block rounded-[14px] bg-melon px-5 py-2.5 font-sans text-[14px] font-semibold text-espresso active:scale-[.98]">Sign in</Link>
          </div>
        ) : orders === null ? (
          <p className="px-1 font-sans text-[13px] text-muted">Loading…</p>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-4xl">☕</div>
            <p className="mt-3 font-sans text-[14px] text-muted">{error || "No orders in the last 30 days."}</p>
            <Link href="/menu" className="mt-4 inline-block rounded-[12px] bg-maroon px-5 py-2.5 font-sans text-[13px] font-semibold text-cream">Order now</Link>
          </div>
        ) : (
          orders.map(o => {
            const st = String(o.status || "").toLowerCase();
            const active = ACTIVE.has(st);
            const when = new Date(o.created_at).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
            return (
              <Link key={o.id} href={`/order/${o.id}`} className="flex items-center gap-3 rounded-[14px] border border-hairline bg-card px-4 py-3 shadow-card active:scale-[.99]">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-[12px] bg-cream-2 font-display text-[13px] font-semibold text-maroon">#{shortNo(o)}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-sans text-[14px] font-semibold text-espresso">{STATUS_LABEL[st] || st || "—"}</div>
                  <div className="font-sans text-[12px] text-muted">{when} · {o.receipt_number}</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-[14px] font-semibold text-espresso">{rm(Number(o.total || 0))}</div>
                  {active && <div className="font-sans text-[11px] font-semibold text-maroon">Track →</div>}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
