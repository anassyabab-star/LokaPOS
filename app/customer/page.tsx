"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { isSugarSupportedCategory } from "@/app/pos/types";

// ━━━ Types ━━━
type Category = { id: string; name: string };
type Variant = { id: string; name: string; price_adjustment: number };
type Addon = { id: string; name: string; price: number };
type Product = { id: string; name: string; price: number; image_url: string | null; category: string | null; variants: Variant[]; addons: Addon[] };
type CartItem = { key: string; product_id: string; product_name: string; variant_id: string | null; variant_name: string | null; addon_ids: string[]; addon_names: string[]; sugar_level: string; qty: number; unit_price: number };
type TrackedOrder = { id: string; receipt_number: string | null; customer_name: string | null; status: string | null; payment_status: string | null; total: number | null; created_at: string };
type AppTab = "home" | "menu" | "rewards" | "orders" | "account";
type OrderFilter = "all" | "active" | "past";

const SUGAR_OPTIONS = [
  { value: "normal", label: "Normal", icon: "🍯" },
  { value: "less", label: "Kurang", icon: "🍵" },
  { value: "half", label: "Separuh", icon: "½" },
  { value: "none", label: "Kosong", icon: "⚪" },
];

const REDEEM_TIERS = [
  { points: 100, reward: "RM1", color: "from-[#7F1D1D] to-[#991B1B]" },
  { points: 300, reward: "RM3", color: "from-[#7F1D1D] to-[#B91C1C]" },
  { points: 500, reward: "RM5", color: "from-[#7F1D1D] to-[#DC2626]" },
  { points: 1000, reward: "RM12", color: "from-[#5B1010] to-[#7F1D1D]" },
];

function fm(v: number) { return `RM${Number(v || 0).toFixed(2)}`; }
function ini(name: string) { return name.trim().charAt(0).toUpperCase() || "?"; }
function buildKey(pid: string, vid: string | null, aids: string[], sugar: string) {
  return `${pid}__${vid || "base"}__${aids.length > 0 ? [...aids].sort().join(",") : "no"}__${sugar}`;
}

function statusLabel(status: string | null) {
  switch (status?.toLowerCase()) {
    case "pending": return "Menunggu";
    case "preparing": return "Sedang Dibuat";
    case "ready": return "Sedia Diambil!";
    case "completed": return "Selesai";
    case "cancelled": return "Dibatalkan";
    default: return status || "—";
  }
}

function statusStep(status: string | null) {
  switch (status?.toLowerCase()) {
    case "pending": return 0;
    case "preparing": return 1;
    case "ready": return 2;
    case "completed": return 3;
    default: return -1;
  }
}

function greetingText() {
  const h = new Date().getHours();
  if (h < 12) return "Selamat pagi";
  if (h < 18) return "Selamat petang";
  return "Selamat malam";
}

