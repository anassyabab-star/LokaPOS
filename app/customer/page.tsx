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
type SuccessData = { receiptNumber: string; total: number; orderId: string };

const SUGAR_OPTIONS = [
  { value: "normal", label: "Normal", icon: "🍯" },
  { value: "less", label: "Kurang", icon: "🍵" },
  { value: "half", label: "Separuh", icon: "½" },
  { value: "none", label: "Kosong", icon: "⚪" },
];

type RewardTier = { points: number; reward: string; color: string };

const TIER_COLORS = [
  "from-[#7F1D1D] to-[#991B1B]",
  "from-[#7F1D1D] to-[#B91C1C]",
  "from-[#7F1D1D] to-[#DC2626]",
  "from-[#5B1010] to-[#7F1D1D]",
];

// Fallback tiers (kept in sync with DEFAULT_LOYALTY_CONFIG.voucherTiers).
// Live values arrive from /api/public/store-status.loyalty_config.voucherTiers.
const REDEEM_TIERS: RewardTier[] = [
  { points: 100, reward: "RM5", color: TIER_COLORS[0] },
  { points: 300, reward: "RM15", color: TIER_COLORS[1] },
  { points: 500, reward: "RM25", color: TIER_COLORS[2] },
  { points: 1000, reward: "RM50", color: TIER_COLORS[3] },
];

const MY_PREFIXES = [
  { prefix: "010", label: "010" }, { prefix: "011", label: "011" },
  { prefix: "012", label: "012" }, { prefix: "013", label: "013" },
  { prefix: "014", label: "014" }, { prefix: "015", label: "015" },
  { prefix: "016", label: "016" }, { prefix: "017", label: "017" },
  { prefix: "018", label: "018" }, { prefix: "019", label: "019" },
  { prefix: "03",  label: "03"  },
];
function splitPhone(phone: string): { prefix: string; rest: string } {
  const digits = phone.replace(/\D/g, "");
  for (const { prefix } of MY_PREFIXES) {
    if (digits.startsWith(prefix)) return { prefix, rest: digits.slice(prefix.length) };
  }
  return { prefix: "011", rest: digits };
}

