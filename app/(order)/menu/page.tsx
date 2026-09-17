"use client";

// Menu — Direction 03 "Editorial" (design_handoff_loka_ordering README §2).
// Dark header (greeting + points) over a cream sheet: signature reel, category
// chips, sectioned list. Wired to the live /api/public/catalog backend.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useOrder, rm, swatchFor } from "../order-provider";
import type { Product, Category } from "../types";
import { ItemSheet } from "@/components/order/ItemSheet";

export default function MenuPage() {
  const { cartCount, subtotal, lastOrder, setLastOrder, member } = useOrder();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bestsellers, setBestsellers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cat, setCat] = useState("All");
  const [sheet, setSheet] = useState<Product | null>(null);
  const [storeOpen, setStoreOpen] = useState<boolean | null>(null);

  // Google sessions carry a name; a phone-only (OTP) session often does not,
  // so fall back to a rewards star rather than an initial made up from digits.
  const memberFirstName = (member?.name || "").trim().split(/\s+/)[0] || "";
  const memberInitial = memberFirstName ? memberFirstName[0].toUpperCase() : "\u2605";

  useEffect(() => {
    let live = true;
    fetch("/api/public/store-status", { cache: "no-store" })
      .then(r => r.json())
      .then(d => { if (live) setStoreOpen(d?.is_open !== false); })
      .catch(() => { if (live) setStoreOpen(true); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    fetch("/api/public/catalog")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => {
        if (!live) return;
        setProducts(d.products || []);
        setCategories(d.categories || []);
        setBestsellers(d.bestsellers || []);
      })
      .catch(() => live && setError(true))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, []);

  // Category order from the catalog; only those with products.
  const catNames = useMemo(() => {
    const withItems = new Set(products.map(p => p.category).filter(Boolean) as string[]);
    const ordered = categories.map(c => c.name).filter(n => withItems.has(n));
    // include any product categories not in the categories table
    for (const n of withItems) if (!ordered.includes(n)) ordered.push(n);
    return ordered;
  }, [products, categories]);

  const chips = ["All", ...catNames];

  // Most-ordered products (from the catalog API); fall back to the first few if
  // there's no sales history yet. On the "All" tab we show a horizontal
  // "Signature pours" carousel (top picks) + a short bestseller list below it —
  // different items so nothing repeats, keeping the page short. Full menu is
  // reached via the category chips.
  const pool = useMemo(() => {
    const byId = new Map(products.map(p => [p.id, p]));
    const ranked = bestsellers.map(id => byId.get(id)).filter(Boolean) as Product[];
    return ranked.length ? ranked : products;
  }, [bestsellers, products]);

  const carousel = useMemo(() => pool.slice(0, 6), [pool]);
  const allList = useMemo(() => {
    const next = pool.slice(6, 11);
    return next.length ? next : pool.slice(0, 5);
  }, [pool]);

  const sections = useMemo(() => {
    if (cat === "All") {
      return allList.length ? [{ cat: "Bestsellers", items: allList }] : [];
    }
    return [{ cat, items: products.filter(p => p.category === cat) }].filter(s => s.items.length > 0);
  }, [cat, allList, products]);

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-espresso">
      {/* scroll region */}
      <div className="no-scrollbar flex-1 overflow-auto">
        {/* dark header */}
        <div className="safe-top px-6 pb-6 pt-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-sans text-[13px] font-medium text-[#C9A88F]">Welcome to Loka</div>
              <h1 className="mt-1 font-display text-[26px] font-semibold leading-[1.1] tracking-[-.01em] text-cream">
                What are we<br />spinning today?
              </h1>
            </div>
            {/* `member` is null until /api/public/me answers, so the signed-out
                markup is what the prerendered HTML contains. */}
            {member?.signedIn ? (
              <Link href="/rewards" className="flex items-center gap-2 text-right" aria-label="Your rewards">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-melon/[0.16] font-display text-[15px] font-semibold uppercase text-melon">
                  {memberInitial}
                </span>
                <span className="font-sans text-[10px] font-medium uppercase tracking-[.1em] text-muted-3">rewards</span>
              </Link>
            ) : (
              <Link href="/signin?next=/menu" className="text-right">
                <div className="font-display text-[22px] font-semibold text-melon">–</div>
                <div className="font-sans text-[10px] font-medium uppercase tracking-[.1em] text-muted-3">sign in</div>
              </Link>
            )}
          </div>

          {member?.signedIn ? (
            <Link
              href="/rewards"
              className="mt-4 flex items-center justify-between rounded-[14px] border border-melon/30 bg-melon/10 px-4 py-3.5"
            >
              <span className="font-sans text-[13px] font-semibold text-melon-soft">
                {memberFirstName ? `Hi ${memberFirstName} — view your points` : "View your points & rewards"}
              </span>
              <span className="font-sans text-[13px] font-semibold text-melon-soft">→</span>
            </Link>
          ) : (
            <Link
              href="/signin?next=/menu"
              className="mt-4 flex items-center justify-between rounded-[14px] border border-melon/30 bg-melon/10 px-4 py-3.5"
            >
              <span className="font-sans text-[13px] font-semibold text-melon-soft">Sign in to earn &amp; redeem points</span>
              <span className="font-sans text-[13px] font-semibold text-melon-soft">→</span>
            </Link>
          )}
        </div>

        {/* cream sheet */}
        <div className={`min-h-[480px] rounded-t-[28px] bg-cream pt-6 ${cartCount > 0 ? "pb-28" : "pb-4"}`}>
          {/* store closed banner */}
          {storeOpen === false && (
            <div className="mb-5 px-[22px]">
              <div className="rounded-[18px] border border-melon/30 bg-melon/10 px-4 py-3 font-sans text-[13px] text-espresso">
                ⏰ <span className="font-semibold">We&rsquo;re closed right now.</span> You can browse the menu, but orders are only accepted during opening hours.
              </div>
            </div>
          )}
          {/* active-order banner — persists while an order is live */}
          {lastOrder && (
            <div className="mb-5 px-[22px]">
              <div className="flex items-center gap-3 rounded-[18px] bg-espresso p-3.5">
                <Link href={`/order/${lastOrder.orderId}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-11 min-w-[44px] flex-none items-center justify-center rounded-[13px] bg-melon/[0.16] px-1.5 font-display text-[14px] font-semibold text-melon">
                    #{lastOrder.shortNumber || (lastOrder.receipt.match(/-(\d+)$/)?.[1] ?? lastOrder.receipt.slice(-3))}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="h-[7px] w-[7px] flex-none rounded-full bg-melon" />
                      <span className="font-sans text-[14px] font-semibold text-cream">Your latest order</span>
                    </span>
                    <span className="mt-0.5 block font-sans text-[12px] text-muted-3">{lastOrder.payment === "counter" ? "Pay at the counter with this Order ID →" : "Tap to track your order →"}</span>
                  </span>
                </Link>
                <button onClick={() => setLastOrder(null)} className="px-1.5 pb-1 text-[18px] leading-none text-muted-3 active:opacity-60" aria-label="Dismiss">×</button>
              </div>
            </div>
          )}
          {loading ? (
            <MenuSkeleton />
          ) : error ? (
            <div className="px-6 py-16 text-center">
              <div className="text-3xl">⚠️</div>
              <p className="mt-3 font-sans text-[14px] text-muted">Couldn&rsquo;t load the menu.</p>
              <button onClick={() => location.reload()} className="mt-4 rounded-[12px] bg-maroon px-5 py-2.5 font-sans text-[13px] font-semibold text-cream">Try again</button>
            </div>
          ) : (
            <>
              {/* signature pours — horizontal carousel (top picks), All tab only */}
              {cat === "All" && carousel.length > 0 && (
                <>
                  <div className="px-6 font-sans text-[12px] font-semibold uppercase tracking-label text-muted-2">Signature pours</div>
                  <div className="no-scrollbar mt-3 flex snap-x snap-mandatory gap-3 overflow-auto px-6 pb-1.5">
                    {carousel.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setSheet(p)}
                        className="w-[160px] flex-none snap-start overflow-hidden rounded-[18px] border border-hairline-soft bg-card text-left transition active:scale-[.99]"
                      >
                        <div className="relative flex h-[116px] items-start justify-between p-2.5" style={{ background: swatchFor(p.id + p.name) }}>
                          {p.image_url && (
                            <img src={p.image_url} alt={p.name} className="absolute inset-0 h-full w-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                          )}
                          {p.category && (
                            <span className="relative rounded-full bg-cream px-2.5 py-1 font-sans text-[9px] font-semibold uppercase tracking-label text-maroon">{p.category}</span>
                          )}
                        </div>
                        <div className="p-3">
                          <div className="font-sans text-[14px] font-semibold leading-tight text-espresso line-clamp-2 min-h-[34px]">{p.name}</div>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="font-display text-[14px] font-semibold text-maroon">{rm(Number(p.price))}</span>
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-maroon text-[17px] leading-none text-cream">+</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* category chips */}
              <div className="no-scrollbar flex gap-2 overflow-auto px-6 pb-3.5 pt-[18px]">
                {chips.map(c => {
                  const active = c === cat;
                  return (
                    <button
                      key={c}
                      onClick={() => setCat(c)}
                      className={`flex-none rounded-[30px] border px-4 py-2 font-sans text-[13px] font-semibold transition active:scale-95 ${
                        active ? "border-maroon bg-maroon text-cream" : "border-hairline bg-card text-muted"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>

              {/* sections */}
              <div className="px-6">
                {sections.map(sec => (
                  <div key={sec.cat}>
                    <div className="mb-0.5 mt-3.5 font-sans text-[12px] font-semibold uppercase tracking-label text-muted-2">{sec.cat}</div>
                    {sec.items.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setSheet(p)}
                        className="flex w-full items-center gap-3.5 border-t border-hairline py-3.5 text-left transition active:opacity-70"
                      >
                        <div className="relative h-[52px] w-[52px] flex-none overflow-hidden rounded-[13px]" style={{ background: swatchFor(p.id + p.name) }}>
                          {p.image_url && (
                            <img src={p.image_url} alt={p.name} className="absolute inset-0 h-full w-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-sans text-[15px] font-semibold text-espresso">{p.name}</div>
                          {p.category && <div className="mt-0.5 font-sans text-[12px] leading-snug text-muted line-clamp-1">{p.category}</div>}
                        </div>
                        <span className="whitespace-nowrap font-display text-[14px] font-semibold text-espresso">{rm(Number(p.price))}</span>
                        <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-maroon text-[20px] leading-none text-cream">+</span>
                      </button>
                    ))}
                  </div>
                ))}
                {sections.length === 0 && (
                  <p className="py-12 text-center font-sans text-[14px] text-muted">No items in this category.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* cart bar — floating, always visible; content scrolls behind it */}
      {cartCount > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 animate-scrIn bg-gradient-to-t from-cream via-cream/90 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-7">
          <Link
            href="/cart"
            className="pointer-events-auto flex w-full items-center justify-between rounded-[16px] bg-maroon px-[18px] py-[15px] shadow-[0_10px_28px_-8px_rgba(127,29,29,.55)] transition active:scale-[.99]"
          >
            <span className="flex items-center gap-2.5">
              <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-[11px] bg-cream px-1.5 font-sans text-[12px] font-bold text-maroon">{cartCount}</span>
              <span className="font-sans text-[15px] font-semibold text-cream">{storeOpen === false ? "View order · closed now" : "View order"}</span>
            </span>
            <span className="font-display text-[15px] font-semibold text-cream">{rm(subtotal)}</span>
          </Link>
        </div>
      )}

      <ItemSheet product={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}

function MenuSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mx-6 h-3 w-32 rounded bg-hairline" />
      <div className="no-scrollbar mt-3 flex gap-3 overflow-hidden px-6">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-[180px] w-[150px] flex-none rounded-[18px] bg-hairline/60" />
        ))}
      </div>
      <div className="mt-5 flex gap-2 px-6">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-9 w-20 rounded-[30px] bg-hairline/60" />)}
      </div>
      <div className="mt-5 space-y-4 px-6">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3.5">
            <div className="h-[52px] w-[52px] rounded-[13px] bg-hairline/60" />
            <div className="flex-1 space-y-2"><div className="h-3.5 w-40 rounded bg-hairline/60" /><div className="h-2.5 w-24 rounded bg-hairline/50" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
