"use client";

// Confirmation + live Track on one route (design README §6 + §7).
// Receipt is rendered from the `lastOrder` snapshot; live status is polled from
// /api/public/orders/track (order_id + phone). README suggests Supabase Realtime;
// polling a server route is the guest-safe equivalent with the existing backend.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useOrder, rm } from "../../order-provider";

const STEPS = [
  { title: "Order received", sub: "Sent to the kitchen" },
  { title: "Preparing your order", sub: "Barista is brewing it now" },
  { title: "Almost ready", sub: "Final touches & plating" },
  { title: "Ready", sub: "Come grab it" },
];

function statusToStep(s: string): number {
  const v = (s || "").toLowerCase();
  if (v === "ready" || v === "completed") return 3;
  if (v === "preparing") return 1;
  return 0; // pending / received
}

export default function OrderPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { lastOrder } = useOrder();
  const [status, setStatus] = useState<string>("pending");
  const order = lastOrder && lastOrder.orderId === id ? lastOrder : null;

  // Poll live status from the backend.
  useEffect(() => {
    if (!order?.phone) return;
    let live = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/public/orders/track?order_id=${id}&phone=${encodeURIComponent(order.phone)}`, { cache: "no-store" });
        const d = await res.json();
        if (live && d.order?.status) setStatus(d.order.status);
      } catch {}
    };
    void poll();
    const t = setInterval(poll, 5000);
    return () => { live = false; clearInterval(t); };
  }, [id, order?.phone]);

  const step = statusToStep(status);
  const isReady = step >= 3;
  const type = order?.type ?? "dine";
  const queue = useMemo(() => {
    const digits = (order?.receipt || id).replace(/\D/g, "").slice(-2) || "42";
    return `${type === "dine" ? "T" : "A"}${digits}`;
  }, [order?.receipt, id, type]);

  const etaByStep = type === "dine"
    ? ["~8 min", "~5 min", "Any minute", "Ready"]
    : ["~13 min", "~7 min", "Any minute", "Ready"];
  const eta = etaByStep[step];

  if (!order) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-espresso px-6 text-center">
        <p className="font-sans text-[15px] text-cream">Order details not found on this device.</p>
        <Link href="/menu" className="mt-5 rounded-[14px] bg-maroon px-6 py-3 font-sans text-[14px] font-semibold text-cream">Back to menu</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-cream">
      {/* confirmation hero (dark) */}
      <div className="safe-top bg-espresso px-6 pb-7 pt-8 text-center">
        <div className="mx-auto flex h-16 w-16 animate-pop items-center justify-center rounded-full bg-leaf text-[30px] text-cream">✓</div>
        <h1 className="mt-4 font-display text-[24px] font-semibold tracking-[-.01em] text-cream">
          {isReady ? "Your order is ready!" : "Order confirmed"}
        </h1>
        <p className="mt-1.5 font-sans text-[13px] text-[#C9A88F]">
          {order.payment === "online" ? "Payment received. We're on it." : "Show your queue number at the counter to pay."}
        </p>
      </div>

      {/* ticket */}
      <div className="-mt-4 px-5">
        <div className="rounded-[18px] border border-hairline bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-sans text-[11px] font-semibold uppercase tracking-label text-muted-2">Queue no.</div>
              <div className="font-display text-[34px] font-semibold leading-none text-maroon">{queue}</div>
            </div>
            <div className="text-right">
              <div className="font-sans text-[11px] font-semibold uppercase tracking-label text-muted-2">Order</div>
              <div className="font-display text-[15px] font-semibold text-espresso">{order.receipt}</div>
            </div>
          </div>
          <div className="my-4 border-t border-dashed border-hairline" />
          <div className="flex items-center justify-between">
            <span className="font-sans text-[13px] text-muted">{type === "dine" ? "Dine-in" : "Takeaway"}</span>
            <span className="rounded-full bg-melon/12 px-2.5 py-1 font-sans text-[11px] font-semibold text-melon">{STEPS[step].title}</span>
          </div>
          <div className="mt-1 font-sans text-[12px] text-muted">{isReady ? "Ready now" : `Ready in about ${eta} · we'll buzz you`}</div>
        </div>
      </div>

      {/* live timeline */}
      <div className="flex-1 px-5 pt-5">
        <div className="rounded-[18px] border border-hairline bg-card p-5 shadow-card">
          <div className="mb-1 flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isReady ? "bg-leaf" : "bg-melon animate-blink"}`} />
            <span className="font-sans text-[12px] font-semibold uppercase tracking-label text-muted-2">{isReady ? "Ready" : "Live"}</span>
          </div>
          <div className="mt-3">
            {STEPS.map((s, i) => {
              const done = i < step || (isReady && i === step);
              const active = i === step && !isReady;
              const last = i === STEPS.length - 1;
              return (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] ${done ? "bg-maroon text-cream" : active ? "bg-maroon text-cream animate-pulse-ring" : "border border-hairline bg-card text-transparent"}`}>{done ? "✓" : "●"}</span>
                    {!last && <span className={`my-1 w-[2px] flex-1 ${i < step ? "bg-maroon" : "bg-hairline"}`} style={{ minHeight: 28 }} />}
                  </div>
                  <div className={`pb-4 ${i > step ? "opacity-50" : ""}`}>
                    <div className="font-sans text-[14px] font-semibold text-espresso">{s.title}</div>
                    <div className="font-sans text-[12px] text-muted">{s.sub}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* items summary */}
        <div className="mt-3.5 rounded-[18px] border border-hairline bg-card p-4 shadow-card">
          {order.items.map((it, i) => (
            <div key={i} className="flex justify-between gap-3 py-1 font-sans text-[13px]">
              <span className="min-w-0 text-muted"><span className="text-espresso">{it.qty}×</span> {it.name}{it.optionsText ? ` · ${it.optionsText}` : ""}</span>
              <span className="whitespace-nowrap font-display font-semibold text-espresso">{rm(it.unitPrice * it.qty)}</span>
            </div>
          ))}
          <div className="mt-2 flex justify-between border-t border-hairline pt-2">
            <span className="font-sans text-[13px] text-muted">{order.payment === "online" ? "Paid" : "Pay at counter"}</span>
            <span className="font-display text-[15px] font-semibold text-espresso">{rm(order.total)}</span>
          </div>
        </div>
      </div>

      {/* actions */}
      <div className="safe-bottom flex-none gap-2.5 px-5 pb-5 pt-3">
        <div className="flex gap-2.5">
          <Link href="/rewards" className="flex-1 rounded-[14px] border border-hairline bg-card py-3.5 text-center font-sans text-[14px] font-semibold text-espresso active:scale-[.99]">My points</Link>
          <Link href="/menu" className="flex-1 rounded-[14px] bg-maroon py-3.5 text-center font-sans text-[14px] font-semibold text-cream active:scale-[.99]">Order again</Link>
        </div>
      </div>
    </div>
  );
}
