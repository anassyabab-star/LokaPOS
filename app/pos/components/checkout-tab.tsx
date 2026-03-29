"use client";

import { Product } from "../types";

type Props = {
  checkoutSub: "keypad" | "library" | "favourites";
  setCheckoutSub: (v: "keypad" | "library" | "favourites") => void;
  // Keypad
  keypadValue: string;
  setKeypadValue: (v: string) => void;
  keypadNote: string;
  setKeypadNote: (v: string) => void;
  addKeypadAmount: () => void;
  currentShift: unknown;
  setShowOpenShiftModal: (v: boolean) => void;
  // Products
  products: Product[];
  category: string;
  setCategory: (v: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  categories: string[];
  handleSelectProduct: (p: Product) => void;
  // Cart bar
  totalQty: number;
  setOverlay: (v: "cart" | "none") => void;
  shiftLoading: boolean;
};

export default function CheckoutTab({
  checkoutSub, setCheckoutSub,
  keypadValue, setKeypadValue, keypadNote, setKeypadNote, addKeypadAmount,
  currentShift, setShowOpenShiftModal,
  products, category, setCategory, searchQuery, setSearchQuery, categories,
  handleSelectProduct,
  totalQty, setOverlay, shiftLoading,
}: Props) {
  const filteredProducts = products.filter(p => {
    const matchCat = category === "All" || p.category === category;
    const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <>
      <div className="border-b-2 border-gray-200 bg-white">
        <div className="flex">
          {(["keypad", "library", "favourites"] as const).map(t => (
            <button key={t} onClick={() => setCheckoutSub(t)} className={`flex-1 py-4 text-base font-semibold capitalize transition-all ${checkoutSub === t ? "border-b-[3px] border-[#7F1D1D] text-[#7F1D1D] bg-red-50/40" : "text-gray-400 hover:text-gray-600"}`}>
              {t === "keypad" ? "Keypad" : t === "library" ? "Library" : "Favourites"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-36">
        {/* KEYPAD */}
        {checkoutSub === "keypad" && (
          <div className="flex flex-col items-center px-6 pt-8">
            <div className="mb-6 text-4xl font-bold tabular-nums text-gray-900">RM{keypadValue === "0" ? "0.00" : keypadValue}</div>
            <div className="grid w-full max-w-xs grid-cols-3 gap-3">
              {["1","2","3","4","5","6","7","8","9",".","0","⌫"].map(k => (
                <button key={k} onClick={() => {
                  if (k === "⌫") setKeypadValue(keypadValue.length <= 1 ? "0" : keypadValue.slice(0, -1));
                  else if (k === ".") { if (!keypadValue.includes(".")) setKeypadValue(keypadValue + "."); }
                  else setKeypadValue(keypadValue === "0" ? k : keypadValue + k);
                }} className="flex h-14 items-center justify-center rounded-lg bg-gray-100 text-lg font-medium text-gray-900 active:bg-gray-200">
                  {k}
                </button>
              ))}
            </div>
            <div className="mt-4 w-full max-w-xs">
              <input value={keypadNote} onChange={e => setKeypadNote(e.target.value)} placeholder="Nota item (cth: Nasi Lemak Special)" className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20" />
            </div>
            <button onClick={() => { if (!currentShift) { setShowOpenShiftModal(true); return; } addKeypadAmount(); }} className="mt-4 w-full max-w-xs rounded-full bg-[#7F1D1D] py-3.5 text-sm font-semibold text-white active:bg-[#6B1818]">
              Charge RM{keypadValue === "0" ? "0.00" : parseFloat(keypadValue).toFixed(2)}
            </button>
          </div>
        )}

        {/* LIBRARY */}
        {checkoutSub === "library" && (
          <div>
            <div className="border-b border-gray-200 px-4 py-3">
              <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2.5">
                <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Cari produk..." className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400" />
              </div>
            </div>
            <div className="border-b border-gray-200">
              {categories.filter(c => c !== "All").map(cat => (
                <button key={cat} onClick={() => { setCategory(cat); setCheckoutSub("favourites"); }} className="flex w-full items-center justify-between border-b border-gray-200 bg-white px-4 py-4 text-left hover:bg-gray-50 transition-colors">
                  <span className="text-sm font-semibold text-gray-900">{cat}</span>
                  <span className="text-gray-400 text-lg">›</span>
                </button>
              ))}
            </div>
            {filteredProducts.map(p => (
              <button key={p.id} onClick={() => handleSelectProduct(p)} disabled={Number(p.stock || 0) <= 0} className="flex w-full items-center justify-between border-b border-gray-200 bg-white px-4 py-4 text-left transition-colors hover:bg-gray-50 disabled:opacity-40">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#7F1D1D]/10 text-xs font-bold text-[#7F1D1D]">{p.name.substring(0, 2)}</div>
                  <div>
                    <span className="text-sm font-medium text-gray-900">{p.name}</span>
                    {p.category && <div className="text-[11px] text-gray-500">{p.category}</div>}
                  </div>
                </div>
                <span className="text-sm font-semibold text-gray-700">RM{Number(p.price).toFixed(2)}</span>
              </button>
            ))}
          </div>
        )}

        {/* FAVOURITES */}
        {checkoutSub === "favourites" && (
          <div>
            <div className="scrollbar-hide flex gap-2 overflow-x-auto border-b border-gray-200 px-4 py-2.5">
              {categories.map(cat => (
                <button key={cat} onClick={() => setCategory(cat)} className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${category === cat ? "bg-[#7F1D1D] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{cat}</button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-[1px] bg-gray-200">
              {(category === "All" ? products : products.filter(p => p.category === category)).map(p => (
                <button key={p.id} onClick={() => handleSelectProduct(p)} disabled={Number(p.stock || 0) <= 0} className={`pos-tile flex flex-col items-center justify-center bg-white px-2 py-5 text-center ${Number(p.stock || 0) <= 0 ? "opacity-30" : ""}`}>
                  <span className="line-clamp-2 text-[13px] font-medium leading-snug text-gray-900">{p.name}</span>
                  <span className="mt-1 text-xs text-gray-500">RM{Number(p.price).toFixed(2)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Review sale button */}
      {totalQty > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-20 px-4 pb-2">
          <button onClick={() => { if (!currentShift) { setShowOpenShiftModal(true); return; } setOverlay("cart"); }} className="w-full rounded-full bg-[#7F1D1D] py-3.5 text-center text-sm font-semibold text-white shadow-lg active:bg-[#6B1818]">
            Review sale<br /><span className="text-xs font-normal text-red-200">{totalQty} items</span>
          </button>
        </div>
      )}
      {!currentShift && !shiftLoading && totalQty === 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-20 px-4 pb-2">
          <button onClick={() => setShowOpenShiftModal(true)} className="w-full rounded-full bg-[#7F1D1D] py-3.5 text-sm font-semibold text-white active:bg-[#6B1818]">Buka Shift</button>
        </div>
      )}
    </>
  );
}
