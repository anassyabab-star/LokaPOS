"use client";

// Checkout (design_handoff_loka_ordering README §5). Guest details + collection
// + payment, then places a real order via POST /api/public/orders and snapshots
// it as `lastOrder` for the confirmation/track screen.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrder, rm, normalizeMyPhone, localPhone } from "../order-provider";

type CouponPreview = {
  reward_type?: string | null;
  discount_percent?: number | null;
  reward_amount?: number | null;
  max_discount?: number | null;
  min_spend?: number | null;
  scoped?: boolean | null;
};

/**
 * What this coupon takes off, mirroring computeVoucherDiscount on the server.
 * Returns null when the amount cannot be known here — a product- or
 * category-scoped coupon needs the catalog to resolve, so we say "applied at
 * payment" rather than print a number that might be wrong.
 */
function previewDiscount(c: CouponPreview | null | undefined, subtotal: number): number | null {
  if (!c || subtotal <= 0) return null;
  if (c.scoped) return null;
  if (Number(c.min_spend || 0) > subtotal) return 0;

  let discount = 0;
  if (c.reward_type === "percent") {
    discount = subtotal * (Math.max(0, Number(c.discount_percent || 0)) / 100);
    const cap = Number(c.max_discount || 0);
    if (cap > 0) discount = Math.min(discount, cap);
  } else if (c.reward_type === "amount") {
    discount = Math.min(Number(c.reward_amount || 0), subtotal);
  } else {
    return null; // free product — priced at the counter
  }
  return Math.max(0, Math.round(Math.min(discount, subtotal) * 100) / 100);
}

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, subtotal, cartCount, orderType, table, contact, setContact, setLastOrder, clearCart, referral, hydrated, member } = useOrder();
  const [name, setName] = useState(contact.name);
  const [phone, setPhone] = useState(localPhone(contact.phone));
  const [payment, setPayment] = useState<"online" | "counter">("counter");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [couponLabel, setCouponLabel] = useState<string | null>(null);
  const [couponDiscount, setCouponDiscount] = useState<number | null>(null);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  // Which rails the owner has switched on. Checkout used to hard-code both
  // options, so "Pay online now" kept showing after online was turned off in
  // Settings — the customer picked a way to pay that does not exist.
  const [methods, setMethods] = useState<Record<string, boolean> | null>(null);
  // The customer's own rewards, so redeeming points does not mean copying a
  // generated code out of the rewards screen from memory.
  type Wallet = { code: string; label: string; reward_type: string; min_spend: number; expires_at: string | null; applies_here: boolean };
  const [wallet, setWallet] = useState<Wallet[]>([]);
  const [points, setPoints] = useState(0);
  const [earnPerRm, setEarnPerRm] = useState(1);
  const [tiers, setTiers] = useState<{ points: number; amount: number; label: string }[]>([]);
  const [redeeming, setRedeeming] = useState<number | null>(null);
  const [pointsMsg, setPointsMsg] = useState<string | null>(null);

  // Prefer the session phone; fall back to whatever they have typed so a guest
  // who is also a member still sees their rewards.
  const walletPhone = member?.phone || (phone.replace(/[^\d]/g, "").length >= 9 ? normalizeMyPhone(phone) : "");
  useEffect(() => {
    if (!walletPhone) { setWallet([]); return; }
    let live = true;
    fetch(`/api/public/vouchers?phone=${encodeURIComponent(walletPhone)}`, { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (!live) return;
        setWallet(Array.isArray(d?.vouchers) ? d.vouchers : []);
        setPoints(Number(d?.points || 0));
        setEarnPerRm(Number(d?.earn_per_rm || 1));
        setTiers(Array.isArray(d?.redeem_tiers) ? d.redeem_tiers : []);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [walletPhone]);

  useEffect(() => {
    let live = true;
    fetch("/api/public/store-status", { cache: "no-store" })
      .then(r => r.json())
      .then(d => { if (live && d?.payment_methods) setMethods(d.payment_methods as Record<string, boolean>); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // Unknown (still loading, or the call failed) falls back to counter-only:
  // never offer an online payment we cannot be sure is switched on.
  const onlineRails = methods ? ["fpx", "card", "ewallet"].filter(k => methods[k]) : [];
  const onlineEnabled = onlineRails.length > 0;

  // If the customer had online selected and it turns out to be off, move them.
  useEffect(() => {
    if (methods && !onlineEnabled && payment === "online") setPayment("counter");
  }, [methods, onlineEnabled, payment]);

  // The cart is restored from localStorage in an effect, so on the first render
  // after any reload it still looks empty. Redirecting here without waiting
  // threw the customer back to the menu every time they refreshed checkout.
  if (!hydrated) {
    return <div className="min-h-[100dvh] bg-cream" />;
  }

  if (cartCount === 0) {
    // Nothing to check out — bounce to menu.
    if (typeof window !== "undefined") router.replace("/menu");
    return null;
  }

  const eta = orderType === "dine" ? "8–10 min" : "12–15 min";
  // Show what will actually be charged. The server prices the coupon again on
  // the order, so this is a preview — but a preview that matches, instead of
  // the old behaviour where Total and the button kept showing the full price
  // after a coupon was accepted.
  const discount = couponDiscount ?? 0;
  const total = Math.max(0, Math.round((subtotal - discount) * 100) / 100);

  // `preset` lets a tapped wallet voucher apply without waiting for the input
  // state to flush.
  async function applyCoupon(preset?: string) {
    const code = String(preset ?? couponInput).trim().toUpperCase();
    if (!code) return;
    const lookupPhone = member?.phone || phone;
    if (lookupPhone.replace(/[^\d]/g, "").length < 8) {
      setCouponMsg("Enter your phone number first to check the coupon.");
      return;
    }
    setCouponChecking(true); setCouponMsg(null);
    try {
      const canonical = normalizeMyPhone(lookupPhone);
      const res = await fetch(`/api/public/coupon?code=${encodeURIComponent(code)}&phone=${encodeURIComponent(canonical)}`);
      const data = await res.json();
      if (data?.valid) {
        // The server validates ownership and expiry but not the cart, and a
        // coupon under its minimum spend silently discounts nothing. Check it
        // here so the customer is told instead of quietly charged full price.
        const minSpend = Number(data.coupon?.min_spend || 0);
        if (minSpend > subtotal) {
          setCouponCode(null); setCouponLabel(null);
          setCouponMsg(`Spend at least ${rm(minSpend)} to use this coupon. Your order is ${rm(subtotal)}.`);
          return;
        }
        setCouponCode(code);
        setCouponLabel(data.coupon?.label || code);
        setCouponDiscount(previewDiscount(data.coupon, subtotal));
        setCouponMsg(null);
      } else {
        setCouponCode(null); setCouponLabel(null);
        setCouponMsg("This coupon isn't valid for this number.");
      }
    } catch {
      setCouponMsg("Couldn't check the coupon.");
    } finally {
      setCouponChecking(false);
    }
  }

  /**
   * Redeem points into a voucher and apply it to this order in one tap.
   * Previously the customer had to leave checkout, redeem on the rewards
   * screen, remember the generated code and come back for it.
   */
  async function redeemAndApply(tierPoints: number) {
    const lookupPhone = member?.phone || (phone ? normalizeMyPhone(phone) : "");
    if (!lookupPhone) { setPointsMsg("Sign in to use your points."); return; }
    setRedeeming(tierPoints); setPointsMsg(null);
    try {
      const res = await fetch("/api/public/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: lookupPhone, points: tierPoints }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        setPointsMsg("Please sign in again to use your points.");
        return;
      }
      if (!res.ok || !d?.code) { setPointsMsg(d?.error || "Couldn't redeem those points."); return; }
      setPoints(p => Math.max(0, p - tierPoints));
      await applyCoupon(String(d.code));
    } catch {
      setPointsMsg("No connection.");
    } finally {
      setRedeeming(null);
    }
  }

  function clearCoupon() {
    setCouponCode(null); setCouponLabel(null); setCouponDiscount(null); setCouponInput(""); setCouponMsg(null);
  }

  async function placeOrder() {
    // Dine-in used to be placeable with no table, and the customer was still
    // told it would be brought to them.
    if (orderType === "dine" && !table) { setError("Please go back and pick your table, or switch to Takeaway."); return; }
    if (!name.trim()) { setError("Please enter your name"); return; }
    if (phone.replace(/[^\d]/g, "").length < 8) { setError("Invalid phone number"); return; }
    const canonical = normalizeMyPhone(phone);
    setPlacing(true); setError(null);
    setContact({ name: name.trim(), phone: canonical });
    try {
      const res = await fetch("/api/public/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name.trim(),
          customer_phone: canonical,
          payment_method: payment === "online" ? "fpx" : "cash",
          // Dine In (table from the scanned QR) or Take Away — shown to the
          // cashier, the kitchen display and on the cup label.
          order_type: orderType === "dine" ? "dine_in" : "take_away",
          table_number: orderType === "dine" ? table || undefined : undefined,
          coupon_code: couponCode || undefined,
          referral_code: referral || undefined,
          items: cart.map(l => ({
            product_id: l.productId,
            variant_id: l.variantId || undefined,
            addon_ids: l.addonIds,
            qty: l.qty,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.store_closed ? "⏰ We're closed right now. Please try again during opening hours." : data.error || "Couldn't place the order");
      }
      const orderId: string = data.order_id;
      setLastOrder({
        orderId,
        receipt: data.order_number || orderId.slice(0, 8),
        shortNumber: data.short_number || undefined,
        phone: canonical,
        name: name.trim(),
        items: cart.map(l => ({ name: l.name, optionsText: l.optionsText, qty: l.qty, unitPrice: l.unitPrice })),
        subtotal,
        total: Number(data.total ?? total),
        payment,
        type: orderType,
        table,
        createdAt: new Date().toISOString(),
      });
      clearCart();
      if (payment === "online" && data.payment_url) {
        window.location.assign(data.payment_url);
        return;
      }
      // Online was chosen but the gateway gave us no checkout link. The order
      // exists and is unpaid, and there is no in-app way to pay it, so send
      // the customer to the counter explicitly instead of dropping them on a
      // tracker that tells them to finish a payment they cannot start.
      const fellBackToCounter = payment === "online";
      router.push(`/order/${orderId}${fellBackToCounter ? "?payment=unavailable" : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPlacing(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-cream">
      <div className="safe-top flex flex-none items-center gap-3.5 px-5 pb-3.5 pt-5">
        <button onClick={() => router.push("/cart")} className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border border-hairline bg-card text-[18px] text-espresso active:scale-95" aria-label="Back">←</button>
        <h1 className="font-display text-[20px] font-semibold tracking-[-.01em] text-espresso">Checkout</h1>
      </div>

      <div className="no-scrollbar flex-1 space-y-3.5 overflow-auto px-5 pb-5">
        {/* collection */}
        <div className="rounded-[18px] border border-hairline bg-card p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-cream-2 text-[18px]">{orderType === "dine" ? "🍽" : "🥡"}</div>
            <div className="flex-1">
              <div className="font-sans text-[14px] font-semibold text-espresso">{orderType === "dine" ? "Dine-in" : "Takeaway"}</div>
              <div className="font-sans text-[12px] text-muted">{orderType === "dine" ? (table ? `Served to Table ${table} · Loka Bangi` : "No table selected — go back and pick one") : "Pick up at the counter · Loka Bangi"}</div>
            </div>
            <div className="text-right font-display text-[13px] font-semibold text-leaf">{eta}</div>
          </div>
        </div>

        {/* your details (guest) */}
        <div className="rounded-[18px] border border-hairline bg-card p-4 shadow-card">
          <div className="mb-2.5 font-sans text-[12px] font-semibold uppercase tracking-label text-muted-2">Your details</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="w-full rounded-[12px] border border-hairline bg-cream/40 px-3.5 py-3 font-sans text-[14px] text-espresso outline-none placeholder:text-muted-2 focus:border-maroon" />
          <div className="mt-2 flex items-center rounded-[12px] border border-hairline bg-cream/40 focus-within:border-maroon">
            <span className="pl-3.5 pr-2 font-sans text-[14px] text-muted">🇲🇾 +60</span>
            <input value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="12 345 6789" className="w-full bg-transparent py-3 pr-3.5 font-sans text-[14px] text-espresso outline-none placeholder:text-muted-2" />
          </div>
          <p className="mt-2 font-sans text-[11px] text-muted-2">For your receipt &amp; order updates on WhatsApp.</p>
        </div>

        {/* payment */}
        <div className="rounded-[18px] border border-hairline bg-card p-4 shadow-card">
          <div className="mb-2.5 font-sans text-[12px] font-semibold uppercase tracking-label text-muted-2">Payment</div>
          {([
            ...(onlineEnabled
              ? [{
                  key: "online" as const,
                  title: "Pay online now",
                  // Name only the rails that are actually switched on.
                  sub: onlineRails.map(r => (r === "fpx" ? "FPX" : r === "card" ? "Card" : "E-wallet")).join(", "),
                }]
              : []),
            { key: "counter" as const, title: "Pay at counter", sub: "Show your Order ID to the cashier · cash, QR or card" },
          ]).map(opt => {
            const on = payment === opt.key;
            return (
              <button key={opt.key} onClick={() => setPayment(opt.key)} className={`mt-2 flex w-full items-center gap-3 rounded-[14px] border px-3.5 py-3 text-left transition first:mt-0 active:scale-[.99] ${on ? "border-maroon bg-maroon/5" : "border-hairline"}`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${on ? "border-maroon" : "border-hairline"}`}>{on && <span className="h-2.5 w-2.5 rounded-full bg-maroon" />}</span>
                <span className="flex-1">
                  <span className="block font-sans text-[14px] font-semibold text-espresso">{opt.title}</span>
                  <span className="block font-sans text-[12px] text-muted">{opt.sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* points — shown at the moment of paying, which is when knowing the
            balance actually changes what the customer does */}
        {walletPhone && (
          <div className="rounded-[18px] border border-hairline bg-card p-4 shadow-card">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-sans text-[12px] font-semibold uppercase tracking-label text-muted">Your points</span>
              <span className="font-display text-[18px] font-semibold text-espresso">{points} pts</span>
            </div>
            <p className="mt-0.5 font-sans text-[12px] text-muted">
              This order earns about {Math.round(subtotal * earnPerRm)} pts.
            </p>

            {(() => {
              const affordable = tiers.filter(t => t.points <= points);
              const next = tiers.filter(t => t.points > points).sort((a, b) => a.points - b.points)[0];
              if (couponCode) return null;
              if (affordable.length > 0) {
                return (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {affordable.map(t => (
                      <button
                        key={t.points}
                        onClick={() => void redeemAndApply(t.points)}
                        disabled={redeeming !== null}
                        className="min-h-[44px] rounded-[12px] bg-maroon px-4 font-sans text-[13px] font-semibold text-cream disabled:opacity-50 active:scale-95"
                      >
                        {redeeming === t.points ? "…" : `Use ${t.points} pts → ${t.label} off`}
                      </button>
                    ))}
                  </div>
                );
              }
              if (next) {
                const pct = Math.min(100, (points / next.points) * 100);
                return (
                  <div className="mt-2.5">
                    <div className="h-[6px] w-full overflow-hidden rounded-full bg-hairline">
                      <div className="h-full rounded-full bg-leaf" style={{ width: `${Math.max(pct, points > 0 ? 6 : 0)}%` }} />
                    </div>
                    <p className="mt-1.5 font-sans text-[12px] text-muted">
                      {next.points - points} more pts for {next.label} off
                    </p>
                  </div>
                );
              }
              return null;
            })()}
            {pointsMsg && <p className="mt-2 font-sans text-[12px] text-melon">{pointsMsg}</p>}
          </div>
        )}

        {/* coupon */}
        <div className="rounded-[18px] border border-hairline bg-card p-4 shadow-card">
          <div className="mb-2.5 font-sans text-[12px] font-semibold uppercase tracking-label text-muted">Coupon</div>

          {/* The customer's own rewards, tappable. Without this the only way
              to spend points was to remember a generated code. */}
          {!couponCode && wallet.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {wallet.map(v => {
                const tooSmall = v.min_spend > subtotal;
                const usable = v.applies_here && !tooSmall;
                return (
                  <button
                    key={v.code}
                    onClick={() => { if (usable) { setCouponInput(v.code); void applyCoupon(v.code); } }}
                    disabled={!usable}
                    className={`flex w-full items-center justify-between gap-3 rounded-[12px] border px-3.5 py-2.5 text-left transition ${
                      usable ? "border-leaf/40 bg-leaf/5 active:scale-[.99]" : "border-hairline bg-cream/40"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block font-sans text-[13px] font-semibold text-espresso">{v.label}</span>
                      <span className="block font-sans text-[11px] text-muted">
                        {!v.applies_here
                          ? "Show this at the counter"
                          : tooSmall
                            ? `Spend ${rm(v.min_spend)} to use this`
                            : v.code}
                      </span>
                    </span>
                    <span className={`shrink-0 font-sans text-[12px] font-semibold ${usable ? "text-leaf" : "text-muted-2"}`}>
                      {usable ? "Use" : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {couponCode ? (
            <div className="flex items-center justify-between rounded-[12px] border border-leaf/40 bg-leaf/5 px-3.5 py-3">
              <span className="font-sans text-[13px] font-semibold text-espresso">
                ✓ {couponCode}{couponLabel ? ` — ${couponLabel}` : ""}
                {couponDiscount !== null && couponDiscount > 0 && <span className="text-leaf"> · saves {rm(couponDiscount)}</span>}
              </span>
              <button onClick={clearCoupon} className="font-sans text-[12px] font-semibold text-melon active:opacity-60">Remove</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                value={couponInput}
                onChange={e => setCouponInput(e.target.value.toUpperCase())}
                placeholder="Coupon code"
                className="w-full rounded-[12px] border border-hairline bg-cream/40 px-3.5 py-3 font-sans text-[14px] uppercase text-espresso outline-none placeholder:text-muted-2 focus:border-maroon"
              />
              <button
                onClick={() => void applyCoupon()}
                disabled={couponChecking || !couponInput.trim()}
                className="flex-none rounded-[12px] bg-maroon px-4 py-3 font-sans text-[13px] font-semibold text-cream disabled:opacity-50 active:scale-95"
              >
                {couponChecking ? "…" : "Apply"}
              </button>
            </div>
          )}
          {couponMsg && <p className="mt-2 font-sans text-[11px] text-melon">{couponMsg}</p>}
          {couponCode && couponDiscount === null && <p className="mt-2 font-sans text-[11px] text-muted">This discount is worked out when your payment is confirmed.</p>}
        </div>

        {/* summary */}
        <div className="rounded-[18px] border border-hairline bg-card p-4 shadow-card">
          <div className="mb-2.5 font-sans text-[12px] font-semibold uppercase tracking-label text-muted-2">Summary</div>
          {cart.map(l => (
            <div key={l.lineId} className="flex justify-between gap-3 py-1 font-sans text-[13px]">
              <span className="min-w-0 text-muted"><span className="text-espresso">{l.qty}×</span> {l.name}{l.optionsText ? ` · ${l.optionsText}` : ""}</span>
              <span className="whitespace-nowrap font-display font-semibold text-espresso">{rm(l.unitPrice * l.qty)}</span>
            </div>
          ))}
          {discount > 0 && (
            <div className="mt-2 flex justify-between border-t border-hairline pt-2 font-sans text-[13px]">
              <span className="text-leaf">Coupon {couponCode}</span>
              <span className="font-display font-semibold text-leaf">−{rm(discount)}</span>
            </div>
          )}
          <div className="mt-2.5 flex justify-between border-t border-hairline pt-2.5">
            <span className="font-sans text-[14px] font-semibold text-espresso">Total</span>
            <span className="font-display text-[17px] font-semibold text-espresso">{rm(total)}</span>
          </div>
        </div>
      </div>

      {/* sticky CTA */}
      <div className="safe-bottom flex-none border-t border-hairline bg-cream px-5 pb-5 pt-3">
        {error && <p className="mb-2 text-center font-sans text-[12px] text-melon">{error}</p>}
        <button onClick={() => void placeOrder()} disabled={placing} className="flex w-full items-center justify-between rounded-[16px] bg-maroon px-[18px] py-[15px] transition active:scale-[.99] disabled:opacity-60">
          <span className="font-sans text-[15px] font-semibold text-cream">{placing ? "Processing…" : payment === "online" ? "Pay now" : "Place order"}</span>
          <span className="font-display text-[15px] font-semibold text-cream">{rm(total)}</span>
        </button>
      </div>
    </div>
  );
}
