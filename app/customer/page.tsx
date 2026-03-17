"use client";

import { useEffect, useState, useMemo } from "react";
import { isSugarSupportedCategory } from "@/app/pos/types";

type Category = { id: string; name: string };
type Variant = { id: string; name: string; price_adjustment: number };
type Addon = { id: string; name: string; price: number };
type Product = { id: string; name: string; price: number; image_url: string | null; category: string | null; variants: Variant[]; addons: Addon[] };
type CartItem = { key: string; product_id: string; product_name: string; variant_id: string | null; variant_name: string | null; addon_ids: string[]; addon_names: string[]; sugar_level: string; qty: number; unit_price: number };
type ActiveTab = "menu" | "cart" | "done";

const SUGAR_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "less", label: "Less" },
  { value: "half", label: "Half" },
  { value: "none", label: "No Sugar" },
];

function formatMoney(v: number) { return `RM ${Number(v || 0).toFixed(2)}`; }
function initial(name: string) { return name.trim().charAt(0).toUpperCase() || "?"; }
function buildKey(pid: string, vid: string | null, aids: string[], sugar: string) {
  const ak = aids.length > 0 ? [...aids].sort().join(",") : "no";
  return `${pid}__${vid || "base"}__${ak}__${sugar}`;
}

export default function CustomerGuestPage() {
  const [tab, setTab] = useState<ActiveTab>("menu");
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [catFilter, setCatFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, CartItem>>({});

  // Configurator
  const [cfgProd, setCfgProd] = useState<Product | null>(null);
  const [cfgVariant, setCfgVariant] = useState<string | null>(null);
  const [cfgAddons, setCfgAddons] = useState<string[]>([]);
  const [cfgSugar, setCfgSugar] = useState("normal");
  const [cfgQty, setCfgQty] = useState(1);

  // Checkout
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [payMethod, setPayMethod] = useState("fpx");
  const [placing, setPlacing] = useState(false);
  const [checkoutErr, setCheckoutErr] = useState<string | null>(null);
  const [doneOrderNum, setDoneOrderNum] = useState("");
  const [doneTotal, setDoneTotal] = useState(0);

  // Load catalog
  useEffect(() => {
    fetch("/api/public/catalog")
      .then(r => r.json())
      .then(d => { setCategories(d.categories || []); setProducts(d.products || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load saved phone from localStorage
  useEffect(() => {
    try { setCustName(localStorage.getItem("loka_guest_name") || ""); setCustPhone(localStorage.getItem("loka_guest_phone") || ""); } catch {}
  }, []);

  const filteredProducts = useMemo(() => products.filter(p => {
    const matchCat = catFilter === "All" || p.category === catFilter;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  }), [products, catFilter, search]);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const cartCount = useMemo(() => cartItems.reduce((s, i) => s + i.qty, 0), [cartItems]);
  const cartTotal = useMemo(() => cartItems.reduce((s, i) => s + i.unit_price * i.qty, 0), [cartItems]);

  function openCfg(p: Product) { setCfgProd(p); setCfgVariant(p.variants?.[0]?.id || null); setCfgAddons([]); setCfgSugar("normal"); setCfgQty(1); }
  function closeCfg() { setCfgProd(null); }

  function addToCart() {
    if (!cfgProd) return;
    const v = cfgProd.variants.find(x => x.id === cfgVariant);
    const addons = cfgProd.addons.filter(a => cfgAddons.includes(a.id));
    const price = cfgProd.price + (v?.price_adjustment || 0) + addons.reduce((s, a) => s + a.price, 0);
    const key = buildKey(cfgProd.id, cfgVariant, cfgAddons, cfgSugar);
    setCart(prev => {
      const existing = prev[key];
      if (existing) return { ...prev, [key]: { ...existing, qty: existing.qty + cfgQty } };
      return { ...prev, [key]: { key, product_id: cfgProd.id, product_name: cfgProd.name, variant_id: cfgVariant, variant_name: v?.name || null, addon_ids: cfgAddons, addon_names: addons.map(a => a.name), sugar_level: cfgSugar, qty: cfgQty, unit_price: price } };
    });
    closeCfg();
  }

  function incQty(k: string) { setCart(prev => prev[k] ? { ...prev, [k]: { ...prev[k], qty: prev[k].qty + 1 } } : prev); }
  function decQty(k: string) { setCart(prev => { if (!prev[k]) return prev; if (prev[k].qty <= 1) { const c = { ...prev }; delete c[k]; return c; } return { ...prev, [k]: { ...prev[k], qty: prev[k].qty - 1 } }; }); }

  async function placeOrder() {
    if (!custName.trim()) { setCheckoutErr("Sila masukkan nama"); return; }
    if (!custPhone.trim() || custPhone.trim().length < 8) { setCheckoutErr("Sila masukkan no telefon yang sah"); return; }
    setPlacing(true); setCheckoutErr(null);
    try {
      // Save for next visit
      try { localStorage.setItem("loka_guest_name", custName.trim()); localStorage.setItem("loka_guest_phone", custPhone.trim()); } catch {}

      const res = await fetch("/api/public/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: custName.trim(),
          customer_phone: custPhone.trim(),
          payment_method: payMethod,
          items: cartItems.map(i => ({ product_id: i.product_id, variant_id: i.variant_id, addon_ids: i.addon_ids, sugar_level: i.sugar_level, qty: i.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal buat order");

      const orderId = data.order_id;
      const orderNum = data.order_number;

      // Try CHIP payment if online method
      if ((payMethod === "fpx" || payMethod === "card") && orderId) {
        const billRes = await fetch("/api/payments/create-bill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: orderId }) });
        const billData = await billRes.json().catch(() => ({}));
        const paymentUrl = billData?.payment?.payment_url;
        if (paymentUrl) {
          setCart({}); window.location.assign(paymentUrl); return;
        }
      }

      // Done
      setDoneOrderNum(orderNum); setDoneTotal(data.total || cartTotal);
      setCart({}); setTab("done");
    } catch (e) { setCheckoutErr(e instanceof Error ? e.message : "Ralat"); } finally { setPlacing(false); }
  }

  if (loading) return <main className="min-h-screen bg-white flex items-center justify-center"><p className="text-sm text-gray-400">Loading menu...</p></main>;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto w-full max-w-lg pb-20">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-900">LOKA</h1>
            {cartCount > 0 && tab === "menu" && (
              <button onClick={() => setTab("cart")} className="rounded-full bg-[#7F1D1D] px-4 py-1.5 text-xs font-semibold text-white">{cartCount} item · {formatMoney(cartTotal)}</button>
            )}
          </div>
        </div>

        <div className="px-4 pt-4">
        {/* ━━━ MENU ━━━ */}
        {tab === "menu" && (
          <div className="space-y-4">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari menu..." className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-[#7F1D1D]" />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button onClick={() => setCatFilter("All")} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${catFilter === "All" ? "bg-[#7F1D1D] text-white" : "bg-white text-gray-600 border border-gray-200"}`}>Semua</button>
              {categories.map(c => (
                <button key={c.id} onClick={() => setCatFilter(c.name)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${catFilter === c.name ? "bg-[#7F1D1D] text-white" : "bg-white text-gray-600 border border-gray-200"}`}>{c.name}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {filteredProducts.map(p => (
                <button key={p.id} onClick={() => openCfg(p)} className="group overflow-hidden rounded-2xl bg-white border border-gray-100 text-left shadow-sm active:scale-[0.98] transition-transform">
                  <div className="relative aspect-square w-full overflow-hidden bg-gray-100">
                    {p.image_url ? <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} /> : <div className="flex h-full w-full items-center justify-center"><span className="text-2xl font-bold text-gray-300">{initial(p.name)}</span></div>}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-semibold text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.category || ""}</p>
                    <p className="mt-1 text-sm font-bold text-[#7F1D1D]">{formatMoney(p.price)}</p>
                  </div>
                </button>
              ))}
            </div>
            {filteredProducts.length === 0 && <div className="text-center py-8 text-sm text-gray-400">Tiada produk dijumpai</div>}
          </div>
        )}

        {/* ━━━ CART + CHECKOUT ━━━ */}
        {tab === "cart" && (
          <div className="space-y-3">
            <button onClick={() => setTab("menu")} className="text-sm text-gray-400">← Kembali ke Menu</button>
            <h2 className="text-lg font-bold">Cart</h2>
            {cartItems.length === 0 ? (
              <div className="text-center py-8"><p className="text-sm text-gray-400">Cart kosong</p><button onClick={() => setTab("menu")} className="mt-2 text-sm font-medium text-[#7F1D1D]">Lihat Menu</button></div>
            ) : (
              <>
                {cartItems.map(item => (
                  <div key={item.key} className="rounded-xl bg-white border border-gray-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900">{item.product_name}{item.variant_name ? ` (${item.variant_name})` : ""}</p>
                        {item.addon_names.length > 0 && <p className="text-xs text-gray-400">+ {item.addon_names.join(", ")}</p>}
                        {item.sugar_level !== "normal" && <p className="text-xs text-gray-400">{SUGAR_OPTIONS.find(o => o.value === item.sugar_level)?.label} sugar</p>}
                        <p className="mt-1 text-sm font-semibold text-[#7F1D1D]">{formatMoney(item.unit_price)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => decQty(item.key)} className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 font-bold">−</button>
                        <span className="w-6 text-center text-sm font-semibold">{item.qty}</span>
                        <button onClick={() => incQty(item.key)} className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 font-bold">+</button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Customer info + payment */}
                <div className="rounded-xl bg-white border border-gray-100 p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Maklumat Anda</p>
                  <input value={custName} onChange={e => setCustName(e.target.value)} placeholder="Nama *" className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D]" />
                  <input value={custPhone} onChange={e => setCustPhone(e.target.value)} placeholder="No Telefon * (cth: 0123456789)" type="tel" className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D]" />
                  <p className="text-[10px] text-gray-300">No telefon untuk notifikasi WhatsApp bila order siap</p>

                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 pt-2">Kaedah Bayaran</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[["fpx", "Online Banking"], ["card", "Card / E-Wallet"]].map(([m, l]) => (
                      <button key={m} onClick={() => setPayMethod(m)} className={`rounded-lg py-2.5 text-xs font-medium ${payMethod === m ? "bg-[#7F1D1D] text-white" : "border border-gray-200 text-gray-600"}`}>{l}</button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-300">Powered by CHIP Collect</p>

                  <div className="border-t border-gray-100 pt-3 space-y-1">
                    <div className="flex justify-between text-base font-bold"><span>Jumlah</span><span className="text-[#7F1D1D]">{formatMoney(cartTotal)}</span></div>
                  </div>

                  {checkoutErr && <p className="text-xs text-red-500">{checkoutErr}</p>}

                  <button onClick={() => void placeOrder()} disabled={placing} className="w-full rounded-xl bg-[#7F1D1D] py-3.5 text-sm font-semibold text-white disabled:opacity-50 active:bg-[#6B1818]">
                    {placing ? "Memproses..." : `Bayar ${formatMoney(cartTotal)}`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ━━━ ORDER DONE ━━━ */}
        {tab === "done" && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-4xl">✓</div>
            <h2 className="mt-5 text-xl font-bold">Order Berjaya!</h2>
            <p className="mt-1 text-sm text-gray-500">#{doneOrderNum}</p>
            <p className="text-2xl font-bold text-[#7F1D1D] mt-2">{formatMoney(doneTotal)}</p>
            <p className="mt-4 text-sm text-gray-400 text-center px-8">Kami akan WhatsApp anda bila order siap. Terima kasih!</p>
            <button onClick={() => setTab("menu")} className="mt-6 rounded-xl bg-[#7F1D1D] px-8 py-3 text-sm font-semibold text-white">Order Lagi</button>
          </div>
        )}
        </div>
      </div>

      {/* Bottom bar - only on menu */}
      {tab === "menu" && cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 px-4 py-3 pb-[env(safe-area-inset-bottom,12px)]">
          <button onClick={() => setTab("cart")} className="mx-auto block w-full max-w-lg rounded-xl bg-[#7F1D1D] py-3.5 text-sm font-semibold text-white active:bg-[#6B1818]">
            Lihat Cart · {cartCount} item · {formatMoney(cartTotal)}
          </button>
        </div>
      )}

      {/* ━━━ CONFIGURATOR ━━━ */}
      {cfgProd && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={closeCfg}>
          <div className="w-full max-w-lg rounded-t-3xl bg-white p-5 pb-8 shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" />
            <div className="flex items-center gap-3 mb-4">
              <div className="h-16 w-16 overflow-hidden rounded-xl bg-gray-100 shrink-0">
                {cfgProd.image_url ? <img src={cfgProd.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><span className="text-lg font-bold text-gray-300">{initial(cfgProd.name)}</span></div>}
              </div>
              <div><p className="text-base font-bold text-gray-900">{cfgProd.name}</p><p className="text-sm text-[#7F1D1D] font-semibold">{formatMoney(cfgProd.price)}</p></div>
            </div>

            {cfgProd.variants.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-400 mb-2">Pilih Saiz</p>
                <div className="flex gap-2 flex-wrap">
                  {cfgProd.variants.map(v => (
                    <button key={v.id} onClick={() => setCfgVariant(v.id)} className={`rounded-full px-4 py-2 text-xs font-medium ${cfgVariant === v.id ? "bg-[#7F1D1D] text-white" : "border border-gray-200 text-gray-600"}`}>{v.name} {v.price_adjustment ? `+RM${v.price_adjustment}` : ""}</button>
                  ))}
                </div>
              </div>
            )}

            {cfgProd.addons.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-400 mb-2">Tambahan</p>
                <div className="space-y-2">
                  {cfgProd.addons.map(a => {
                    const sel = cfgAddons.includes(a.id);
                    return <button key={a.id} onClick={() => setCfgAddons(prev => sel ? prev.filter(x => x !== a.id) : [...prev, a.id])} className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm ${sel ? "bg-[#7F1D1D]/10 border border-[#7F1D1D]/20 text-[#7F1D1D]" : "border border-gray-200 text-gray-600"}`}><span>{a.name}</span><span className="text-xs">+{formatMoney(a.price)}</span></button>;
                  })}
                </div>
              </div>
            )}

            {isSugarSupportedCategory(cfgProd.category) && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-400 mb-2">Tahap Gula</p>
                <div className="grid grid-cols-4 gap-2">
                  {SUGAR_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => setCfgSugar(o.value)} className={`rounded-lg py-2 text-xs font-medium ${cfgSugar === o.value ? "bg-[#7F1D1D] text-white" : "border border-gray-200 text-gray-600"}`}>{o.label}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <button onClick={() => setCfgQty(q => Math.max(1, q - 1))} className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-lg font-bold text-gray-500">−</button>
                <span className="w-8 text-center text-base font-bold">{cfgQty}</span>
                <button onClick={() => setCfgQty(q => q + 1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-lg font-bold text-gray-500">+</button>
              </div>
              <button onClick={addToCart} className="flex-1 rounded-xl bg-[#7F1D1D] py-3.5 text-sm font-semibold text-white active:bg-[#6B1818]">Tambah ke Cart</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