export default function CustomerApp() {
  const [tab, setTab] = useState<AppTab>("home");
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
  const [showCheckout, setShowCheckout] = useState(false);
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [payMethod, setPayMethod] = useState("fpx");
  const [placing, setPlacing] = useState(false);
  const [checkoutErr, setCheckoutErr] = useState<string | null>(null);

  // Orders
  const [trackedOrders, setTrackedOrders] = useState<TrackedOrder[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");

  // Loyalty
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [expiringPoints30d, setExpiringPoints30d] = useState(0);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInMsg, setCheckInMsg] = useState<string | null>(null);

  // Load catalog
  useEffect(() => {
    fetch("/api/public/catalog")
      .then(r => r.json())
      .then(d => { setCategories(d.categories || []); setProducts(d.products || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      setCustName(localStorage.getItem("loka_guest_name") || "");
      setCustPhone(localStorage.getItem("loka_guest_phone") || "");
      setLastOrderId(localStorage.getItem("loka_last_order_id") || null);
    } catch {}
  }, []);

  const loadTrackedOrders = useCallback(async () => {
    const oid = lastOrderId;
    const phone = custPhone.trim();
    if (!oid && !phone) return;
    setTrackingLoading(true);
    try {
      // Prefer phone — returns full order history + loyalty_points.
      // Fall back to order_id only when no phone is stored.
      const params = phone ? `phone=${encodeURIComponent(phone)}` : `order_id=${oid}`;
      const res = await fetch(`/api/public/orders/track?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (data.order) setTrackedOrders([data.order]);
      else if (data.orders) {
        setTrackedOrders(data.orders);
        if (typeof data.loyalty_points === "number") setLoyaltyPoints(data.loyalty_points);
        if (typeof data.expiring_points_30d === "number") setExpiringPoints30d(data.expiring_points_30d);
      }
    } catch {} finally { setTrackingLoading(false); }
  }, [lastOrderId, custPhone]);

  useEffect(() => { if (tab === "orders" || tab === "home") void loadTrackedOrders(); }, [tab, loadTrackedOrders]);
  useEffect(() => { if (tab !== "orders") return; const i = setInterval(() => void loadTrackedOrders(), 10000); return () => clearInterval(i); }, [tab, loadTrackedOrders]);

  const filteredProducts = useMemo(() => products.filter(p => {
    const matchCat = catFilter === "All" || p.category === catFilter;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  }), [products, catFilter, search]);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const cartCount = useMemo(() => cartItems.reduce((s, i) => s + i.qty, 0), [cartItems]);
  const cartTotal = useMemo(() => cartItems.reduce((s, i) => s + i.unit_price * i.qty, 0), [cartItems]);

  const activeOrder = trackedOrders.find(o => ["pending", "preparing", "ready"].includes(o.status?.toLowerCase() || ""));
  const activeOrders = trackedOrders.filter(o => ["pending", "preparing", "ready"].includes(o.status?.toLowerCase() || ""));
  const pastOrders = trackedOrders.filter(o => ["completed", "cancelled"].includes(o.status?.toLowerCase() || ""));
  const displayedOrders = orderFilter === "active" ? activeOrders : orderFilter === "past" ? pastOrders : trackedOrders;

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

  async function doCheckIn() {
    if (!custPhone.trim() || checkingIn || checkedInToday) return;
    setCheckingIn(true); setCheckInMsg(null);
    try {
      const res = await fetch("/api/public/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: custPhone.trim() }),
      });
      const data = await res.json();
      if (data.already_checked_in) {
        setCheckedInToday(true);
        setCheckInMsg("Dah check-in hari ini!");
      } else if (data.success) {
        setCheckedInToday(true);
        setLoyaltyPoints(p => p + (data.points_earned || 1));
        setCheckInMsg(`+${data.points_earned || 1} pt berjaya ditambah!`);
      } else {
        setCheckInMsg(data.error || "Gagal check-in");
      }
    } catch { setCheckInMsg("Tiada sambungan. Cuba lagi."); }
    finally { setCheckingIn(false); }
  }

  async function placeOrder() {
    if (!custName.trim()) { setCheckoutErr("Sila masukkan nama"); return; }
    if (!custPhone.trim() || custPhone.trim().length < 8) { setCheckoutErr("Sila masukkan no telefon yang sah"); return; }
    setPlacing(true); setCheckoutErr(null);
    try {
      try { localStorage.setItem("loka_guest_name", custName.trim()); localStorage.setItem("loka_guest_phone", custPhone.trim()); } catch {}
      const res = await fetch("/api/public/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_name: custName.trim(), customer_phone: custPhone.trim(), payment_method: payMethod, items: cartItems.map(i => ({ product_id: i.product_id, variant_id: i.variant_id, addon_ids: i.addon_ids, sugar_level: i.sugar_level, qty: i.qty })) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal buat order");
      const orderId = data.order_id;
      try { localStorage.setItem("loka_last_order_id", orderId); } catch {}
      setLastOrderId(orderId);
      if ((payMethod === "fpx" || payMethod === "card") && orderId) {
        const billRes = await fetch("/api/payments/create-bill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: orderId }) });
        const billData = await billRes.json().catch(() => ({}));
        if (billData?.payment?.payment_url) { setCart({}); window.location.assign(billData.payment.payment_url); return; }
      }
      setCart({}); setShowCheckout(false); setTab("orders");
      void loadTrackedOrders();
    } catch (e) { setCheckoutErr(e instanceof Error ? e.message : "Ralat"); } finally { setPlacing(false); }
  }

  const cfgPrice = cfgProd ? cfgProd.price + (cfgProd.variants.find(v => v.id === cfgVariant)?.price_adjustment || 0) + cfgProd.addons.filter(a => cfgAddons.includes(a.id)).reduce((s, a) => s + a.price, 0) : 0;

  if (loading) return <main className="min-h-screen bg-[#FDF8F4] flex items-center justify-center"><div className="text-center"><div className="text-3xl mb-2">☕</div><p className="text-sm text-[#7F1D1D]/50">Memuatkan...</p></div></main>;

  return (
    <main className="min-h-screen bg-[#FDF8F4] pb-20">
      <div className="mx-auto w-full max-w-lg">

        {/* ━━━ HOME ━━━ */}
        {tab === "home" && (
          <div>
            {/* Greeting + notification */}
            <div className="px-5 pt-6 pb-2 flex items-center justify-between">
              <div>
                <p className="text-sm text-[#7F1D1D]/60">{greetingText()},</p>
                <h1 className="text-xl font-bold text-gray-900">{custName || "Coffee Lover"} ☕</h1>
              </div>
              <button className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm border border-gray-100">
                <span className="text-lg">🔔</span>
              </button>
            </div>

            {/* Stats bar — horizontal scroll cards */}
            <div className="px-5 py-3">
              <div className="flex gap-2.5 overflow-x-auto scrollbar-hide">
                <div className="shrink-0 rounded-2xl bg-gradient-to-br from-[#7F1D1D] to-[#991B1B] px-4 py-3 min-w-[130px] shadow-md">
                  <p className="text-[10px] font-medium text-red-200 uppercase tracking-wider">Loka Points</p>
                  <p className="text-2xl font-bold text-white mt-0.5">{loyaltyPoints}</p>
                </div>
                <div className="shrink-0 rounded-2xl bg-white border border-gray-100 px-4 py-3 min-w-[120px] shadow-sm">
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Total Order</p>
                  <p className="text-2xl font-bold text-gray-900 mt-0.5">{trackedOrders.length}</p>
                </div>
                <div className="shrink-0 rounded-2xl bg-white border border-gray-100 px-4 py-3 min-w-[120px] shadow-sm">
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Status</p>
                  <p className="text-sm font-bold text-[#7F1D1D] mt-1">Regular ☕</p>
                </div>
              </div>
            </div>

            {/* Active order banner */}
            {activeOrder && (
              <div className="px-5 pb-3">
                <button onClick={() => setTab("orders")} className="w-full rounded-2xl bg-[#7F1D1D] p-4 shadow-lg text-left active:scale-[0.99] transition-transform">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-medium text-red-200 uppercase tracking-wider">Order Aktif</p>
                      <p className="text-lg font-bold text-white mt-0.5">#{activeOrder.receipt_number}</p>
                      <p className="text-xs text-red-200/80 mt-0.5">{activeOrder.customer_name}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="rounded-full bg-white/20 px-3 py-1">
                        <p className="text-xs font-bold text-white">{statusLabel(activeOrder.status)}</p>
                      </div>
                      <p className="text-base font-bold text-white">{fm(Number(activeOrder.total || 0))}</p>
                    </div>
                  </div>
                </button>
              </div>
            )}

            {/* Quick actions */}
            <div className="px-5 py-2">
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setTab("menu")} className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100 text-left active:scale-[0.97] transition-transform">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7F1D1D]/10 text-lg mb-2.5">🍵</div>
                  <p className="text-sm font-bold text-gray-900">Order Sekarang</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{products.length} item tersedia</p>
                </button>
                <button onClick={() => setTab("orders")} className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100 text-left active:scale-[0.97] transition-transform">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-lg mb-2.5">📋</div>
                  <p className="text-sm font-bold text-gray-900">Track Order</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Semak status pesanan</p>
                </button>
              </div>
            </div>

            {/* Last order */}
            {trackedOrders.length > 0 && (
              <div className="px-5 pt-4">
                <div className="flex items-center justify-between mb-2.5">
                  <h2 className="text-base font-bold text-gray-900">Pesanan Terkini</h2>
                  <button onClick={() => setTab("orders")} className="text-xs font-semibold text-[#7F1D1D]">Lihat Semua →</button>
                </div>
                <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-500">{statusLabel(trackedOrders[0]?.status)}</p>
                  </div>
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-gray-900">#{trackedOrders[0]?.receipt_number}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{trackedOrders[0]?.created_at ? new Date(trackedOrders[0].created_at).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</p>
                      </div>
                      <p className="text-sm font-bold text-[#7F1D1D]">{fm(Number(trackedOrders[0]?.total || 0))}</p>
                    </div>
                  </div>
                  <div className="px-4 pb-3">
                    <button onClick={() => setTab("menu")} className="w-full rounded-xl border-2 border-[#7F1D1D] py-2.5 text-xs font-bold text-[#7F1D1D] active:bg-[#7F1D1D]/5">Reorder</button>
                  </div>
                </div>
              </div>
            )}

            {/* Popular items */}
            {products.length > 0 && (
              <div className="pt-5 pb-4">
                <div className="px-5 flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-gray-900">Popular</h2>
                  <button onClick={() => setTab("menu")} className="text-xs font-semibold text-[#7F1D1D]">Menu →</button>
                </div>
                <div className="flex gap-3 overflow-x-auto scrollbar-hide pl-5 pr-2">
                  {products.slice(0, 8).map(p => (
                    <button key={p.id} onClick={() => { setTab("menu"); openCfg(p); }} className="shrink-0 w-36 rounded-2xl bg-white border border-gray-100 overflow-hidden shadow-sm active:scale-[0.96] transition-transform">
                      <div className="aspect-square w-full bg-gray-100 overflow-hidden">
                        {p.image_url ? <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#FDF8F4] to-gray-100"><span className="text-3xl font-bold text-[#7F1D1D]/20">{ini(p.name)}</span></div>}
                      </div>
                      <div className="p-3">
                        <p className="text-xs font-bold text-gray-900 truncate">{p.name}</p>
                        <p className="text-xs font-bold text-[#7F1D1D] mt-0.5">{fm(p.price)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ━━━ MENU ━━━ */}
        {tab === "menu" && (
          <div>
            <div className="sticky top-0 z-20 bg-[#FDF8F4]/95 backdrop-blur-sm border-b border-gray-200/50 px-4 py-3">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari menu..." className="w-full rounded-xl bg-white border border-gray-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[#7F1D1D] shadow-sm" />
              </div>
            </div>
            <div className="sticky top-[53px] z-10 bg-[#FDF8F4]/95 backdrop-blur-sm px-4 py-2.5">
              <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                <button onClick={() => setCatFilter("All")} className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${catFilter === "All" ? "bg-[#7F1D1D] text-white shadow-md" : "bg-white text-gray-600 border border-gray-200"}`}>Semua</button>
                {categories.map(c => (
                  <button key={c.id} onClick={() => setCatFilter(c.name)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${catFilter === c.name ? "bg-[#7F1D1D] text-white shadow-md" : "bg-white text-gray-600 border border-gray-200"}`}>{c.name}</button>
                ))}
              </div>
            </div>
            <div className="px-4 pt-2 pb-4">
              <div className="grid grid-cols-2 gap-3">
                {filteredProducts.map(p => (
                  <button key={p.id} onClick={() => openCfg(p)} className="group overflow-hidden rounded-2xl bg-white border border-gray-100 text-left shadow-sm active:scale-[0.97] transition-transform">
                    <div className="relative aspect-square w-full overflow-hidden bg-gray-100">
                      {p.image_url ? <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#FDF8F4] to-gray-100"><span className="text-3xl font-bold text-[#7F1D1D]/15">{ini(p.name)}</span></div>}
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-semibold text-gray-900">{p.name}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{p.category || ""}</p>
                      <p className="mt-1.5 text-sm font-bold text-[#7F1D1D]">{fm(p.price)}</p>
                    </div>
                  </button>
                ))}
              </div>
              {filteredProducts.length === 0 && <div className="text-center py-16 text-sm text-gray-400">Tiada produk dijumpai</div>}
            </div>
          </div>
        )}

        {/* ━━━ REWARDS ━━━ */}
        {tab === "rewards" && (
          <div className="px-5 pt-5">
            <h1 className="text-center text-lg font-bold text-[#7F1D1D] mb-6">Missions & Rewards</h1>

            {/* Points circle */}
            <div className="flex flex-col items-center mb-8">
              <div className="relative flex h-40 w-40 items-center justify-center">
                <svg className="absolute inset-0" viewBox="0 0 160 160">
                  <circle cx="80" cy="80" r="70" fill="none" stroke="#F3F4F6" strokeWidth="8" />
                  <circle cx="80" cy="80" r="70" fill="none" stroke="#7F1D1D" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(loyaltyPoints / 1000) * 440} 440`} transform="rotate(-90 80 80)" className="transition-all duration-1000" />
                </svg>
                <div className="text-center">
                  <div className="text-3xl font-bold text-[#7F1D1D]">{loyaltyPoints}</div>
                  <div className="text-xs text-gray-400 font-medium">points</div>
                </div>
              </div>
            </div>

            {/* Expiry warning */}
            {expiringPoints30d > 0 && (
              <div className="mb-5 flex items-center gap-3 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3">
                <span className="text-xl">⏳</span>
                <div>
                  <p className="text-sm font-bold text-amber-800">{expiringPoints30d} pts akan tamat dalam 30 hari</p>
                  <p className="text-[11px] text-amber-600">Tebus sebelum luput supaya tidak hilang!</p>
                </div>
              </div>
            )}

            {/* Daily check-in */}
            <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm mb-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-900">Daily Check-in</h3>
                <span className="text-xs text-gray-400">ⓘ</span>
              </div>
              <div className="flex justify-between mb-3">
                {["Isn", "Sel", "Rab", "Kha", "Jum", "Sab", "Ahd"].map((day, i) => (
                  <div key={day} className="flex flex-col items-center gap-1">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold ${i < 1 ? "bg-[#7F1D1D] text-white" : "bg-gray-100 text-gray-400"}`}>
                      {i === 3 ? "3" : "1"}
                    </div>
                    <span className="text-[9px] text-gray-400">{day}</span>
                  </div>
                ))}
              </div>
              {checkInMsg && <p className="text-center text-xs mb-2 text-[#7F1D1D] font-medium">{checkInMsg}</p>}
              <button
                onClick={() => void doCheckIn()}
                disabled={checkedInToday || checkingIn || !custPhone.trim()}
                className="w-full rounded-xl border-2 border-[#7F1D1D] py-2.5 text-xs font-bold text-[#7F1D1D] active:bg-[#7F1D1D]/5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {checkingIn ? "Sedang Check-in..." : checkedInToday ? "Dah Check-in Hari Ini ✓" : "Check In & Dapat 1 pt"}
              </button>
              {!custPhone.trim() && <p className="text-center text-[10px] text-gray-400 mt-1">Masukkan no telefon dulu untuk check-in</p>}
            </div>

            {/* Redeem tiers */}
            <h3 className="text-base font-bold text-gray-900 mb-3">Tebus Rewards</h3>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {REDEEM_TIERS.map(tier => (
                <div key={tier.points} className={`rounded-2xl bg-gradient-to-br ${tier.color} p-4 shadow-md`}>
                  <p className="text-2xl font-black text-white">{tier.reward}</p>
                  <div className="mt-2 flex items-center gap-1">
                    <span className="text-[10px] text-red-200">Tebus dengan</span>
                  </div>
                  <p className="text-sm font-bold text-white">{tier.points} pts</p>
                </div>
              ))}
            </div>

            <a href="/login" className="block w-full rounded-2xl bg-[#7F1D1D] py-3.5 text-center text-sm font-bold text-white shadow-lg">Log Masuk untuk Kumpul Points</a>
          </div>
        )}

        {/* ━━━ ORDERS ━━━ */}
        {tab === "orders" && (
          <div className="px-4 pt-5">
            <h1 className="text-center text-lg font-bold text-gray-900 mb-4">Pesanan Saya</h1>

            {/* Filter pills */}
            <div className="flex gap-2 mb-4">
              {([
                { key: "all" as OrderFilter, label: "Semua" },
                { key: "active" as OrderFilter, label: "Aktif" },
                { key: "past" as OrderFilter, label: "Lepas" },
              ]).map(f => (
                <button key={f.key} onClick={() => setOrderFilter(f.key)} className={`rounded-full px-5 py-2 text-xs font-semibold transition-all ${orderFilter === f.key ? "bg-[#7F1D1D] text-white shadow-md" : "bg-white text-gray-600 border border-gray-200"}`}>{f.label}</button>
              ))}
            </div>

            {trackingLoading && displayedOrders.length === 0 ? (
              <div className="text-center py-20"><p className="text-sm text-gray-400">Memuatkan...</p></div>
            ) : displayedOrders.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-4xl mb-3">📋</div>
                <p className="text-sm text-gray-500">Tiada pesanan {orderFilter === "active" ? "aktif" : orderFilter === "past" ? "lepas" : ""}</p>
                <button onClick={() => setTab("menu")} className="mt-4 rounded-xl bg-[#7F1D1D] px-6 py-2.5 text-sm font-bold text-white">Order Sekarang</button>
              </div>
            ) : (
              <div className="space-y-3">
                {displayedOrders.map(order => {
                  const step = statusStep(order.status);
                  const isActive = step >= 0 && step < 3;
                  return (
                    <div key={order.id} className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                      {/* Status header */}
                      <div className={`px-4 py-2.5 border-b border-gray-100 flex items-center justify-between ${isActive ? "bg-[#7F1D1D]/5" : "bg-gray-50"}`}>
                        <p className={`text-xs font-bold ${isActive ? "text-[#7F1D1D]" : "text-gray-500"}`}>{statusLabel(order.status)}</p>
                        <span className="text-gray-300">📄</span>
                      </div>

                      <div className="px-4 py-3">
                        <p className="text-sm font-bold text-gray-900">ID: #{order.receipt_number}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(order.created_at).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                      </div>

                      {/* Progress bar for active */}
                      {isActive && (
                        <div className="px-4 pb-3">
                          <div className="flex items-center gap-1">
                            {[0, 1, 2].map(i => (
                              <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${step >= i ? "bg-[#7F1D1D]" : "bg-gray-200"}`} />
                            ))}
                          </div>
                          <div className="flex justify-between mt-1.5">
                            <span className={`text-[9px] font-medium ${step >= 0 ? "text-[#7F1D1D]" : "text-gray-400"}`}>Diterima</span>
                            <span className={`text-[9px] font-medium ${step >= 1 ? "text-[#7F1D1D]" : "text-gray-400"}`}>Dibuat</span>
                            <span className={`text-[9px] font-medium ${step >= 2 ? "text-[#7F1D1D]" : "text-gray-400"}`}>Sedia</span>
                          </div>
                        </div>
                      )}

                      <div className="px-4 pb-3 flex items-center justify-between border-t border-gray-50 pt-2.5">
                        <p className="text-xs text-gray-400">{order.customer_name || "Walk-in"}</p>
                        <p className="text-sm font-bold text-[#7F1D1D]">{fm(Number(order.total || 0))}</p>
                      </div>
                    </div>
                  );
                })}
                <button onClick={() => void loadTrackedOrders()} className="w-full py-3 text-xs font-semibold text-[#7F1D1D]">↻ Refresh</button>
              </div>
            )}
          </div>
        )}

        {/* ━━━ ACCOUNT ━━━ */}
        {tab === "account" && (
          <div>
            <h1 className="text-center text-lg font-bold text-gray-900 pt-5 mb-4">Akaun</h1>

            {/* Profile card */}
            <div className="px-5 mb-4">
              <div className="flex items-center gap-4 rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#7F1D1D] text-2xl font-bold text-white shrink-0">
                  {custName ? ini(custName) : "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-gray-900 truncate">{custName || "Tetamu"}</p>
                  <p className="text-sm text-gray-400 truncate">{custPhone || "Tambah no telefon"}</p>
                </div>
                <span className="text-gray-300 text-xl">✏️</span>
              </div>
            </div>

            {/* Balance/points card */}
            <div className="px-5 mb-4">
              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#7F1D1D]/10 text-2xl">☕</div>
                  <div className="flex-1">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Balance</p>
                    <p className="text-lg font-bold text-gray-900">RM0.00</p>
                  </div>
                  <button className="rounded-xl border-2 border-[#7F1D1D] px-4 py-2 text-xs font-bold text-[#7F1D1D]">+ Top Up</button>
                </div>
                <div className="border-t border-gray-100 flex">
                  <div className="flex-1 px-4 py-3 border-r border-gray-100">
                    <p className="text-[10px] text-gray-400">Points</p>
                    <p className="text-base font-bold text-[#7F1D1D]">{loyaltyPoints} pts</p>
                    {expiringPoints30d > 0 && (
                      <p className="text-[10px] text-amber-600 font-semibold">⏳ {expiringPoints30d} pts luput 30 hari</p>
                    )}
                  </div>
                  <div className="flex-1 px-4 py-3">
                    <p className="text-[10px] text-gray-400">Tier</p>
                    <p className="text-base font-bold text-gray-900">Regular</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Menu rows */}
            <div className="px-5">
              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden mb-4">
                <p className="px-4 pt-3.5 pb-1.5 text-xs font-bold text-[#7F1D1D]/60 uppercase tracking-wider">Maklumat Saya</p>
                {[
                  { icon: "📦", label: "Pesanan", action: () => setTab("orders") },
                  { icon: "🎁", label: "Rewards & Missions", action: () => setTab("rewards") },
                  { icon: "🎟️", label: "Vouchers Saya" },
                ].map(item => (
                  <button key={item.label} onClick={item.action} className="flex w-full items-center gap-3 px-4 py-3.5 border-t border-gray-50 text-left active:bg-gray-50">
                    <span className="text-lg">{item.icon}</span>
                    <span className="flex-1 text-sm font-medium text-gray-900">{item.label}</span>
                    <span className="text-gray-300">›</span>
                  </button>
                ))}
              </div>

              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden mb-4">
                <p className="px-4 pt-3.5 pb-1.5 text-xs font-bold text-[#7F1D1D]/60 uppercase tracking-wider">Tetapan</p>
                {[
                  { icon: "👤", label: "Edit Profil" },
                  { icon: "💬", label: "Feedback" },
                  { icon: "❓", label: "Bantuan" },
                  { icon: "📄", label: "Terma & Syarat" },
                ].map(item => (
                  <button key={item.label} className="flex w-full items-center gap-3 px-4 py-3.5 border-t border-gray-50 text-left active:bg-gray-50">
                    <span className="text-lg">{item.icon}</span>
                    <span className="flex-1 text-sm font-medium text-gray-900">{item.label}</span>
                    <span className="text-gray-300">›</span>
                  </button>
                ))}
              </div>

              <a href="/login" className="block w-full rounded-2xl bg-[#7F1D1D] py-3.5 text-center text-sm font-bold text-white shadow-lg mb-4">Log Masuk / Daftar</a>

              <p className="text-center text-[10px] text-gray-300 pb-4">Loka Coffee v2.1</p>
            </div>
          </div>
        )}
      </div>

      {/* ━━━ STICKY CART BAR ━━━ */}
      {cartCount > 0 && tab === "menu" && !cfgProd && !showCheckout && (
        <div className="fixed bottom-[72px] left-0 right-0 z-30 px-4 pb-2">
          <div className="mx-auto max-w-lg">
            <button onClick={() => setShowCheckout(true)} className="w-full rounded-2xl bg-[#7F1D1D] py-3.5 text-white shadow-lg active:bg-[#6B1818] flex items-center justify-between px-5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold">{cartCount}</span>
                <span className="text-sm font-bold">Lihat Cart</span>
              </div>
              <span className="text-sm font-bold">{fm(cartTotal)}</span>
            </button>
          </div>
        </div>
      )}

      {/* ━━━ BOTTOM NAV — 5 tabs ━━━ */}
      {!showCheckout && !cfgProd && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom,0px)]">
          <div className="mx-auto max-w-lg flex">
            {([
              { key: "home" as AppTab, label: "Home", icon: "🏠" },
              { key: "menu" as AppTab, label: "Menu", icon: "☕" },
              { key: "rewards" as AppTab, label: "Rewards", icon: "🎁", badge: false },
              { key: "orders" as AppTab, label: "Orders", icon: "📋", badge: activeOrders.length > 0 },
              { key: "account" as AppTab, label: "Akaun", icon: "👤" },
            ]).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`relative flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-colors ${tab === t.key ? "text-[#7F1D1D]" : "text-gray-400"}`}>
                <span className="text-[17px]">{t.icon}</span>
                {t.label}
                {t.badge && <div className="absolute top-1 right-1/4 h-2 w-2 rounded-full bg-[#7F1D1D]" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ━━━ PRODUCT CONFIGURATOR ━━━ */}
      {cfgProd && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={closeCfg}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="mx-auto mt-3 mb-2 h-1 w-10 rounded-full bg-gray-200" />
            <div className="aspect-video w-full overflow-hidden bg-gray-100">
              {cfgProd.image_url ? <img src={cfgProd.image_url} alt={cfgProd.name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#FDF8F4] to-gray-100"><span className="text-5xl font-bold text-[#7F1D1D]/15">{ini(cfgProd.name)}</span></div>}
            </div>
            <div className="px-5 pt-4 pb-8">
              <h2 className="text-xl font-bold text-gray-900">{cfgProd.name}</h2>
              <p className="text-lg font-bold text-[#7F1D1D] mt-1">{fm(cfgPrice)}</p>

              {cfgProd.variants.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Pilih Saiz</p>
                  <div className="flex gap-2 flex-wrap">
                    {cfgProd.variants.map(v => (
                      <button key={v.id} onClick={() => setCfgVariant(v.id)} className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${cfgVariant === v.id ? "bg-[#7F1D1D] text-white shadow-md" : "bg-gray-100 text-gray-600"}`}>
                        {v.name} {v.price_adjustment > 0 ? `+${fm(v.price_adjustment)}` : ""}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {cfgProd.addons.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Tambahan</p>
                  <div className="space-y-2">
                    {cfgProd.addons.map(a => {
                      const sel = cfgAddons.includes(a.id);
                      return (
                        <button key={a.id} onClick={() => setCfgAddons(prev => sel ? prev.filter(x => x !== a.id) : [...prev, a.id])} className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm transition-all ${sel ? "bg-[#7F1D1D]/10 border-2 border-[#7F1D1D]/30 text-[#7F1D1D] font-semibold" : "bg-gray-50 border-2 border-transparent text-gray-600"}`}>
                          <span>{a.name}</span><span className="text-xs font-bold">+{fm(a.price)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {isSugarSupportedCategory(cfgProd.category) && (
                <div className="mt-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Tahap Gula</p>
                  <div className="grid grid-cols-4 gap-2">
                    {SUGAR_OPTIONS.map(o => (
                      <button key={o.value} onClick={() => setCfgSugar(o.value)} className={`rounded-xl py-3 text-center transition-all ${cfgSugar === o.value ? "bg-[#7F1D1D] text-white shadow-md" : "bg-gray-100 text-gray-600"}`}>
                        <div className="text-base">{o.icon}</div>
                        <div className="text-[10px] font-medium mt-0.5">{o.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-6 flex items-center gap-4">
                <div className="flex items-center gap-3 rounded-xl bg-gray-100 px-2 py-1">
                  <button onClick={() => setCfgQty(q => Math.max(1, q - 1))} className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold text-gray-500 active:bg-gray-200">−</button>
                  <span className="w-8 text-center text-base font-bold">{cfgQty}</span>
                  <button onClick={() => setCfgQty(q => q + 1)} className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold text-gray-500 active:bg-gray-200">+</button>
                </div>
                <button onClick={addToCart} className="flex-1 rounded-xl bg-[#7F1D1D] py-3.5 text-sm font-bold text-white active:bg-[#6B1818] shadow-lg">Tambah · {fm(cfgPrice * cfgQty)}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ━━━ CHECKOUT ━━━ */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <button onClick={() => setShowCheckout(false)} className="text-sm text-gray-400">← Kembali</button>
            <span className="text-sm font-bold text-gray-900">Checkout</span>
            <span className="w-16" />
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {cartItems.map(item => (
              <div key={item.key} className="rounded-2xl bg-gray-50 border border-gray-100 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-900">{item.product_name}{item.variant_name ? ` (${item.variant_name})` : ""}</p>
                    {item.addon_names.length > 0 && <p className="text-xs text-gray-400 mt-0.5">+ {item.addon_names.join(", ")}</p>}
                    {item.sugar_level !== "normal" && <p className="text-xs text-gray-400">{SUGAR_OPTIONS.find(o => o.value === item.sugar_level)?.label} sugar</p>}
                    <p className="mt-1 text-sm font-bold text-[#7F1D1D]">{fm(item.unit_price)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => decQty(item.key)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 font-bold text-sm">−</button>
                    <span className="w-5 text-center text-sm font-bold">{item.qty}</span>
                    <button onClick={() => incQty(item.key)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 font-bold text-sm">+</button>
                  </div>
                </div>
              </div>
            ))}
            <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-3 mt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Maklumat Anda</p>
              <input value={custName} onChange={e => setCustName(e.target.value)} placeholder="Nama *" className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D]" />
              <input value={custPhone} onChange={e => setCustPhone(e.target.value)} placeholder="No Telefon *" type="tel" className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D]" />
              <p className="text-[10px] text-gray-300">WhatsApp notification bila order siap</p>
            </div>
            <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Kaedah Bayaran</p>
              <div className="grid grid-cols-2 gap-2">
                {[["fpx", "Online Banking"], ["card", "Card / E-Wallet"]].map(([m, l]) => (
                  <button key={m} onClick={() => setPayMethod(m)} className={`rounded-xl py-3 text-xs font-bold transition-all ${payMethod === m ? "bg-[#7F1D1D] text-white shadow-md" : "bg-gray-50 border border-gray-200 text-gray-600"}`}>{l}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 px-4 py-4 pb-[env(safe-area-inset-bottom,12px)]">
            <div className="flex justify-between mb-3">
              <span className="text-base font-bold text-gray-900">Jumlah</span>
              <span className="text-xl font-bold text-[#7F1D1D]">{fm(cartTotal)}</span>
            </div>
            {checkoutErr && <p className="text-xs text-red-500 mb-2">{checkoutErr}</p>}
            <button onClick={() => void placeOrder()} disabled={placing || cartItems.length === 0} className="w-full rounded-2xl bg-[#7F1D1D] py-4 text-base font-bold text-white disabled:opacity-50 active:bg-[#6B1818] shadow-lg">
              {placing ? "Memproses..." : `Bayar ${fm(cartTotal)}`}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