function fm(v: number) { return `RM${Number(v || 0).toFixed(2)}`; }
function getTier(pts: number): string {
  if (pts >= 1000) return "Platinum";
  if (pts >= 500) return "Emas";
  if (pts >= 200) return "Perak";
  return "Biasa";
}
// todayGridIndex: JS getDay() is 0=Sun…6=Sat; grid is Mon(0)…Sun(6)
function todayGridIndex() { return (new Date().getDay() + 6) % 7; }
function ini(name: string) { return name.trim().charAt(0).toUpperCase() || "?"; }
function buildKey(pid: string, vid: string | null, aids: string[], sugar: string) {
  return `${pid}__${vid || "base"}__${aids.length > 0 ? [...aids].sort().join(",") : "no"}__${sugar}`;
}
function statusLabel(status: string | null) {
  switch (status?.toLowerCase()) {
    case "awaiting_payment": return "Bayar di kaunter";
    case "pending": return "Menunggu";
    case "preparing": return "Sedang Dibuat";
    case "ready": return "Sedia Diambil! 🎉";
    case "completed": return "Selesai";
    case "cancelled": return "Dibatalkan";
    default: return status || "—";
  }
}
function statusStep(status: string | null) {
  switch (status?.toLowerCase()) {
    case "awaiting_payment": return 0;
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

// Coffee cup SVG placeholder
function CoffeePlaceholder({ size = "lg" }: { size?: "sm" | "lg" }) {
  const s = size === "lg" ? "text-4xl" : "text-2xl";
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#7F1D1D]/10 to-[#7F1D1D]/5">
      <span className={s}>☕</span>
    </div>
  );
}

export default function CustomerApp() {
  const [tab, setTab] = useState<AppTab>("home");
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [storeOpen, setStoreOpen] = useState<boolean | null>(null);
  const [enabledPayments, setEnabledPayments] = useState<Record<string, boolean>>({ fpx: true, cash: true });
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [catFilter, setCatFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [cartLoaded, setCartLoaded] = useState(false);

  // Configurator
  const [cfgProd, setCfgProd] = useState<Product | null>(null);
  const [cfgVariant, setCfgVariant] = useState<string | null>(null);
  const [cfgAddons, setCfgAddons] = useState<string[]>([]);
  const [cfgSugar, setCfgSugar] = useState("normal");
  const [cfgQty, setCfgQty] = useState(1);

  // Checkout
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2>(1);
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [phonePrefix, setPhonePrefix] = useState("011");
  const [phoneRest, setPhoneRest] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [payMethod, setPayMethod] = useState("fpx");
  const [placing, setPlacing] = useState(false);
  const [checkoutErr, setCheckoutErr] = useState<string | null>(null);

  // Success screen
  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);

  // Orders
  const [trackedOrders, setTrackedOrders] = useState<TrackedOrder[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");
  const [orderReadyDismissed, setOrderReadyDismissed] = useState(false);

  // Loyalty
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [expiringPoints30d, setExpiringPoints30d] = useState(0);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInMsg, setCheckInMsg] = useState<string | null>(null);

  // Redemption
  const [redeemTier, setRedeemTier] = useState<{ points: number; reward: string; color: string } | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemVoucher, setRedeemVoucher] = useState<{ code: string; reward: string } | null>(null);
  const [redeemErr, setRedeemErr] = useState<string | null>(null);

  // Reward tiers (config-driven via store-status)
  const [rewardTiers, setRewardTiers] = useState<RewardTier[]>(REDEEM_TIERS);

  // Membership + vouchers + referral (from track endpoint)
  const [memberTier, setMemberTier] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [activeVouchers, setActiveVouchers] = useState<Array<{ code: string; reward_label: string | null; reward_amount: number; expires_at: string | null }>>([]);

  // Referral code captured from ?ref= (applied on first guest order)
  const [referralInput, setReferralInput] = useState("");

  // Direct points-at-checkout (config-driven, mirrors POS). Rate/min/ratio come
  // from store-status so the client preview matches what the server enforces.
  const [redeemCfg, setRedeemCfg] = useState({ rmPerPoint: 0.01, minPoints: 100, maxRatio: 0.3 });
  const [useRedeem, setUseRedeem] = useState(false);

  // OTP gate (phone verification before redeem / check-in)
  const [otpGate, setOtpGate] = useState<null | { retry: () => void }>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpErr, setOtpErr] = useState<string | null>(null);
  const [otpSentMsg, setOtpSentMsg] = useState<string | null>(null);

  async function requestOtp() {
    setOtpBusy(true); setOtpErr(null); setOtpSentMsg(null);
    try {
      const res = await fetch("/api/public/otp/request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: custPhone.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Gagal hantar kod");
      setOtpSentMsg("Kod dihantar ke WhatsApp anda.");
    } catch (e) { setOtpErr(e instanceof Error ? e.message : "Ralat"); }
    finally { setOtpBusy(false); }
  }

  function openOtpGate(retry: () => void) {
    setOtpCode(""); setOtpErr(null); setOtpSentMsg(null);
    setOtpGate({ retry });
    void requestOtp();
  }

  async function verifyOtpAndRetry() {
    if (!otpCode.trim() || otpBusy) return;
    setOtpBusy(true); setOtpErr(null);
    try {
      const res = await fetch("/api/public/otp/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: custPhone.trim(), code: otpCode.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Kod salah");
      const retry = otpGate?.retry;
      setOtpGate(null); setOtpCode(""); setOtpSentMsg(null);
      retry?.();
    } catch (e) { setOtpErr(e instanceof Error ? e.message : "Ralat"); }
    finally { setOtpBusy(false); }
  }

  function isOtpRequired(status: number, data: { code?: string }) {
    return status === 401 || data?.code === "OTP_REQUIRED" || data?.code === "OTP_PHONE_MISMATCH";
  }

  // Load catalog
  function fetchCatalog() {
    setLoading(true); setCatalogError(false);
    fetch("/api/public/catalog")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setCategories(d.categories || []); setProducts(d.products || []); })
      .catch(() => setCatalogError(true))
      .finally(() => setLoading(false));
  }
  useEffect(() => { fetchCatalog(); }, []);

  // Store status
  useEffect(() => {
    fetch("/api/public/store-status")
      .then(r => r.json())
      .then(d => {
        setStoreOpen(Boolean(d.is_open));
        if (d.payment_methods) setEnabledPayments(d.payment_methods);
        const lc = d?.loyalty_config;
        if (lc) {
          setRedeemCfg({
            rmPerPoint: Number(lc.redeemRmPerPoint) || 0.01,
            minPoints: Number(lc.redeemMinPoints) || 100,
            maxRatio: Number(lc.redeemMaxRatio) || 0.3,
          });
        }
        const vt = d?.loyalty_config?.voucherTiers;
        if (Array.isArray(vt) && vt.length > 0) {
          setRewardTiers(
            vt.map((t: { points: number; label?: string; amount?: number }, i: number) => ({
              points: Number(t.points),
              reward: String(t.label || `RM${t.amount ?? ""}`),
              color: TIER_COLORS[i % TIER_COLORS.length],
            }))
          );
        }
      })
      .catch(() => setStoreOpen(null));
  }, []);

  // Load persisted data
  useEffect(() => {
    try {
      setCustName(localStorage.getItem("loka_guest_name") || "");
      const savedPhone = localStorage.getItem("loka_guest_phone") || "";
      setCustPhone(savedPhone);
      if (savedPhone) {
        const { prefix, rest } = splitPhone(savedPhone);
        setPhonePrefix(prefix);
        setPhoneRest(rest);
      }
      const savedCart = localStorage.getItem("loka_cart");
      if (savedCart) setCart(JSON.parse(savedCart));
      const urlRef = new URLSearchParams(window.location.search).get("ref");
      const ref = (urlRef || localStorage.getItem("loka_referral_code") || "").trim();
      if (ref) { setReferralInput(ref); localStorage.setItem("loka_referral_code", ref); }
    } catch {}
    setCartLoaded(true);
  }, []);

  // Persist cart
  useEffect(() => {
    if (!cartLoaded) return;
    try { localStorage.setItem("loka_cart", JSON.stringify(cart)); } catch {}
  }, [cart, cartLoaded]);

  // Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showSuccess) return;
      if (cfgProd) { closeCfg(); return; }
      if (showCheckout) { setShowCheckout(false); setCheckoutStep(1); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cfgProd, showCheckout, showSuccess]);

  const loadTrackedOrders = useCallback(async () => {
    const phone = custPhone.trim();
    if (!phone) return;
    setTrackingLoading(true);
    try {
      const res = await fetch(`/api/public/orders/track?phone=${encodeURIComponent(phone)}`, { cache: "no-store" });
      const data = await res.json();
      if (data.orders) {
        setTrackedOrders(data.orders);
        if (typeof data.loyalty_points === "number") setLoyaltyPoints(data.loyalty_points);
        if (typeof data.expiring_points_30d === "number") setExpiringPoints30d(data.expiring_points_30d);
        if (typeof data.tier === "string") setMemberTier(data.tier);
        if (typeof data.referral_code === "string") setReferralCode(data.referral_code);
        if (Array.isArray(data.vouchers)) setActiveVouchers(data.vouchers);
      }
    } catch {} finally { setTrackingLoading(false); }
  }, [custPhone]);

  useEffect(() => { if (tab === "orders" || tab === "home") void loadTrackedOrders(); }, [tab, loadTrackedOrders]);
  const hasActiveOrder = trackedOrders.some(o => ["awaiting_payment", "pending", "preparing", "ready"].includes(o.status?.toLowerCase() || ""));
  useEffect(() => {
    if (tab !== "orders" && !(tab === "home" && hasActiveOrder)) return;
    const i = setInterval(() => void loadTrackedOrders(), 10000);
    return () => clearInterval(i);
  }, [tab, loadTrackedOrders, hasActiveOrder]);

  // Reset ready banner when dismissed or no more ready orders
  const hasReadyOrder = trackedOrders.some(o => o.status?.toLowerCase() === "ready");
  useEffect(() => { if (!hasReadyOrder) setOrderReadyDismissed(false); }, [hasReadyOrder]);

  const filteredProducts = useMemo(() => products.filter(p => {
    const matchCat = catFilter === "All" || p.category === catFilter;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  }), [products, catFilter, search]);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const cartCount = useMemo(() => cartItems.reduce((s, i) => s + i.qty, 0), [cartItems]);
  const cartTotal = useMemo(() => cartItems.reduce((s, i) => s + i.unit_price * i.qty, 0), [cartItems]);

  // Points-as-discount preview — same clamps as the server (calculateRedeem):
  // capped by available balance, the max-ratio of the order, and the min-points
  // floor. Server re-verifies (and OTP-gates) before committing.
  const redeemCalc = useMemo(() => {
    if (!useRedeem || loyaltyPoints < redeemCfg.minPoints || cartTotal <= 0) {
      return { points: 0, amount: 0 };
    }
    const maxByRatio = Math.floor((cartTotal * redeemCfg.maxRatio) / redeemCfg.rmPerPoint);
    const points = Math.min(loyaltyPoints, maxByRatio);
    if (points < redeemCfg.minPoints) return { points: 0, amount: 0 };
    return { points, amount: points * redeemCfg.rmPerPoint };
  }, [useRedeem, loyaltyPoints, redeemCfg, cartTotal]);
  const checkoutTotal = Math.max(0, cartTotal - redeemCalc.amount);

  const activeOrder = trackedOrders.find(o => ["awaiting_payment", "pending", "preparing", "ready"].includes(o.status?.toLowerCase() || ""));
  const activeOrders = trackedOrders.filter(o => ["awaiting_payment", "pending", "preparing", "ready"].includes(o.status?.toLowerCase() || ""));
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

  function doReorder() {
    try {
      const saved = localStorage.getItem("loka_last_cart");
      if (saved) {
        const items = JSON.parse(saved) as CartItem[];
        const newCart: Record<string, CartItem> = {};
        for (const item of items) {
          // Only add items that still exist in current product list
          if (products.find(p => p.id === item.product_id)) {
            const k = buildKey(item.product_id, item.variant_id, item.addon_ids, item.sugar_level);
            newCart[k] = { ...item, key: k };
          }
        }
        if (Object.keys(newCart).length > 0) { setCart(newCart); setTab("menu"); return; }
      }
    } catch {}
    setTab("menu");
  }

  const missions = useMemo(() => [
    {
      id: "first_order", icon: "☕", label: "Pelanggan Pertama",
      desc: "Buat pesanan pertama anda",
      done: trackedOrders.length > 0,
      progress: Math.min(trackedOrders.length, 1), total: 1,
      reward: "Selamat datang!",
    },
    {
      id: "checkin_today", icon: "📅", label: "Check-in Hari Ini",
      desc: "Daftar hadir harian untuk mata percuma",
      done: checkedInToday,
      progress: checkedInToday ? 1 : 0, total: 1,
      reward: "+1 pt/hari",
    },
    {
      id: "five_orders", icon: "🏆", label: "Coffee Addict",
      desc: "Order sebanyak 5 kali",
      done: trackedOrders.length >= 5,
      progress: Math.min(trackedOrders.length, 5), total: 5,
      reward: "Pencapaian 5x",
    },
    {
      id: "collect_100", icon: "⭐", label: "Kumpul 100 Mata",
      desc: "Capai 100 mata untuk buka tebus RM1",
      done: loyaltyPoints >= 100,
      progress: Math.min(loyaltyPoints, 100), total: 100,
      reward: "Unlock RM1 Tebus",
    },
  ], [trackedOrders.length, checkedInToday, loyaltyPoints]);

  async function doRedeem() {
    if (!redeemTier || !custPhone.trim() || redeeming) return;
    const tier = redeemTier;
    setRedeeming(true); setRedeemErr(null);
    try {
      const res = await fetch("/api/public/redeem", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: custPhone.trim(), points: tier.points }),
      });
      const data = await res.json();
      if (isOtpRequired(res.status, data)) {
        setRedeeming(false);
        openOtpGate(() => void doRedeem());
        return;
      }
      if (!res.ok) throw new Error(data.error || "Gagal menebus");
      setRedeemVoucher({ code: data.code, reward: data.reward });
      setRedeemTier(null);
      void loadTrackedOrders(); // refresh balance + vouchers from server
    } catch (e) { setRedeemErr(e instanceof Error ? e.message : "Ralat berlaku"); }
    finally { setRedeeming(false); }
  }

  async function doCheckIn() {
    if (!custPhone.trim() || checkingIn || checkedInToday) return;
    setCheckingIn(true); setCheckInMsg(null);
    try {
      const res = await fetch("/api/public/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: custPhone.trim() }) });
      const data = await res.json();
      if (isOtpRequired(res.status, data)) {
        setCheckingIn(false);
        openOtpGate(() => void doCheckIn());
        return;
      }
      if (data.already_checked_in) { setCheckedInToday(true); setCheckInMsg("Dah check-in hari ini!"); }
      else if (data.success) { setCheckedInToday(true); setLoyaltyPoints(p => p + (data.points_earned || 1)); setCheckInMsg(`+${data.points_earned || 1} pt berjaya ditambah!`); }
      else { setCheckInMsg(data.error || "Gagal check-in"); }
    } catch { setCheckInMsg("Tiada sambungan. Cuba lagi."); }
    finally { setCheckingIn(false); }
  }

  async function placeOrder() {
    if (!custName.trim()) { setCheckoutErr("Sila masukkan nama"); return; }
    if (!custPhone.trim() || custPhone.trim().length < 8) { setCheckoutErr("Sila masukkan no telefon yang sah"); return; }
    setPlacing(true); setCheckoutErr(null);
    try {
      try { localStorage.setItem("loka_guest_name", custName.trim()); localStorage.setItem("loka_guest_phone", custPhone.trim()); } catch {}
      const res = await fetch("/api/public/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_name: custName.trim(), customer_phone: custPhone.trim(), payment_method: payMethod, referral_code: referralInput.trim() || undefined, redeem_points: redeemCalc.points > 0 ? redeemCalc.points : undefined, items: cartItems.map(i => ({ product_id: i.product_id, variant_id: i.variant_id, addon_ids: i.addon_ids, sugar_level: i.sugar_level, qty: i.qty })) })
      });
      const data = await res.json();
      if (!res.ok) {
        // Spending points needs a verified phone — gate then retry the order.
        if (redeemCalc.points > 0 && isOtpRequired(res.status, data)) {
          setPlacing(false);
          openOtpGate(() => void placeOrder());
          return;
        }
        if (data.store_closed) throw new Error("⏰ Kedai sedang tutup. Sila cuba semula semasa waktu operasi.");
        throw new Error(data.error || "Gagal buat order");
      }
      const orderId = data.order_id;
      // Save cart for reorder
      try { localStorage.setItem("loka_last_cart", JSON.stringify(cartItems)); } catch {}

      if (payMethod !== "cash" && orderId) {
        if (!data.payment_url) {
          throw new Error("Gagal jana pautan pembayaran. Sila cuba lagi.");
        }
        setCart({});
        window.location.assign(data.payment_url);
        return;
      }

      setCart({});
      setUseRedeem(false);
      if (redeemCalc.points > 0) setLoyaltyPoints(p => Math.max(0, p - redeemCalc.points));
      setShowCheckout(false);
      setCheckoutStep(1);
      setSuccessData({ receiptNumber: data.order_number || orderId?.slice(0, 8) || "—", total: data.total || cartTotal, orderId });
      setShowSuccess(true);
      void loadTrackedOrders();
    } catch (e) { setCheckoutErr(e instanceof Error ? e.message : "Ralat"); }
    finally { setPlacing(false); }
  }

  const cfgPrice = cfgProd ? cfgProd.price + (cfgProd.variants.find(v => v.id === cfgVariant)?.price_adjustment || 0) + cfgProd.addons.filter(a => cfgAddons.includes(a.id)).reduce((s, a) => s + a.price, 0) : 0;

  if (loading) return (
    <main className="min-h-screen bg-[#FDF8F4] flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-3 animate-bounce">☕</div>
        <p className="text-sm text-[#7F1D1D]/50 font-medium">Memuatkan menu...</p>
      </div>
    </main>
  );

  return (
    <>
      <style>{`
        @keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }
        @keyframes fadeScaleIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes checkDraw { from { stroke-dashoffset: 60; } to { stroke-dashoffset: 0; } }
        @keyframes circleDraw { from { stroke-dashoffset: 170; } to { stroke-dashoffset: 0; } }
        .anim-slide-down { animation: slideDown 0.3s ease-out; }
        .anim-fade-scale { animation: fadeScaleIn 0.35s ease-out; }
        .check-circle { stroke-dasharray: 170; animation: circleDraw 0.5s ease-out forwards; }
        .check-path { stroke-dasharray: 60; stroke-dashoffset: 60; animation: checkDraw 0.4s 0.4s ease-out forwards; }
      `}</style>

      <main className="min-h-screen bg-[#FDF8F4] pb-20">
        <div className="mx-auto w-full max-w-lg">

          {/* ━━━ ORDER READY BANNER ━━━ */}
          {hasReadyOrder && !orderReadyDismissed && (
            <div className="anim-slide-down sticky top-0 z-40">
              <div className="flex items-center justify-between bg-green-600 px-4 py-3">
                <button onClick={() => { setTab("orders"); setOrderReadyDismissed(true); }} className="flex flex-1 items-center gap-2 text-left">
                  <span className="text-lg">🔔</span>
                  <div>
                    <p className="text-xs font-bold text-white">Pesanan sedia diambil!</p>
                    <p className="text-[10px] text-green-100">Tap untuk lihat pesanan</p>
                  </div>
                </button>
                <button onClick={() => setOrderReadyDismissed(true)} className="ml-2 rounded-full bg-white/20 p-1.5 text-white text-xs font-bold">✕</button>
              </div>
            </div>
          )}

          {/* ━━━ HOME ━━━ */}
          {tab === "home" && (
            <div>
              {/* Hero */}
              <div className="relative overflow-hidden px-5 pt-10 pb-7" style={{ background: "linear-gradient(135deg, #7F1D1D 0%, #991B1B 60%, #B91C1C 100%)" }}>
                {/* dot pattern */}
                <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
                <div className="relative">
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <p className="text-red-200/70 text-sm">{greetingText()},</p>
                      <h1 className="text-2xl font-bold text-white mt-0.5">{custName || "Coffee Lover"} ☕</h1>
                    </div>
                    <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold border ${storeOpen === true ? "bg-green-500/20 border-green-400/30 text-green-300" : storeOpen === false ? "bg-white/10 border-white/20 text-red-200" : "bg-white/10 border-white/10 text-white/40"}`}>
                      <div className={`h-1.5 w-1.5 rounded-full ${storeOpen === true ? "bg-green-400 animate-pulse" : "bg-red-300"}`} />
                      {storeOpen === null ? "..." : storeOpen ? "Buka" : "Tutup"}
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="flex-1 rounded-2xl bg-white/10 px-3 py-2.5 border border-white/10">
                      <p className="text-[9px] font-semibold text-red-200/60 uppercase tracking-wider">Loka Points</p>
                      <p className="text-xl font-bold text-white mt-0.5">{loyaltyPoints}</p>
                    </div>
                    <div className="flex-1 rounded-2xl bg-white/10 px-3 py-2.5 border border-white/10">
                      <p className="text-[9px] font-semibold text-red-200/60 uppercase tracking-wider">Total Order</p>
                      <p className="text-xl font-bold text-white mt-0.5">{trackedOrders.length}</p>
                    </div>
                    <div className="flex-1 rounded-2xl bg-white/10 px-3 py-2.5 border border-white/10">
                      <p className="text-[9px] font-semibold text-red-200/60 uppercase tracking-wider">Tier</p>
                      <p className="text-sm font-bold text-white mt-1">{memberTier || getTier(loyaltyPoints)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Active order banner */}
              {activeOrder && (
                <div className="px-4 pt-3">
                  <button onClick={() => setTab("orders")} className="w-full rounded-2xl border border-[#7F1D1D]/20 bg-[#7F1D1D]/5 p-4 text-left active:bg-[#7F1D1D]/10 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7F1D1D] text-white text-base">📋</div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wider">Order Aktif</p>
                          <p className="text-sm font-bold text-gray-900">#{activeOrder.receipt_number}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${activeOrder.status?.toLowerCase() === "ready" ? "bg-green-100 text-green-700" : "bg-[#7F1D1D]/10 text-[#7F1D1D]"}`}>{statusLabel(activeOrder.status)}</span>
                        <p className="text-sm font-bold text-gray-900">{fm(Number(activeOrder.total || 0))}</p>
                      </div>
                    </div>
                    {/* Mini progress */}
                    <div className="mt-3 flex gap-1">
                      {["Diterima","Dibuat","Sedia"].map((s, i) => (
                        <div key={s} className="flex flex-1 flex-col items-center gap-1">
                          <div className={`h-1 w-full rounded-full transition-all ${statusStep(activeOrder.status) >= i ? "bg-[#7F1D1D]" : "bg-gray-200"}`} />
                          <span className={`text-[9px] font-medium ${statusStep(activeOrder.status) >= i ? "text-[#7F1D1D]" : "text-gray-300"}`}>{s}</span>
                        </div>
                      ))}
                    </div>
                  </button>
                </div>
              )}

              {/* Quick actions */}
              <div className="px-4 pt-3">
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => { if (storeOpen === false) return; setTab("menu"); }} className={`rounded-2xl bg-white p-4 shadow-sm border border-gray-100 text-left transition-transform ${storeOpen === false ? "opacity-50" : "active:scale-[0.97]"}`}>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7F1D1D] text-white text-lg mb-2.5">☕</div>
                    <p className="text-sm font-bold text-gray-900">Order Sekarang</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{storeOpen === false ? "Kedai tutup" : `${products.length} item tersedia`}</p>
                  </button>
                  <button onClick={() => setTab("orders")} className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100 text-left active:scale-[0.97] transition-transform">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 text-lg mb-2.5">📍</div>
                    <p className="text-sm font-bold text-gray-900">Jejak Pesanan</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Semak status pesanan</p>
                  </button>
                </div>
              </div>

              {/* Store closed warning */}
              {storeOpen === false && (
                <div className="px-4 pt-3">
                  <div className="flex items-center gap-3 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3">
                    <span className="text-2xl">🕐</span>
                    <div>
                      <p className="text-sm font-bold text-amber-800">Kedai sedang tutup</p>
                      <p className="text-[11px] text-amber-600">Pesanan boleh dibuat semasa waktu operasi</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Last order */}
              {trackedOrders.length > 0 && (
                <div className="px-4 pt-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <h2 className="text-sm font-bold text-gray-900">Pesanan Terkini</h2>
                    <button onClick={() => setTab("orders")} className="text-xs font-semibold text-[#7F1D1D]">Lihat Semua →</button>
                  </div>
                  <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                    <div className={`px-4 py-2.5 border-b border-gray-100 flex items-center justify-between ${trackedOrders[0]?.status === "ready" ? "bg-green-50" : "bg-gray-50"}`}>
                      <p className={`text-xs font-bold ${trackedOrders[0]?.status === "ready" ? "text-green-700" : "text-gray-500"}`}>{statusLabel(trackedOrders[0]?.status)}</p>
                      <p className="text-xs text-gray-400">#{trackedOrders[0]?.receipt_number}</p>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-between">
                      <p className="text-xs text-gray-400">{trackedOrders[0]?.created_at ? new Date(trackedOrders[0].created_at).toLocaleDateString("ms-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</p>
                      <p className="text-sm font-bold text-[#7F1D1D]">{fm(Number(trackedOrders[0]?.total || 0))}</p>
                    </div>
                    <div className="px-4 pb-3">
                      <button onClick={doReorder} className="w-full rounded-xl border-2 border-[#7F1D1D] py-2.5 text-xs font-bold text-[#7F1D1D] active:bg-[#7F1D1D]/5 flex items-center justify-center gap-1.5">
                        <span>↺</span> Pesan Semula
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Popular items */}
              {products.length > 0 && (
                <div className="pt-4 pb-4">
                  <div className="px-4 flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold text-gray-900">Popular</h2>
                    <button onClick={() => setTab("menu")} className="text-xs font-semibold text-[#7F1D1D]">Menu →</button>
                  </div>
                  <div className="flex gap-3 overflow-x-auto scrollbar-hide pl-4 pr-2 pb-1">
                    {products.slice(0, 8).map(p => (
                      <button key={p.id} onClick={() => { setTab("menu"); openCfg(p); }} className="shrink-0 w-32 rounded-2xl bg-white border border-gray-100 overflow-hidden shadow-sm active:scale-[0.95] transition-transform">
                        <div className="aspect-square w-full overflow-hidden">
                          {p.image_url ? <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#7F1D1D]/10 to-[#7F1D1D]/5"><span class="text-3xl">☕</span></div>'; }} /> : <CoffeePlaceholder />}
                        </div>
                        <div className="p-2.5">
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
                  <button onClick={() => setCatFilter("All")} className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${catFilter === "All" ? "bg-[#7F1D1D] text-white shadow-md" : "bg-white text-gray-600 border border-gray-200"}`}>Semua</button>
                  {categories.map(c => (
                    <button key={c.id} onClick={() => setCatFilter(c.name)} className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${catFilter === c.name ? "bg-[#7F1D1D] text-white shadow-md" : "bg-white text-gray-600 border border-gray-200"}`}>{c.name}</button>
                  ))}
                </div>
              </div>
              <div className="px-4 pt-2 pb-4">
                {catalogError ? (
                  <div className="text-center py-16">
                    <div className="text-3xl mb-2">⚠️</div>
                    <p className="text-sm text-gray-500 mb-3">Gagal memuatkan menu</p>
                    <button onClick={fetchCatalog} className="rounded-xl bg-[#7F1D1D] px-5 py-2.5 text-xs font-bold text-white">Cuba Semula</button>
                  </div>
                ) : products.length === 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="rounded-2xl bg-white border border-gray-100 overflow-hidden animate-pulse">
                        <div className="aspect-square bg-gray-200" />
                        <div className="p-3 space-y-2"><div className="h-3 bg-gray-200 rounded w-3/4" /><div className="h-2.5 bg-gray-100 rounded w-1/2" /><div className="h-3 bg-gray-200 rounded w-1/3" /></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      {filteredProducts.map(p => (
                        <button key={p.id} onClick={() => openCfg(p)} className="group overflow-hidden rounded-2xl bg-white border border-gray-100 text-left shadow-sm active:scale-[0.97] transition-transform">
                          <div className="relative aspect-square w-full overflow-hidden">
                            {p.image_url
                              ? <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}/>
                              : <CoffeePlaceholder />}
                            <div className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-[#7F1D1D] text-white text-sm font-bold shadow-md opacity-0 group-active:opacity-100 transition-opacity">+</div>
                          </div>
                          <div className="p-3">
                            <p className="truncate text-sm font-semibold text-gray-900">{p.name}</p>
                            {p.category && <p className="text-[10px] text-gray-400 mt-0.5">{p.category}</p>}
                            <p className="mt-1.5 text-sm font-bold text-[#7F1D1D]">{fm(p.price)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                    {filteredProducts.length === 0 && <div className="py-16 text-center text-sm text-gray-400">Tiada produk dijumpai</div>}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ━━━ REWARDS ━━━ */}
          {tab === "rewards" && (
            <div className="pb-6">
              {/* Hero */}
              <div className="relative overflow-hidden px-5 pt-8 pb-6" style={{ background: "linear-gradient(135deg, #7F1D1D 0%, #991B1B 60%, #B91C1C 100%)" }}>
                <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
                <div className="relative flex flex-col items-center">
                  <div className="relative flex h-36 w-36 items-center justify-center mb-3">
                    <svg className="absolute inset-0" viewBox="0 0 144 144">
                      <circle cx="72" cy="72" r="62" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="8" />
                      <circle cx="72" cy="72" r="62" fill="none" stroke="white" strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={`${Math.min((loyaltyPoints / 1000) * 390, 390)} 390`}
                        transform="rotate(-90 72 72)" className="transition-all duration-1000" />
                    </svg>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-white">{loyaltyPoints}</div>
                      <div className="text-[10px] text-red-200 font-medium">mata</div>
                    </div>
                  </div>
                  <span className="rounded-full bg-white/20 px-4 py-1 text-xs font-bold text-white">{memberTier || getTier(loyaltyPoints)}</span>
                  {/* Tier progress */}
                  <div className="mt-4 w-full">
                    <div className="flex justify-between mb-1.5">
                      {[{ label: "Biasa", pts: 0 }, { label: "Perak", pts: 200 }, { label: "Emas", pts: 500 }, { label: "Platinum", pts: 1000 }].map(t => (
                        <span key={t.label} className={`text-[9px] font-bold ${loyaltyPoints >= t.pts ? "text-white" : "text-white/30"}`}>{t.label}</span>
                      ))}
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/20">
                      <div className="h-full rounded-full bg-white transition-all duration-1000" style={{ width: `${Math.min((loyaltyPoints / 1000) * 100, 100)}%` }} />
                    </div>
                    <p className="text-center text-[10px] text-red-200 mt-1.5">
                      {loyaltyPoints >= 1000 ? "Tahap tertinggi! 🏆" : `${1000 - Math.min(loyaltyPoints, 1000)} pts lagi ke Platinum`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-4 pt-4 space-y-4">
                {/* Expiring warning */}
                {expiringPoints30d > 0 && (
                  <div className="flex items-center gap-3 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3">
                    <span className="text-xl">⏳</span>
                    <div>
                      <p className="text-sm font-bold text-amber-800">{expiringPoints30d} pts akan tamat dalam 30 hari</p>
                      <p className="text-[11px] text-amber-600">Tebus sebelum luput!</p>
                    </div>
                  </div>
                )}

                {/* Misi */}
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-3">🎯 Misi</h3>
                  <div className="space-y-2.5">
                    {missions.map(m => (
                      <div key={m.id} className={`rounded-2xl border p-3.5 ${m.done ? "bg-green-50 border-green-200" : "bg-white border-gray-100"} shadow-sm`}>
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${m.done ? "bg-green-100" : "bg-gray-100"}`}>{m.icon}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-xs font-bold ${m.done ? "text-green-700" : "text-gray-900"}`}>{m.label}</p>
                              <span className={`text-[10px] font-bold shrink-0 ${m.done ? "text-green-600" : "text-[#7F1D1D]"}`}>{m.reward}</span>
                            </div>
                            <p className="text-[11px] text-gray-400 mt-0.5">{m.desc}</p>
                            {m.total > 1 && (
                              <div className="mt-1.5">
                                <div className="h-1 w-full rounded-full bg-gray-100">
                                  <div className={`h-full rounded-full transition-all ${m.done ? "bg-green-500" : "bg-[#7F1D1D]"}`} style={{ width: `${(m.progress / m.total) * 100}%` }} />
                                </div>
                                <p className="text-[9px] text-gray-400 mt-0.5">{m.progress}/{m.total}</p>
                              </div>
                            )}
                          </div>
                          {m.done && <span className="text-green-500 text-lg shrink-0">✓</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Daily Check-in */}
                <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-gray-900">Check-in Harian</h3>
                    <span className="text-xs text-[#7F1D1D] font-semibold">+1 pt/hari</span>
                  </div>
                  <div className="flex justify-between mb-3">
                    {["Isn", "Sel", "Rab", "Kha", "Jum", "Sab", "Ahd"].map((day, i) => {
                      const today = todayGridIndex();
                      const isToday = i === today;
                      const isPast = i < today;
                      return (
                        <div key={day} className="flex flex-col items-center gap-1">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold ${isToday && checkedInToday ? "bg-[#7F1D1D] text-white" : isToday ? "border-2 border-[#7F1D1D] text-[#7F1D1D]" : isPast ? "bg-gray-100 text-gray-400" : "bg-gray-50 text-gray-200"}`}>
                            {isToday && checkedInToday ? "✓" : isToday ? "+" : "·"}
                          </div>
                          <span className={`text-[9px] font-medium ${isToday ? "text-[#7F1D1D]" : "text-gray-300"}`}>{day}</span>
                        </div>
                      );
                    })}
                  </div>
                  {checkInMsg && <p className="text-center text-xs mb-2 font-medium" style={{ color: checkInMsg.startsWith("+") ? "#16a34a" : "#7F1D1D" }}>{checkInMsg}</p>}
                  <button onClick={() => void doCheckIn()} disabled={checkedInToday || checkingIn || !custPhone.trim()} className="w-full rounded-xl bg-[#7F1D1D] py-2.5 text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed active:bg-[#6B1818]">
                    {checkingIn ? "Sedang Check-in..." : checkedInToday ? "✓ Dah Check-in Hari Ini" : "Check In & Dapat 1 pt"}
                  </button>
                  {!custPhone.trim() && <p className="text-center text-[10px] text-gray-400 mt-1.5">Tetapkan no telefon dalam tab Akaun dahulu</p>}
                </div>

                {/* Tebus Ganjaran */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-gray-900">🎁 Tebus Ganjaran</h3>
                    <span className="text-xs text-gray-400">{loyaltyPoints} pts ada</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {rewardTiers.map(tier => {
                      const canRedeem = loyaltyPoints >= tier.points && custPhone.trim();
                      return (
                        <button key={tier.points} onClick={() => canRedeem && setRedeemTier(tier)} className={`rounded-2xl bg-gradient-to-br ${tier.color} p-4 shadow-md relative overflow-hidden text-left transition-transform ${canRedeem ? "active:scale-[0.97]" : "opacity-50 cursor-not-allowed"}`}>
                          <div className="absolute right-2 top-2 text-white/10 text-4xl font-black">☕</div>
                          <p className="text-2xl font-black text-white">{tier.reward}</p>
                          <p className="text-xs text-red-200 mt-1">Tebus dengan</p>
                          <p className="text-sm font-bold text-white">{tier.points} pts</p>
                          {canRedeem
                            ? <div className="mt-2 rounded-lg bg-white/25 py-1 text-center text-[10px] font-bold text-white">Tebus Sekarang →</div>
                            : <div className="mt-2 rounded-lg bg-black/10 py-1 text-center text-[10px] font-medium text-white/60">
                                {!custPhone.trim() ? "Set no telefon dulu" : `Perlu ${tier.points - loyaltyPoints} pts lagi`}
                              </div>
                          }
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Voucher aktif */}
                {activeVouchers.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-3">🎟️ Voucher Anda</h3>
                    <div className="space-y-2">
                      {activeVouchers.map(v => (
                        <div key={v.code} className="flex items-center justify-between rounded-2xl border border-dashed border-[#7F1D1D]/40 bg-white p-3.5">
                          <div>
                            <p className="text-lg font-black tracking-widest text-[#7F1D1D]">{v.code}</p>
                            <p className="text-[11px] text-gray-400">
                              {v.reward_label || `RM${v.reward_amount}`} OFF
                              {v.expires_at ? ` • sah hingga ${new Date(v.expires_at).toLocaleDateString("ms-MY", { day: "numeric", month: "short" })}` : ""}
                            </p>
                          </div>
                          <span className="rounded-full bg-[#7F1D1D]/10 px-3 py-1 text-[10px] font-bold text-[#7F1D1D]">Tunjuk kaunter</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Kod rujukan */}
                {referralCode && (
                  <div className="rounded-2xl bg-gradient-to-br from-[#7F1D1D] to-[#B91C1C] p-4 text-white">
                    <p className="text-xs font-bold uppercase tracking-wider text-white/70">Kod Rujukan Anda</p>
                    <p className="mt-1 text-2xl font-black tracking-widest">{referralCode}</p>
                    <p className="mt-1 text-[11px] text-white/80">Kongsi dengan kawan — kamu berdua dapat bonus points bila mereka order kali pertama.</p>
                  </div>
                )}

                {/* How it works */}
                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Cara Ganjaran Berfungsi</h4>
                  <div className="space-y-2.5">
                    {[
                      { icon: "🛍️", text: "Buat order → dapat mata (berdasarkan jumlah belanja)" },
                      { icon: "📅", text: "Check-in harian → +1 pt percuma setiap hari" },
                      { icon: "🎁", text: "Kumpul mata → tebus diskaun tunai" },
                      { icon: "🧾", text: "Tunjuk kod voucher kepada kaunter untuk gunakan" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <span className="text-base shrink-0">{item.icon}</span>
                        <p className="text-xs text-gray-500">{item.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ━━━ ORDERS ━━━ */}
          {tab === "orders" && (
            <div className="px-4 pt-5">
              <h1 className="text-center text-lg font-bold text-gray-900 mb-4">Pesanan Saya</h1>
              <div className="flex gap-2 mb-4">
                {([{ key: "all" as OrderFilter, label: "Semua" }, { key: "active" as OrderFilter, label: `Aktif ${activeOrders.length > 0 ? `(${activeOrders.length})` : ""}` }, { key: "past" as OrderFilter, label: "Lepas" }]).map(f => (
                  <button key={f.key} onClick={() => setOrderFilter(f.key)} className={`rounded-full px-5 py-2 text-xs font-semibold transition-all ${orderFilter === f.key ? "bg-[#7F1D1D] text-white shadow-md" : "bg-white text-gray-600 border border-gray-200"}`}>{f.label}</button>
                ))}
              </div>
              {!custPhone.trim() ? (
                <div className="text-center py-16 px-4">
                  <div className="text-4xl mb-3">📱</div>
                  <p className="text-sm text-gray-500 mb-1">Masukkan no telefon untuk lihat pesanan</p>
                  <p className="text-xs text-gray-400 mb-4">Pergi ke tab Akaun untuk tetapkan no telefon</p>
                  <button onClick={() => setTab("account")} className="rounded-xl bg-[#7F1D1D] px-6 py-2.5 text-sm font-bold text-white">Pergi ke Akaun</button>
                </div>
              ) : trackingLoading && displayedOrders.length === 0 ? (
                <div className="space-y-3">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="rounded-2xl bg-white border border-gray-100 p-4 animate-pulse space-y-2">
                      <div className="h-3 bg-gray-200 rounded w-1/3" />
                      <div className="h-4 bg-gray-200 rounded w-1/2" />
                      <div className="h-3 bg-gray-100 rounded w-1/4" />
                    </div>
                  ))}
                </div>
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
                    const isReady = order.status?.toLowerCase() === "ready";
                    return (
                      <div key={order.id} className={`rounded-2xl bg-white border shadow-sm overflow-hidden ${isReady ? "border-green-200" : "border-gray-100"}`}>
                        <div className={`px-4 py-2.5 border-b flex items-center justify-between ${isReady ? "bg-green-50 border-green-100" : isActive ? "bg-[#7F1D1D]/5 border-gray-100" : "bg-gray-50 border-gray-100"}`}>
                          <div className="flex items-center gap-2">
                            {isReady && <span className="text-sm">🎉</span>}
                            <p className={`text-xs font-bold ${isReady ? "text-green-700" : isActive ? "text-[#7F1D1D]" : "text-gray-500"}`}>{statusLabel(order.status)}</p>
                          </div>
                          <span className="text-[10px] text-gray-400">#{order.receipt_number}</span>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between">
                          <p className="text-xs text-gray-400">{new Date(order.created_at).toLocaleDateString("ms-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                          <p className="text-sm font-bold text-[#7F1D1D]">{fm(Number(order.total || 0))}</p>
                        </div>
                        {isActive && (
                          <div className="px-4 pb-3">
                            <div className="flex items-center gap-1.5">
                              {["Diterima", "Dibuat", "Sedia"].map((s, i) => (
                                <div key={s} className="flex flex-1 flex-col items-center gap-1">
                                  <div className={`h-1.5 w-full rounded-full transition-all ${step >= i ? (isReady ? "bg-green-500" : "bg-[#7F1D1D]") : "bg-gray-200"}`} />
                                  <span className={`text-[9px] font-medium ${step >= i ? (isReady ? "text-green-600" : "text-[#7F1D1D]") : "text-gray-300"}`}>{s}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button onClick={() => void loadTrackedOrders()} className="w-full py-3 text-xs font-semibold text-[#7F1D1D] flex items-center justify-center gap-1">
                    <span className={trackingLoading ? "animate-spin" : ""}>↻</span> Refresh
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ━━━ ACCOUNT ━━━ */}
          {tab === "account" && (
            <div>
              <div className="px-5 pt-6 pb-4 flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#7F1D1D] text-2xl font-bold text-white shrink-0">
                  {custName ? ini(custName) : "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold text-gray-900 truncate">{custName || "Tetamu"}</p>
                  <p className="text-sm text-gray-400">{custPhone || "Belum set telefon"}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] font-bold text-[#7F1D1D] bg-[#7F1D1D]/10 px-2 py-0.5 rounded-full">{memberTier || getTier(loyaltyPoints)}</span>
                    <span className="text-[10px] text-gray-400">{loyaltyPoints} pts</span>
                  </div>
                </div>
              </div>

              <div className="px-5 mb-4">
                <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex border-b border-gray-100">
                    <div className="flex-1 px-4 py-3 text-center border-r border-gray-100">
                      <p className="text-xl font-bold text-[#7F1D1D]">{loyaltyPoints}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Points</p>
                    </div>
                    <div className="flex-1 px-4 py-3 text-center">
                      <p className="text-xl font-bold text-gray-900">{trackedOrders.length}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Order</p>
                    </div>
                  </div>
                  {expiringPoints30d > 0 && (
                    <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100">
                      <p className="text-xs text-amber-700 font-medium">⏳ {expiringPoints30d} pts akan luput dalam 30 hari</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-5 mb-4">
                <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                  <p className="px-4 pt-3.5 pb-1.5 text-xs font-bold text-[#7F1D1D]/60 uppercase tracking-wider">Maklumat Saya</p>
                  {[
                    { icon: "📦", label: "Pesanan Saya", action: () => setTab("orders") },
                    { icon: "🎁", label: "Ganjaran & Misi", action: () => setTab("rewards") },
                  ].map(item => (
                    <button key={item.label} onClick={item.action} className="flex w-full items-center gap-3 px-4 py-3.5 border-t border-gray-50 text-left active:bg-gray-50">
                      <span className="text-lg">{item.icon}</span>
                      <span className="flex-1 text-sm font-medium text-gray-900">{item.label}</span>
                      <span className="text-gray-300">›</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="px-5 mb-4">
                <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                  <button onClick={() => setProfileOpen(o => !o)} className="flex w-full items-center justify-between px-4 pt-3.5 pb-3.5 active:bg-gray-50">
                    <p className="text-xs font-bold text-[#7F1D1D]/60 uppercase tracking-wider">Profil</p>
                    <span className={`text-gray-400 text-sm transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`}>⌄</span>
                  </button>
                  {profileOpen && <div className="border-t border-gray-100 px-4 py-3.5 space-y-2.5">
                    <div>
                      <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Nama</label>
                      <input value={custName} onChange={e => { setCustName(e.target.value); try { localStorage.setItem("loka_guest_name", e.target.value); } catch {} }} placeholder="Masukkan nama" className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20" />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">No Telefon</label>
                      <div className="mt-1 flex gap-2">
                        <select
                          value={phonePrefix}
                          onChange={e => {
                            const p = e.target.value;
                            setPhonePrefix(p);
                            const full = p + phoneRest;
                            setCustPhone(full);
                            try { localStorage.setItem("loka_guest_phone", full); } catch {}
                          }}
                          className="w-24 shrink-0 rounded-xl border border-gray-200 px-2 py-2.5 text-sm outline-none focus:border-[#7F1D1D] bg-white"
                        >
                          {MY_PREFIXES.map(({ prefix, label }) => (
                            <option key={prefix} value={prefix}>{label}</option>
                          ))}
                        </select>
                        <input
                          value={phoneRest}
                          onChange={e => {
                            const digits = e.target.value.replace(/\D/g, "");
                            setPhoneRest(digits);
                            const full = phonePrefix + digits;
                            setCustPhone(full);
                            try { localStorage.setItem("loka_guest_phone", full); } catch {}
                          }}
                          placeholder="40026446"
                          type="tel"
                          inputMode="numeric"
                          maxLength={9}
                          className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-400">No telefon digunakan untuk jejak pesanan & notifikasi WhatsApp</p>
                  </div>}
                </div>
              </div>

              <div className="px-5 mb-6">
                <p className="text-center text-[10px] text-gray-300">Loka Coffee · v2.1</p>
              </div>
            </div>
          )}
        </div>

        {/* ━━━ STICKY CART BAR ━━━ */}
        {cartCount > 0 && tab === "menu" && !cfgProd && !showCheckout && (
          <div className="fixed bottom-[72px] left-0 right-0 z-30 px-4 pb-2">
            <div className="mx-auto max-w-lg">
              <button onClick={() => { setShowCheckout(true); setCheckoutStep(1); }} className="w-full rounded-2xl bg-[#7F1D1D] py-3.5 text-white shadow-xl active:bg-[#6B1818] flex items-center justify-between px-5">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-xs font-bold">{cartCount}</span>
                  <span className="text-sm font-bold">Lihat Cart</span>
                </div>
                <span className="text-sm font-bold">{fm(cartTotal)}</span>
              </button>
            </div>
          </div>
        )}

        {/* ━━━ BOTTOM NAV ━━━ */}
        {!showCheckout && !cfgProd && !showSuccess && (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom,0px)]">
            <div className="mx-auto max-w-lg flex">
              {([
                { key: "home" as AppTab, label: "Home", icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>
                )},
                { key: "menu" as AppTab, label: "Menu", icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
                )},
                { key: "rewards" as AppTab, label: "Rewards", icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>
                )},
                { key: "orders" as AppTab, label: "Orders", badge: activeOrders.length > 0, icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
                )},
                { key: "account" as AppTab, label: "Account", icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                )},
              ]).map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} className={`relative flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-colors ${tab === t.key ? "text-[#7F1D1D]" : "text-gray-400"}`}>
                  {t.icon}
                  {t.label}
                  {t.badge && <div className="absolute top-1.5 right-[18%] h-2 w-2 rounded-full bg-[#7F1D1D] border-2 border-white" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ━━━ PRODUCT CONFIGURATOR ━━━ */}
        {cfgProd && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={closeCfg}>
            <div className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl anim-fade-scale" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <div className="mx-auto h-1 w-10 rounded-full bg-gray-200" />
                <button onClick={closeCfg} className="absolute right-4 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 text-sm font-bold active:bg-gray-200">✕</button>
              </div>
              <div className="aspect-video w-full overflow-hidden bg-gray-100">
                {cfgProd.image_url ? <img src={cfgProd.image_url} alt={cfgProd.name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#7F1D1D]/10 to-[#7F1D1D]/5"><span className="text-6xl">☕</span></div>}
              </div>
              <div className="px-5 pt-4 pb-10">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{cfgProd.name}</h2>
                    {cfgProd.category && <p className="text-xs text-gray-400 mt-0.5">{cfgProd.category}</p>}
                  </div>
                  <p className="text-lg font-bold text-[#7F1D1D]">{fm(cfgPrice)}</p>
                </div>

                {cfgProd.variants.length > 0 && (
                  <div className="mt-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Pilih Saiz</p>
                    <div className="flex gap-2 flex-wrap">
                      {cfgProd.variants.map(v => (
                        <button key={v.id} onClick={() => setCfgVariant(v.id)} className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${cfgVariant === v.id ? "bg-[#7F1D1D] text-white shadow-md" : "bg-gray-100 text-gray-600"}`}>
                          {v.name}{v.price_adjustment > 0 ? ` +${fm(v.price_adjustment)}` : ""}
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
                  <button onClick={addToCart} className="flex-1 rounded-xl bg-[#7F1D1D] py-3.5 text-sm font-bold text-white active:bg-[#6B1818] shadow-lg">
                    Tambah · {fm(cfgPrice * cfgQty)}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ━━━ CHECKOUT (2-step) ━━━ */}
        {showCheckout && (
          <div className="fixed inset-0 z-50 flex flex-col bg-white">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <button onClick={() => { if (checkoutStep === 2) setCheckoutStep(1); else { setShowCheckout(false); setCheckoutStep(1); } }} className="text-sm text-gray-400">
                {checkoutStep === 2 ? "← Kembali" : "✕ Tutup"}
              </button>
              <div className="flex items-center gap-2">
                {[1, 2].map(s => (
                  <div key={s} className={`h-2 rounded-full transition-all ${checkoutStep === s ? "w-6 bg-[#7F1D1D]" : checkoutStep > s ? "w-2 bg-[#7F1D1D]/40" : "w-2 bg-gray-200"}`} />
                ))}
              </div>
              <span className="w-16 text-right text-xs text-gray-400">{checkoutStep}/2</span>
            </div>

            {/* Step 1: Cart review */}
            {checkoutStep === 1 && (
              <>
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <h2 className="text-base font-bold text-gray-900 mb-3">Semak Cart</h2>
                  <div className="space-y-2.5">
                    {cartItems.map(item => (
                      <div key={item.key} className="rounded-2xl bg-gray-50 border border-gray-100 p-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-gray-900">{item.product_name}{item.variant_name ? ` (${item.variant_name})` : ""}</p>
                            {item.addon_names.length > 0 && <p className="text-xs text-gray-400 mt-0.5">+ {item.addon_names.join(", ")}</p>}
                            {item.sugar_level !== "normal" && <p className="text-xs text-gray-400">Gula {SUGAR_OPTIONS.find(o => o.value === item.sugar_level)?.label}</p>}
                            <p className="mt-1 text-sm font-bold text-[#7F1D1D]">{fm(item.unit_price)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => decQty(item.key)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 font-bold text-sm active:bg-gray-100">−</button>
                            <span className="w-5 text-center text-sm font-bold">{item.qty}</span>
                            <button onClick={() => incQty(item.key)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 font-bold text-sm active:bg-gray-100">+</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-t border-gray-100 px-4 py-4 pb-[env(safe-area-inset-bottom,12px)]">
                  <div className="flex justify-between mb-3">
                    <span className="text-sm text-gray-500">{cartCount} item</span>
                    <span className="text-lg font-bold text-[#7F1D1D]">{fm(cartTotal)}</span>
                  </div>
                  <button onClick={() => setCheckoutStep(2)} disabled={cartItems.length === 0} className="w-full rounded-2xl bg-[#7F1D1D] py-4 text-base font-bold text-white disabled:opacity-50 active:bg-[#6B1818] shadow-lg">
                    Seterusnya →
                  </button>
                </div>
              </>
            )}

            {/* Step 2: Details + payment */}
            {checkoutStep === 2 && (
              <>
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  <h2 className="text-base font-bold text-gray-900 mb-3">Maklumat & Bayaran</h2>
                  <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Maklumat Anda</p>
                    <input value={custName} onChange={e => setCustName(e.target.value)} placeholder="Nama *" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20" />
                    <div className="flex gap-2">
                      <select value={phonePrefix} onChange={e => { const p = e.target.value; setPhonePrefix(p); setCustPhone(p + phoneRest); }} className="w-24 shrink-0 rounded-xl border border-gray-200 px-2 py-3 text-sm outline-none focus:border-[#7F1D1D] bg-white">
                        {MY_PREFIXES.map(({ prefix, label }) => <option key={prefix} value={prefix}>{label}</option>)}
                      </select>
                      <input value={phoneRest} onChange={e => { const d = e.target.value.replace(/\D/g, ""); setPhoneRest(d); setCustPhone(phonePrefix + d); }} placeholder="40026446 *" type="tel" inputMode="numeric" maxLength={9} className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20" />
                    </div>
                    <p className="text-[10px] text-gray-300">Notifikasi WhatsApp & jejak pesanan</p>
                  </div>
                  <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Kaedah Bayaran</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { key: "fpx",  icon: "🏦", label: "Online Banking" },
                        { key: "cash", icon: "💵", label: "Cash — Kaunter" },
                        { key: "card", icon: "💳", label: "Card / E-Wallet" },
                      ] as const).filter(m => enabledPayments[m.key]).map(m => (
                        <button key={m.key} onClick={() => setPayMethod(m.key)} className={`rounded-xl py-3.5 text-xs font-bold transition-all flex flex-col items-center gap-1 ${payMethod === m.key ? "bg-[#7F1D1D] text-white shadow-md" : "bg-gray-50 border border-gray-200 text-gray-600"}`}>
                          <span className="text-xl">{m.icon}</span>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Guna mata — points as a direct discount (OTP-gated on submit) */}
                  {loyaltyPoints >= redeemCfg.minPoints && (
                    <div className="rounded-2xl bg-white border border-gray-200 p-4">
                      <button
                        type="button"
                        onClick={() => setUseRedeem(v => !v)}
                        className="flex w-full items-center justify-between gap-3"
                      >
                        <div className="text-left">
                          <p className="text-sm font-bold text-gray-900">Guna mata ganjaran</p>
                          <p className="text-[11px] text-gray-400">
                            Anda ada {loyaltyPoints} mata
                            {useRedeem && redeemCalc.points > 0
                              ? ` · guna ${redeemCalc.points} (−${fm(redeemCalc.amount)})`
                              : ` · maks ${Math.round(redeemCfg.maxRatio * 100)}% order`}
                          </p>
                        </div>
                        <span
                          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${useRedeem ? "bg-[#7F1D1D]" : "bg-gray-200"}`}
                        >
                          <span
                            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${useRedeem ? "left-[22px]" : "left-0.5"}`}
                          />
                        </span>
                      </button>
                      {useRedeem && redeemCalc.points === 0 && (
                        <p className="mt-2 text-[11px] text-amber-600">
                          Mata tidak mencukupi untuk order ini (min {redeemCfg.minPoints} mata).
                        </p>
                      )}
                    </div>
                  )}
                  {/* Order summary */}
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3 space-y-1.5">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ringkasan</p>
                    {cartItems.map(item => (
                      <div key={item.key} className="flex justify-between text-xs">
                        <span className="text-gray-600">{item.product_name} × {item.qty}</span>
                        <span className="font-semibold text-gray-900">{fm(item.unit_price * item.qty)}</span>
                      </div>
                    ))}
                    {redeemCalc.amount > 0 && (
                      <div className="flex justify-between text-xs pt-0.5">
                        <span className="text-gray-600">Tebus mata ({redeemCalc.points} pts)</span>
                        <span className="font-semibold text-green-600">−{fm(redeemCalc.amount)}</span>
                      </div>
                    )}
                    <div className="border-t border-gray-200 pt-1.5 flex justify-between">
                      <span className="text-sm font-bold text-gray-900">Jumlah</span>
                      <span className="text-sm font-bold text-[#7F1D1D]">{fm(checkoutTotal)}</span>
                    </div>
                  </div>
                </div>
                <div className="border-t border-gray-100 px-4 py-4 pb-[env(safe-area-inset-bottom,12px)]">
                  {checkoutErr && <p className="text-xs text-red-500 mb-2 text-center">{checkoutErr}</p>}
                  <button onClick={() => void placeOrder()} disabled={placing || cartItems.length === 0} className="w-full rounded-2xl bg-[#7F1D1D] py-4 text-base font-bold text-white disabled:opacity-50 active:bg-[#6B1818] shadow-lg">
                    {placing ? "Memproses..." : `Bayar ${fm(checkoutTotal)}`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ━━━ REDEEM CONFIRM MODAL ━━━ */}
        {redeemTier && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={() => { setRedeemTier(null); setRedeemErr(null); }}>
            <div className="w-full max-w-lg rounded-t-3xl bg-white p-6 pb-[env(safe-area-inset-bottom,24px)] anim-fade-scale" onClick={e => e.stopPropagation()}>
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" />
              <div className={`rounded-2xl bg-gradient-to-br ${redeemTier.color} p-5 mb-5 text-center`}>
                <p className="text-4xl font-black text-white">{redeemTier.reward}</p>
                <p className="text-sm text-red-200 mt-1">Diskaun Tunai</p>
              </div>
              <div className="space-y-2 mb-5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Kos tebus</span>
                  <span className="font-bold text-gray-900">{redeemTier.points} pts</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Baki mata anda</span>
                  <span className="font-bold text-gray-900">{loyaltyPoints} pts</span>
                </div>
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="text-gray-500">Baki selepas tebus</span>
                  <span className="font-bold text-[#7F1D1D]">{loyaltyPoints - redeemTier.points} pts</span>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 text-center mb-4">Kod voucher akan dipaparkan — tunjuk kepada kaunter untuk gunakan diskaun.</p>
              {redeemErr && <p className="text-xs text-red-500 text-center mb-3">{redeemErr}</p>}
              <button onClick={() => void doRedeem()} disabled={redeeming} className="w-full rounded-2xl bg-[#7F1D1D] py-4 text-sm font-bold text-white disabled:opacity-50 active:bg-[#6B1818]">
                {redeeming ? "Memproses..." : `Tebus ${redeemTier.reward} — ${redeemTier.points} pts`}
              </button>
              <button onClick={() => { setRedeemTier(null); setRedeemErr(null); }} className="w-full py-3 text-sm text-gray-400 font-medium mt-1">Batal</button>
            </div>
          </div>
        )}

        {/* ━━━ VOUCHER SCREEN ━━━ */}
        {redeemVoucher && (
          <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#FDF8F4] px-6">
            <div className="anim-fade-scale flex flex-col items-center w-full max-w-sm">
              <div className="mb-2 text-5xl">🎉</div>
              <h1 className="text-2xl font-bold text-gray-900 mt-2">Tebus Berjaya!</h1>
              <p className="text-gray-400 text-sm mt-1">Diskaun {redeemVoucher.reward} untuk pesanan anda</p>
              <div className="mt-6 w-full rounded-3xl border-2 border-dashed border-[#7F1D1D] bg-white p-6 text-center shadow-lg">
                <p className="text-xs font-bold text-[#7F1D1D]/50 uppercase tracking-widest mb-2">Kod Voucher</p>
                <p className="text-4xl font-black tracking-widest text-[#7F1D1D]">{redeemVoucher.code}</p>
                <div className="mt-3 h-px bg-gray-100" />
                <p className="text-2xl font-black text-gray-900 mt-3">{redeemVoucher.reward} OFF</p>
                <p className="text-xs text-gray-400 mt-1">Sah hari ini sahaja</p>
              </div>
              <div className="mt-4 w-full rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3">
                <span className="text-xl">⚠️</span>
                <p className="text-xs text-amber-700 font-medium">Tunjuk kod ini kepada kaunter sebelum bayar. Satu penggunaan sahaja.</p>
              </div>
              <button onClick={() => { setRedeemVoucher(null); setTab("rewards"); }} className="mt-5 w-full rounded-2xl bg-[#7F1D1D] py-4 text-base font-bold text-white shadow-lg active:bg-[#6B1818]">
                Selesai
              </button>
            </div>
          </div>
        )}

        {/* ━━━ OTP VERIFICATION ━━━ */}
        {otpGate && (
          <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40" onClick={() => setOtpGate(null)}>
            <div className="w-full max-w-lg rounded-t-3xl bg-white p-6 anim-fade-scale" onClick={e => e.stopPropagation()}>
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" />
              <h2 className="text-lg font-bold text-gray-900">Sahkan No. Telefon</h2>
              <p className="text-sm text-gray-400 mt-1">
                Kami hantar kod 6-digit ke WhatsApp <span className="font-semibold text-gray-600">{custPhone.trim()}</span>.
              </p>
              <input
                inputMode="numeric"
                maxLength={6}
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="• • • • • •"
                className="mt-4 w-full rounded-2xl border border-gray-200 py-4 text-center text-2xl font-black tracking-[0.4em] outline-none focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20"
              />
              {otpSentMsg && <p className="mt-2 text-xs text-green-600 text-center">{otpSentMsg}</p>}
              {otpErr && <p className="mt-2 text-xs text-red-500 text-center">{otpErr}</p>}
              <button
                onClick={() => void verifyOtpAndRetry()}
                disabled={otpBusy || otpCode.length < 4}
                className="mt-4 w-full rounded-2xl bg-[#7F1D1D] py-4 text-sm font-bold text-white disabled:opacity-40 active:bg-[#6B1818]"
              >
                {otpBusy ? "Mengesahkan..." : "Sahkan & Teruskan"}
              </button>
              <button onClick={() => void requestOtp()} disabled={otpBusy} className="mt-2 w-full py-2 text-xs font-semibold text-[#7F1D1D] disabled:opacity-40">
                Hantar semula kod
              </button>
              <button onClick={() => setOtpGate(null)} className="w-full py-2 text-xs text-gray-400">Batal</button>
            </div>
          </div>
        )}

        {/* ━━━ SUCCESS SCREEN ━━━ */}
        {showSuccess && successData && (
          <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#FDF8F4] px-6">
            <div className="anim-fade-scale flex flex-col items-center w-full max-w-sm">
              {/* Animated checkmark */}
              <div className="mb-6">
                <svg viewBox="0 0 100 100" className="w-28 h-28">
                  <circle cx="50" cy="50" r="46" fill="none" stroke="#f1e8e8" strokeWidth="6" />
                  <circle cx="50" cy="50" r="46" fill="none" stroke="#7F1D1D" strokeWidth="6" strokeLinecap="round" className="check-circle" transform="rotate(-90 50 50)" />
                  <path d="M28 52 L42 66 L72 36" fill="none" stroke="#7F1D1D" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" className="check-path" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-gray-900">Order Berjaya!</h1>
              <p className="text-gray-400 text-sm mt-1">#{successData.receiptNumber}</p>
              <p className="text-4xl font-bold text-[#7F1D1D] mt-4">{fm(successData.total)}</p>

              <div className="mt-5 w-full rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 flex items-center gap-3 border-b border-gray-100">
                  <span className="text-2xl">⏱</span>
                  <div>
                    <p className="text-xs text-gray-400">Anggaran masa siap</p>
                    <p className="text-base font-bold text-gray-900">± 10 minit</p>
                  </div>
                </div>
                <div className="px-5 py-4 flex items-center gap-3">
                  <span className="text-2xl">📍</span>
                  <div>
                    <p className="text-xs text-gray-400">Ambil di</p>
                    <p className="text-base font-bold text-gray-900">Kaunter Loka Coffee</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => { setShowSuccess(false); setTab("orders"); void loadTrackedOrders(); }}
                className="mt-6 w-full rounded-2xl bg-[#7F1D1D] py-4 text-base font-bold text-white shadow-lg active:bg-[#6B1818]"
              >
                Jejak Pesanan →
              </button>
              <button
                onClick={() => { setShowSuccess(false); setTab("menu"); }}
                className="mt-3 w-full py-3 text-sm font-semibold text-gray-400"
              >
                Order Lagi
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
