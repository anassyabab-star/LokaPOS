"use client";

// Item customise bottom sheet (design_handoff_loka_ordering README §3).
// The prototype hard-codes Temperature/Size/Milk/Extras; the real catalog has
// generic `variants` (single-select, with price_adjustment) + `addons`
// (multi-select extras). We re-express the design against that real data:
// variants → segmented selector, addons → "Extras" checkbox rows. Live price.

import { useMemo, useState } from "react";
import { useOrder, rm, swatchFor } from "@/app/(order)/order-provider";
import type { Product } from "@/app/(order)/types";

export function ItemSheet({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { addLine, showToast } = useOrder();
  // Default variant = the one with no price bump if present, else the first.
  const defaultVariant = useMemo(() => {
    if (!product || product.variants.length === 0) return null;
    return product.variants.find(v => Number(v.price_adjustment) === 0)?.id ?? product.variants[0].id;
  }, [product]);

  const [variantId, setVariantId] = useState<string | null>(defaultVariant);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [qty, setQty] = useState(1);

  // Reset config whenever a new product opens.
  const [seen, setSeen] = useState<string | null>(null);
  if (product && product.id !== seen) {
    setSeen(product.id);
    setVariantId(defaultVariant);
    setAddonIds([]);
    setQty(1);
  }

  if (!product) return null;

  const variant = product.variants.find(v => v.id === variantId) || null;
  const chosenAddons = product.addons.filter(a => addonIds.includes(a.id));
  const unit =
    Number(product.price) +
    (variant ? Number(variant.price_adjustment) : 0) +
    chosenAddons.reduce((s, a) => s + Number(a.price), 0);
  const swatch = swatchFor(product.id + product.name);

  function toggleAddon(id: string) {
    setAddonIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }

  function add() {
    const optionsText = [variant?.name, ...chosenAddons.map(a => a.name)].filter(Boolean).join(" · ");
    addLine({
      productId: product!.id,
      name: product!.name,
      swatch,
      imageUrl: product!.image_url,
      unitPrice: unit,
      qty,
      optionsText,
      variantId: variant?.id ?? null,
      addonIds: [...addonIds],
    });
    showToast(`${qty}× ${product!.name} added`);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 animate-fadeIn" style={{ background: "rgba(28,19,14,.5)" }} />
      {/* Sheet: header + scrollable body + always-visible footer. Capped well
          below the viewport so the CTA never hides behind the browser bar. */}
      <div
        className="relative flex w-full max-w-[440px] animate-sheetUp flex-col rounded-t-[28px] bg-cream"
        style={{ maxHeight: "min(88dvh, 720px)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* drag handle + close */}
        <div className="relative flex flex-none justify-center pt-3 pb-1">
          <div className="h-[5px] w-[38px] rounded-full bg-hairline" />
          <button onClick={onClose} aria-label="Close" className="absolute right-4 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-cream-2 text-[16px] leading-none text-muted active:scale-95">✕</button>
        </div>

        {/* scrollable body */}
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-3">
        {/* image header — shorter on small phones so options stay visible */}
        <div className="relative mx-5 mt-1 flex items-start justify-between overflow-hidden rounded-[18px] p-3" style={{ background: swatch, height: "clamp(96px, 18dvh, 150px)" }}>
          {product.image_url && (
            <img src={product.image_url} alt={product.name} className="absolute inset-0 h-full w-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          )}
          {product.category && (
            <span className="relative rounded-full bg-cream px-2.5 py-1 font-sans text-[9px] font-semibold uppercase tracking-label text-maroon">
              {product.category}
            </span>
          )}
        </div>

        {/* title + base price */}
        <div className="px-5 pt-3.5">
          <h2 className="font-display text-[20px] font-semibold leading-tight tracking-[-.01em] text-espresso">{product.name}</h2>
          <div className="mt-1 font-sans text-[13px] text-muted">Base {rm(Number(product.price))}</div>
        </div>

        {/* variants — segmented single-select */}
        {product.variants.length > 0 && (
          <div className="px-5 pt-4">
            <div className="mb-2 font-sans text-[12px] font-semibold uppercase tracking-label text-muted-2">Choose</div>
            <div className="flex flex-wrap gap-2">
              {product.variants.map(v => {
                const active = v.id === variantId;
                const delta = Number(v.price_adjustment);
                return (
                  <button
                    key={v.id}
                    onClick={() => setVariantId(v.id)}
                    className={`rounded-[12px] border px-3.5 py-2.5 font-sans text-[13px] font-semibold transition active:scale-[.98] ${
                      active ? "border-espresso bg-espresso text-cream" : "border-hairline bg-card text-espresso"
                    }`}
                  >
                    {v.name}
                    {delta > 0 && <span className={active ? "text-cream/80" : "text-muted"}> +{rm(delta)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* addons — extras (multi-select) */}
        {product.addons.length > 0 && (
          <div className="px-5 pt-4">
            <div className="mb-2 font-sans text-[12px] font-semibold uppercase tracking-label text-muted-2">Extras</div>
            <div className="space-y-2">
              {product.addons.map(a => {
                const on = addonIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleAddon(a.id)}
                    className={`flex w-full items-center justify-between rounded-[12px] border px-3.5 py-3 text-left font-sans text-[14px] transition active:scale-[.99] ${
                      on ? "border-maroon bg-maroon/5" : "border-hairline bg-card"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className={`flex h-5 w-5 items-center justify-center rounded-[6px] border text-[11px] ${on ? "border-maroon bg-maroon text-cream" : "border-hairline bg-card text-transparent"}`}>✓</span>
                      <span className="font-medium text-espresso">{a.name}</span>
                    </span>
                    <span className="font-display text-[13px] font-semibold text-maroon">+{rm(Number(a.price))}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        </div>

        {/* footer: qty + add — outside the scroll area, padded for the home indicator */}
        <div
          className="flex-none border-t border-hairline bg-cream px-5 pt-3"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-[14px] border border-hairline bg-card px-2 py-1.5">
              <button onClick={() => setQty(q => Math.max(1, q - 1))} className="h-8 w-8 text-[18px] leading-none text-muted active:scale-95" aria-label="Decrease">−</button>
              <span className="min-w-5 text-center font-display text-[15px] font-semibold text-espresso">{qty}</span>
              <button onClick={() => setQty(q => q + 1)} className="h-8 w-8 text-[18px] leading-none text-espresso active:scale-95" aria-label="Increase">+</button>
            </div>
            <button
              onClick={add}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[16px] bg-maroon font-sans text-[15px] font-semibold text-cream transition active:scale-[.99]"
            >
              Add to order · {rm(unit * qty)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
