"use client";

// Take-away QR entry (the counter / door QR points here). Clears any table
// from a previous visit and sets the order type before sending the guest in.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useOrder } from "../../order-provider";

export default function TakeawayWelcomePage() {
  const { setTable, setOrderType } = useOrder();
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    setTable(null);
    setOrderType("takeaway");
  }, []);

  useEffect(() => {
    let live = true;
    fetch("/api/public/store-status", { cache: "no-store" })
      .then(r => r.json())
      .then(d => { if (live && d?.is_open === false) setClosed(true); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  return (
    <div className="safe-top flex min-h-[100dvh] animate-fadeIn flex-col bg-espresso">
      <div className="relative flex flex-1 flex-col justify-center overflow-hidden px-9">
        <div className="pointer-events-none absolute -right-10 top-6 h-[200px] w-[200px] rounded-full border border-cream/[0.08]" />
        <div className="pointer-events-none absolute right-0 top-16 h-[120px] w-[120px] rounded-full border border-cream/[0.08]" />

        <div className="font-display text-[22px] font-bold tracking-wordmark text-cream">LOKA</div>
        <div className="mt-1.5 font-sans text-[11px] font-medium uppercase tracking-[.26em] text-muted-3">Coffee &amp; Fruits</div>
        <div className="my-7 h-px bg-cream/[0.14]" />

        <div className="inline-flex items-center gap-2 self-start rounded-full border border-melon/30 bg-melon/[0.16] px-3 py-1.5 font-sans text-[11px] font-semibold tracking-[.06em] text-melon-soft">
          <span className="h-[7px] w-[7px] rounded-full bg-melon" /> TAKE AWAY
        </div>

        <h1 className="mt-[18px] font-display text-[34px] font-semibold leading-[1.08] tracking-[-.02em] text-cream">
          Order now,<br />pick up at the counter.
        </h1>
        <p className="mt-3.5 font-sans text-[15px] leading-relaxed text-[#C9A88F]">
          Build your order here, pay at the counter with your Order ID, and we&apos;ll buzz you when it&apos;s ready.
        </p>

        {closed && (
          <div className="mt-5 rounded-[14px] border border-melon/30 bg-melon/10 px-4 py-3 font-sans text-[13px] text-melon-soft">
            ⏰ We&rsquo;re closed right now. You can browse the menu, but orders are only accepted during opening hours.
          </div>
        )}

        <Link href="/menu" className="mt-9 flex items-center justify-center gap-2 rounded-[18px] bg-maroon py-[18px] font-sans text-[16px] font-semibold text-cream active:scale-[.98]">
          Start your order →
        </Link>
        <Link href="/signin?next=/menu" className="mt-3 rounded-[18px] border border-cream/[0.18] py-[15px] text-center font-sans text-[14px] font-semibold text-[#C9A88F] active:scale-[.99]">
          Sign in to earn points
        </Link>
      </div>
      <div className="safe-bottom py-5 text-center font-sans text-[11px] text-muted-3">Loka Bangi · 8am–11pm</div>
    </div>
  );
}
