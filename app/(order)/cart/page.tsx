"use client";

// Cart (design_handoff_loka_ordering README §4). Order-type toggle, editable
// line items, sticky summary → Checkout. Reads the shared OrderProvider cart.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOrder, rm } from "../order-provider";

export default function CartPage() {
  const router = useRouter();
  const { cart, setQty, removeLine, subtotal, cartCount, orderType, setOrderType, table, member } = useOrder();

  const pointsEarned = Math.round(subtotal); // 1 pt / RM1 (earned only when signed in)

  const note =
    orderType === "dine"
      ? `Served to ${table ? `Table ${table}` : "your table"} · Loka Bangi`
      : "Pick up at the counter · Loka Bangi";

  return (
    <div className="flex min-h-[100dvh] flex-col bg-cream">
      {/* header */}
      <div className="safe-top flex flex-none items-center gap-3.5 px-5 pb-3.5 pt-5">
        <button
          onClick={() => router.push("/menu")}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border border-hairline bg-card text-[18px] text-espresso active:scale-95"
          aria-label="Back"
        >
          ←
        </button>
        <h1 className="font-display text-[20px] font-semibold tracking-[-.01em] text-espresso">Your order</h1>
      </div>

      {cartCount === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="text-4xl">🧋</div>
          <p className="mt-4 font-sans text-[15px] font-semibold text-espresso">Your order is empty</p>
          <p className="mt-1 font-sans text-[13px] text-muted">Add a drink or two to get started.</p>
          <Link href="/menu" className="mt-5 rounded-[14px] bg-maroon px-6 py-3 font-sans text-[14px] font-semibold text-cream active:scale-[.99]">
            Browse menu
          </Link>
        </div>
      ) : (
        <>
          <div className="no-scrollbar flex-1 overflow-auto px-5 pb-5">
            {/* order-type toggle */}
            <div className="flex gap-1 rounded-[14px] bg-[#EFE6D6] p-1">
              {(["dine", "takeaway"] as const).map(t => {
                const active = orderType === t;
                return (
                  <button
                    key={t}
                    onClick={() => setOrderType(t)}
                    className={`flex-1 rounded-[11px] py-2.5 font-sans text-[13px] font-semibold transition ${
                      active ? "bg-card text-espresso shadow-card" : "text-muted"
                    }`}
                  >
                    {t === "dine" ? "Dine-in" : "Takeaway"}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 px-1 font-sans text-[12px] text-muted">{note}</p>

            {/* line items */}
            <div className="mt-4">
              {cart.map(line => (
                <div key={line.lineId} className="flex gap-3.5 border-t border-hairline py-4 first:border-t-0">
                  <div className="h-[56px] w-[56px] flex-none rounded-[14px]" style={{ background: line.swatch }} />
                  <div className="min-w-0 flex-1">
                    <div className="font-sans text-[15px] font-semibold text-espresso">{line.name}</div>
                    {line.optionsText && <div className="mt-0.5 font-sans text-[12px] leading-snug text-muted">{line.optionsText}</div>}
                    <div className="mt-2.5 flex items-center gap-3">
                      <div className="flex items-center gap-2.5 rounded-[12px] border border-hairline bg-card px-2.5 py-1.5">
                        <button onClick={() => setQty(line.lineId, line.qty - 1)} className="h-6 w-6 text-[16px] leading-none text-muted active:scale-95" aria-label="Decrease">−</button>
                        <span className="min-w-4 text-center font-display text-[14px] font-semibold text-espresso">{line.qty}</span>
                        <button onClick={() => setQty(line.lineId, line.qty + 1)} className="h-6 w-6 text-[16px] leading-none text-espresso active:scale-95" aria-label="Increase">+</button>
                      </div>
                      <button onClick={() => removeLine(line.lineId)} className="font-sans text-[12px] font-semibold text-muted underline-offset-2 active:opacity-60">Remove</button>
                    </div>
                  </div>
                  <span className="whitespace-nowrap font-display text-[14px] font-semibold text-espresso">{rm(line.unitPrice * line.qty)}</span>
                </div>
              ))}
            </div>

            {/* add more */}
            <Link
              href="/menu"
              className="mt-2 flex items-center justify-center gap-2 rounded-[14px] border border-dashed border-hairline py-3.5 font-sans text-[13px] font-semibold text-maroon active:scale-[.99]"
            >
              + Add more items
            </Link>
          </div>

          {/* sticky summary */}
          <div className="safe-bottom flex-none border-t border-hairline bg-cream px-5 pb-5 pt-4">
            <div className="rounded-[18px] border border-hairline bg-card p-4 shadow-card">
              <div className="flex items-center justify-between font-sans text-[14px]">
                <span className="text-muted">Subtotal</span>
                <span className="font-display font-semibold text-espresso">{rm(subtotal)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between font-sans text-[13px]">
                <span className="text-muted">{member?.signedIn ? "You'll earn" : "Sign in to earn"}</span>
                <span className="font-display font-semibold text-leaf">+{pointsEarned} pts</span>
              </div>
              <Link
                href="/checkout"
                className="mt-4 flex items-center justify-between rounded-[16px] bg-maroon px-[18px] py-[15px] transition active:scale-[.99]"
              >
                <span className="font-sans text-[15px] font-semibold text-cream">Checkout</span>
                <span className="font-display text-[15px] font-semibold text-cream">{rm(subtotal)}</span>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
