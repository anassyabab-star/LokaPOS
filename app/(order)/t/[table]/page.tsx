"use client";

// Welcome — QR entry (design README §1). A table QR points here (e.g. /t/7);
// we capture the table number and send the guest into the menu. Dark screen.

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useOrder } from "../../order-provider";

export default function WelcomePage() {
  const params = useParams<{ table: string }>();
  const table = decodeURIComponent(params.table || "").replace(/[^\w]/g, "");
  const { setTable, setOrderType } = useOrder();

  useEffect(() => {
    if (table) { setTable(table); setOrderType("dine"); }
  }, [table]);

  return (
    <div className="safe-top flex min-h-[100dvh] animate-fadeIn flex-col bg-espresso">
      <div className="relative flex flex-1 flex-col justify-center overflow-hidden px-9">
        {/* decorative concentric circles */}
        <div className="pointer-events-none absolute -right-10 top-6 h-[200px] w-[200px] rounded-full border border-cream/[0.08]" />
        <div className="pointer-events-none absolute right-0 top-16 h-[120px] w-[120px] rounded-full border border-cream/[0.08]" />

        <div className="font-display text-[22px] font-bold tracking-wordmark text-cream">LOKA</div>
        <div className="mt-1.5 font-sans text-[11px] font-medium uppercase tracking-[.26em] text-muted-3">Coffee &amp; Fruits</div>
        <div className="my-7 h-px bg-cream/[0.14]" />

        <div className="inline-flex items-center gap-2 self-start rounded-full border border-melon/30 bg-melon/[0.16] px-3 py-1.5 font-sans text-[11px] font-semibold tracking-[.06em] text-melon-soft">
          <span className="h-[7px] w-[7px] rounded-full bg-melon" /> QR SCANNED
        </div>

        <h1 className="mt-[18px] font-display text-[34px] font-semibold leading-[1.08] tracking-[-.02em] text-cream">
          You&apos;re at<br />Table {table || "—"}.
        </h1>
        <p className="mt-3.5 font-sans text-[15px] leading-relaxed text-[#C9A88F]">
          Dine-in detected at Loka Bangi. Order straight from your seat — no queue.
        </p>

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
