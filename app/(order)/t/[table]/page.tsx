"use client";

// Welcome — QR entry (design README §1). A table QR points here (e.g. /t/7);
// we capture the table number and send the guest into the menu. Dark screen.
// The table is checked against the store's configured tables
// (store_settings.dine_in_tables) so a stray/old QR can't attach an order to a
// table that doesn't exist.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useOrder } from "../../order-provider";

type StoreStatus = { is_open: boolean; dine_in_tables?: string[] };

export default function WelcomePage() {
  const params = useParams<{ table: string }>();
  const table = decodeURIComponent(params.table || "").replace(/[^\w-]/g, "").slice(0, 10);
  const { setTable, setOrderType, member } = useOrder();
  const [store, setStore] = useState<StoreStatus | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/public/store-status", { cache: "no-store" })
      .then(r => r.json())
      .then((d: StoreStatus) => { if (live) setStore(d); })
      .catch(() => { if (live) setStore({ is_open: true }); });
    return () => { live = false; };
  }, []);

  const tables = store?.dine_in_tables;
  const tableKnown = !table ? false : !tables || tables.length === 0 ? true : tables.includes(table);
  const checked = store !== null;
  const valid = checked && tableKnown;
  const closed = checked && store?.is_open === false;

  useEffect(() => {
    if (valid) { setTable(table); setOrderType("dine"); }
  }, [valid, table]);

  return (
    <div className="safe-top flex min-h-[100dvh] animate-fadeIn flex-col bg-espresso">
      <div className="relative flex flex-1 flex-col justify-center overflow-hidden px-9">
        {/* decorative concentric circles */}
        <div className="pointer-events-none absolute -right-10 top-6 h-[200px] w-[200px] rounded-full border border-cream/[0.08]" />
        <div className="pointer-events-none absolute right-0 top-16 h-[120px] w-[120px] rounded-full border border-cream/[0.08]" />

        <div className="font-display text-[22px] font-bold tracking-wordmark text-cream">LOKA</div>
        <div className="mt-1.5 font-sans text-[11px] font-medium uppercase tracking-[.26em] text-muted-3">Coffee &amp; Fruits</div>
        <div className="my-7 h-px bg-cream/[0.14]" />

        {!checked ? (
          <>
            <div className="h-7 w-32 animate-pulse rounded-full bg-cream/10" />
            <div className="mt-5 h-10 w-56 animate-pulse rounded bg-cream/10" />
            <div className="mt-3 h-10 w-40 animate-pulse rounded bg-cream/10" />
          </>
        ) : !tableKnown ? (
          <>
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-melon/30 bg-melon/[0.16] px-3 py-1.5 font-sans text-[11px] font-semibold tracking-[.06em] text-melon-soft">
              <span className="h-[7px] w-[7px] rounded-full bg-melon" /> UNKNOWN QR
            </div>
            <h1 className="mt-[18px] font-display text-[34px] font-semibold leading-[1.08] tracking-[-.02em] text-cream">
              Table {table || "—"}<br />not found.
            </h1>
            <p className="mt-3.5 font-sans text-[15px] leading-relaxed text-[#C9A88F]">
              This QR may be outdated. You can still order for take away, or ask our staff for the right table QR.
            </p>
            <Link href="/t/takeaway" className="mt-9 flex items-center justify-center gap-2 rounded-[18px] bg-maroon py-[18px] font-sans text-[16px] font-semibold text-cream active:scale-[.98]">
              Order take away →
            </Link>
          </>
        ) : (
          <>
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-melon/30 bg-melon/[0.16] px-3 py-1.5 font-sans text-[11px] font-semibold tracking-[.06em] text-melon-soft">
              <span className="h-[7px] w-[7px] rounded-full bg-melon" /> QR SCANNED
            </div>

            <h1 className="mt-[18px] font-display text-[34px] font-semibold leading-[1.08] tracking-[-.02em] text-cream">
              You&apos;re at<br />Table {table}.
            </h1>
            <p className="mt-3.5 font-sans text-[15px] leading-relaxed text-[#C9A88F]">
              Dine-in detected at Loka Bangi. Order straight from your seat, then pay at the counter with your Order ID.
            </p>

            {closed && (
              <div className="mt-5 rounded-[14px] border border-melon/30 bg-melon/10 px-4 py-3 font-sans text-[13px] text-melon-soft">
                ⏰ We&rsquo;re closed right now. You can browse the menu, but orders are only accepted during opening hours.
              </div>
            )}

            <Link href="/menu" className="mt-9 flex items-center justify-center gap-2 rounded-[18px] bg-maroon py-[18px] font-sans text-[16px] font-semibold text-cream active:scale-[.98]">
              Start your order →
            </Link>
            {!member?.signedIn && (
              <Link href="/signin?next=/menu" className="mt-3 rounded-[18px] border border-cream/[0.18] py-[15px] text-center font-sans text-[14px] font-semibold text-[#C9A88F] active:scale-[.99]">
                Sign in to earn points
              </Link>
            )}
          </>
        )}
      </div>
      <div className="safe-bottom py-5 text-center font-sans text-[11px] text-muted-3">Loka Bangi · 8am–11pm</div>
    </div>
  );
}
