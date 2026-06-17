"use client";

// Confirmation / receipt (design README §6). Per the shop's choice there is NO
// live status timeline — orders don't need staff status updates. We show the
// queue number, receipt and items, and tell the customer we'll call their name.

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useOrder, rm } from "../../order-provider";

export default function OrderPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { lastOrder } = useOrder();
  const order = lastOrder && lastOrder.orderId === id ? lastOrder : null;

  const type = order?.type ?? "dine";
  const queue = useMemo(() => {
    const digits = (order?.receipt || id).replace(/\D/g, "").slice(-2) || "42";
    return `${type === "dine" ? "T" : "A"}${digits}`;
  }, [order?.receipt, id, type]);
  const eta = type === "dine" ? "8–10 min" : "12–15 min";

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
      <div className="safe-top bg-espresso px-6 pb-8 pt-10 text-center">
        <div className="mx-auto flex h-16 w-16 animate-pop items-center justify-center rounded-full bg-leaf text-[30px] text-cream">✓</div>
        <h1 className="mt-4 font-display text-[24px] font-semibold tracking-[-.01em] text-cream">Order confirmed</h1>
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
            <span className="rounded-full bg-leaf/12 px-2.5 py-1 font-sans text-[11px] font-semibold text-leaf">Received</span>
          </div>
        </div>
      </div>

      {/* call-your-name note */}
      <div className="flex-1 px-5 pt-5">
        <div className="flex items-center gap-3 rounded-[18px] border border-hairline bg-card p-4 shadow-card">
          <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[13px] bg-cream-2 text-[20px]">📣</div>
          <div>
            <div className="font-sans text-[14px] font-semibold text-espresso">We&apos;ll call your name when it&apos;s ready</div>
            <div className="mt-0.5 font-sans text-[12px] text-muted">Usually about {eta}. {type === "dine" ? "We'll bring it to your table." : "Listen out at the counter."}</div>
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
      <div className="safe-bottom flex-none px-5 pb-5 pt-3">
        <div className="flex gap-2.5">
          <Link href="/rewards" className="flex-1 rounded-[14px] border border-hairline bg-card py-3.5 text-center font-sans text-[14px] font-semibold text-espresso active:scale-[.99]">My points</Link>
          <Link href="/menu" className="flex-1 rounded-[14px] bg-maroon py-3.5 text-center font-sans text-[14px] font-semibold text-cream active:scale-[.99]">Order again</Link>
        </div>
      </div>
    </div>
  );
}
