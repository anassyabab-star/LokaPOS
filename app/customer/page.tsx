"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isSugarSupportedCategory } from "@/app/pos/types";

type CatalogCategory = {
  id: string;
  name: string;
};

type CatalogVariant = {
  id: string;
  name: string;
  price_adjustment: number;
};

type CatalogAddon = {
  id: string;
  name: string;
  price: number;
};

type CatalogProduct = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  category: string | null;
  variants: CatalogVariant[];
  addons: CatalogAddon[];
};

type CustomerProfile = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  consent_whatsapp: boolean;
  consent_email: boolean;
  total_orders: number;
  total_spend: number;
};

type LoyaltyHistoryRow = {
  id: string;
  order_id: string | null;
  receipt_number: string | null;
  entry_type: "earn" | "redeem" | "adjust";
  points_change: number;
  note: string | null;
  created_at: string;
};

type LoyaltyResponse = {
  points_available: number;
  expiring_points_30d: number;
  history: LoyaltyHistoryRow[];
};

type CartItem = {
  key: string;
  product_id: string;
  product_name: string;
  variant_id: string | null;
  variant_name: string | null;
  addon_ids: string[];
  addon_names: string[];
  sugar_level: "normal" | "less" | "half" | "none";
  qty: number;
  unit_price: number;
};

type OrderSummary = {
  id: string;
  order_number: string;
  created_at: string;
  status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  subtotal: number;
  discount: number;
  total: number;
  item_count: number;
};

type OrderDetailItem = {
  id: string;
  name: string;
  qty: number;
  unit_price: number;
  line_total: number;
  variant_id: string | null;
  sugar_level: string | null;
  addons: string[];
};

type OrderDetail = {
  id: string;
  order_number: string;
  created_at: string;
  customer_name: string | null;
  status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  subtotal: number;
  discount: number;
  total: number;
  items: OrderDetailItem[];
};

type ActiveTab = "menu" | "cart" | "orders" | "account";
type ConsentMode = "none" | "whatsapp" | "email" | "both";
const LOYALTY_REDEEM_MIN_POINTS = 100;
const LOYALTY_REDEEM_RM_PER_POINT = 0.05;
const LOYALTY_REDEEM_MAX_RATIO = 0.3;

const SUGAR_OPTIONS: Array<{ value: CartItem["sugar_level"]; label: string }> = [
  { value: "normal", label: "Normal" },
  { value: "less", label: "Less" },
  { value: "half", label: "Half" },
  { value: "none", label: "No Sugar" },
];

function buildCartKey(
  productId: string,
  variantId: string | null,
  addonIds: string[],
  sugarLevel: CartItem["sugar_level"]
) {
  const addonKey = addonIds.length > 0 ? [...addonIds].sort().join(",") : "noaddon";
  return `${productId}__${variantId || "base"}__${addonKey}__${sugarLevel}`;
}

function formatMoney(value: number) {
  return `RM ${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("en-MY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPayment(method: string | null | undefined) {
  const raw = String(method || "").trim();
  if (!raw) return "-";
  return raw.toUpperCase();
}

function productInitial(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

function readErrorMessage(payload: unknown, fallback: string) {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload.trim() || fallback;
  if (payload instanceof Error) return payload.message || fallback;

  if (typeof payload === "object") {
    const row = payload as Record<string, unknown>;
    const primary = row.error ?? row.message ?? row.details;
    if (typeof primary === "string") return primary.trim() || fallback;
    if (primary && typeof primary === "object") {
      const text = JSON.stringify(primary);
      return text && text !== "{}" ? text : fallback;
    }
  }

  return fallback;
}

function toConsentMode(whatsapp: boolean, email: boolean): ConsentMode {
  if (whatsapp && email) return "both";
  if (whatsapp) return "whatsapp";
  if (email) return "email";
  return "none";
}

function fromConsentMode(mode: ConsentMode) {
  if (mode === "both") return { consent_whatsapp: true, consent_email: true };
  if (mode === "whatsapp") return { consent_whatsapp: true, consent_email: false };
  if (mode === "email") return { consent_whatsapp: false, consent_email: true };
  return { consent_whatsapp: false, consent_email: false };
}

export default function CustomerOrderAppPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("menu");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [menuSearch, setMenuSearch] = useState("");

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loyalty, setLoyalty] = useState<LoyaltyResponse | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);

  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [redeemPoints, setRedeemPoints] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("fpx");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);

  const [configProduct, setConfigProduct] = useState<CatalogProduct | null>(null);
  const [configVariantId, setConfigVariantId] = useState<string | null>(null);
  const [configAddonIds, setConfigAddonIds] = useState<string[]>([]);
  const [configSugar, setConfigSugar] = useState<CartItem["sugar_level"]>("normal");
  const [configQty, setConfigQty] = useState(1);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);

  const [accountName, setAccountName] = useState("");
  const [accountPhone, setAccountPhone] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountBirthDate, setAccountBirthDate] = useState("");
  const [consentMode, setConsentMode] = useState<ConsentMode>("none");
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.qty, 0),
    [cartItems]
  );
  const cartSubtotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.unit_price * item.qty, 0),
    [cartItems]
  );
  const availablePoints = Number(loyalty?.points_available || 0);
  const redeemPointsInputNumber = useMemo(() => {
    const parsed = Math.floor(Number(redeemPoints || 0));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }, [redeemPoints]);
  const maxRedeemPointsByRatio = useMemo(
    () => Math.floor((cartSubtotal * LOYALTY_REDEEM_MAX_RATIO) / LOYALTY_REDEEM_RM_PER_POINT),
    [cartSubtotal]
  );
  const redeemPointsCap = useMemo(
    () => Math.max(0, Math.min(availablePoints, maxRedeemPointsByRatio)),
    [availablePoints, maxRedeemPointsByRatio]
  );
  const canRedeemByMinRule = redeemPointsCap >= LOYALTY_REDEEM_MIN_POINTS;
  const redeemEligibleMaxPoints = canRedeemByMinRule ? redeemPointsCap : 0;
  const appliedRedeemPoints = useMemo(() => {
    if (redeemPointsInputNumber <= 0 || !canRedeemByMinRule) return 0;
    const proposed = Math.min(redeemPointsInputNumber, redeemPointsCap);
    return proposed >= LOYALTY_REDEEM_MIN_POINTS ? proposed : 0;
  }, [redeemPointsInputNumber, canRedeemByMinRule, redeemPointsCap]);
  const estimatedRedeemAmount = appliedRedeemPoints * LOYALTY_REDEEM_RM_PER_POINT;
  const estimatedTotal = Math.max(0, cartSubtotal - estimatedRedeemAmount);

  const filteredProducts = useMemo(() => {
    const byCategory =
      categoryFilter === "All"
        ? products
        : products.filter(product => (product.category || "Uncategorized") === categoryFilter);

    const keyword = menuSearch.trim().toLowerCase();
    if (!keyword) return byCategory;

    return byCategory.filter(product => {
      const haystack = `${product.name} ${product.category || ""}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [products, categoryFilter, menuSearch]);

  const loadCatalog = useCallback(async () => {
    const res = await fetch("/api/customer/catalog", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to load catalog");
    setCategories(Array.isArray(data.categories) ? data.categories : []);
    setProducts(Array.isArray(data.products) ? data.products : []);
  }, []);

  const loadProfile = useCallback(async () => {
    const res = await fetch("/api/customer/me", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to load profile");
    const customer = data.customer as CustomerProfile;
    setProfile(customer);
    setAccountName(customer?.name || "");
    setAccountPhone(customer?.phone || "");
    setAccountEmail(customer?.email || "");
    setAccountBirthDate(customer?.birth_date || "");
    setConsentMode(toConsentMode(Boolean(customer?.consent_whatsapp), Boolean(customer?.consent_email)));
  }, []);

  const loadLoyalty = useCallback(async () => {
    const res = await fetch("/api/customer/loyalty", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to load loyalty");
    setLoyalty(data as LoyaltyResponse);
  }, []);

  const loadOrders = useCallback(async () => {
    const res = await fetch("/api/customer/orders?limit=30", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to load orders");
    setOrders(Array.isArray(data.orders) ? data.orders : []);
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadProfile(), loadCatalog(), loadLoyalty(), loadOrders()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customer app");
    } finally {
      setLoading(false);
    }
  }, [loadCatalog, loadLoyalty, loadOrders, loadProfile]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tab = String(params.get("tab") || "").trim().toLowerCase();
    if (tab === "menu" || tab === "cart" || tab === "orders" || tab === "account") {
      setActiveTab(tab);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "orders") {
      void loadOrders().catch(() => {});
    }
  }, [activeTab, loadOrders]);

  function openConfigurator(product: CatalogProduct) {
    setConfigProduct(product);
    setConfigVariantId(product.variants?.[0]?.id || null);
    setConfigAddonIds([]);
    setConfigSugar("normal");
    setConfigQty(1);
  }

  function closeConfigurator() {
    setConfigProduct(null);
    setConfigVariantId(null);
    setConfigAddonIds([]);
    setConfigSugar("normal");
    setConfigQty(1);
  }

  function addConfiguredToCart() {
    if (!configProduct) return;
    const variant = configProduct.variants.find(v => v.id === configVariantId) || null;
    const addons = configProduct.addons.filter(addon => configAddonIds.includes(addon.id));
    const unitPrice =
      Number(configProduct.price || 0) +
      Number(variant?.price_adjustment || 0) +
      addons.reduce((sum, addon) => sum + Number(addon.price || 0), 0);

    const key = buildCartKey(
      configProduct.id,
      variant?.id || null,
      addons.map(addon => addon.id),
      configSugar
    );

    setCart(prev => {
      const existing = prev[key];
      if (existing) {
        return {
          ...prev,
          [key]: {
            ...existing,
            qty: existing.qty + configQty,
          },
        };
      }

      return {
        ...prev,
        [key]: {
          key,
          product_id: configProduct.id,
          product_name: configProduct.name,
          variant_id: variant?.id || null,
          variant_name: variant?.name || null,
          addon_ids: addons.map(addon => addon.id),
          addon_names: addons.map(addon => addon.name),
          sugar_level: configSugar,
          qty: configQty,
          unit_price: unitPrice,
        },
      };
    });

    closeConfigurator();
    setActiveTab("cart");
  }

  function increaseCartQty(key: string) {
    setCart(prev => {
      const existing = prev[key];
      if (!existing) return prev;
      return { ...prev, [key]: { ...existing, qty: existing.qty + 1 } };
    });
  }

  function decreaseCartQty(key: string) {
    setCart(prev => {
      const existing = prev[key];
      if (!existing) return prev;
      const nextQty = existing.qty - 1;
      if (nextQty <= 0) {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      }
      return { ...prev, [key]: { ...existing, qty: nextQty } };
    });
  }

  function clearCart() {
    setCart({});
    setRedeemPoints("");
  }

  async function placeOrder() {
    if (cartItems.length === 0) {
      setCheckoutError("Cart is empty");
      return;
    }

    setPlacingOrder(true);
    setCheckoutError(null);
    setCheckoutMessage(null);

    try {
      const redeemPointsNum = appliedRedeemPoints;
      const res = await fetch("/api/customer/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartItems.map(item => ({
            product_id: item.product_id,
            variant_id: item.variant_id,
            addon_ids: item.addon_ids,
            sugar_level: item.sugar_level,
            qty: item.qty,
          })),
          redeem_points: redeemPointsNum,
          payment_method: paymentMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(readErrorMessage(data, "Failed to place order"));
      }

      const orderId = String(data?.order_id || "").trim();
      const orderNumber = String(data?.order_number || "").trim();
      const paymentStatus = String(data?.payment?.status || "").trim().toLowerCase();

      if ((paymentMethod === "fpx" || paymentMethod === "card") && paymentStatus !== "paid") {
        if (!orderId) {
          throw new Error("Order created, but missing order id for payment");
        }

        const billRes = await fetch("/api/payments/create-bill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: orderId }),
        });
        const billData = await billRes.json().catch(() => ({}));
        if (!billRes.ok) {
          throw new Error(
            readErrorMessage(
              billData,
              "Order created, but failed to initialize payment. Please contact staff."
            )
          );
        }

        const paymentUrl = String(billData?.payment?.payment_url || "").trim();
        clearCart();
        setCheckoutMessage(`Order ${orderNumber || orderId.slice(0, 8)} created. Redirecting to payment...`);
        if (paymentUrl) {
          window.location.assign(paymentUrl);
          return;
        }
      }

      clearCart();
      setCheckoutMessage(`Order ${orderNumber || "created"}`);
      setActiveTab("orders");
      await Promise.all([loadOrders(), loadLoyalty(), loadProfile()]);
    } catch (err) {
      setCheckoutError(readErrorMessage(err, "Failed to place order"));
    } finally {
      setPlacingOrder(false);
    }
  }

  async function openOrderDetail(orderId: string) {
    if (selectedOrderId === orderId) {
      setSelectedOrderId(null);
      setSelectedOrder(null);
      setOrderLoading(false);
      return;
    }

    setSelectedOrderId(orderId);
    setSelectedOrder(null);
    setOrderLoading(true);
    try {
      const res = await fetch(`/api/customer/orders/${orderId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load order detail");
      }
      setSelectedOrder(data as OrderDetail);
    } catch {
      setSelectedOrder(null);
    } finally {
      setOrderLoading(false);
    }
  }

  async function saveAccount() {
    setAccountSaving(true);
    setAccountError(null);
    setAccountMessage(null);
    try {
      const consent = fromConsentMode(consentMode);
      const res = await fetch("/api/customer/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: accountName.trim(),
          phone: accountPhone.trim(),
          email: accountEmail.trim(),
          birth_date: accountBirthDate.trim() || null,
          consent_whatsapp: consent.consent_whatsapp,
          consent_email: consent.consent_email,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to save profile");
      }
      setProfile(data.customer as CustomerProfile);
      setAccountMessage("Profile updated");
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setAccountSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto w-full max-w-lg px-4 py-12 text-center">
          <div className="text-sm text-gray-400">Loading...</div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-white px-4 py-12">
        <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        <button type="button" onClick={() => void bootstrap()} className="mx-auto mt-4 block rounded-lg bg-[#7F1D1D] px-6 py-2.5 text-sm font-medium text-white">Retry</button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto w-full max-w-lg pb-24">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">LOKA</h1>
              <p className="text-xs text-gray-400">Hi, {profile?.name || "there"}</p>
            </div>
            <div className="flex items-center gap-3">
              {loyalty?.points_available ? (
                <div className="rounded-full bg-[#7F1D1D]/10 px-3 py-1">
                  <span className="text-xs font-semibold text-[#7F1D1D]">{Number(loyalty.points_available)} pts</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="px-4 pt-4">
        {/* ━━━ MENU TAB ━━━ */}
        {activeTab === "menu" && (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input value={menuSearch} onChange={e => setMenuSearch(e.target.value)} placeholder="Cari menu..." className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-[#7F1D1D]" />
            </div>

            {/* Category pills */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button type="button" onClick={() => setCategoryFilter("All")} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${categoryFilter === "All" ? "bg-[#7F1D1D] text-white" : "bg-white text-gray-600 border border-gray-200"}`}>All</button>
              {categories.map(cat => (
                <button key={cat.id} type="button" onClick={() => setCategoryFilter(cat.name)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${categoryFilter === cat.name ? "bg-[#7F1D1D] text-white" : "bg-white text-gray-600 border border-gray-200"}`}>{cat.name}</button>
              ))}
            </div>

            {/* Product grid */}
            <div className="grid grid-cols-2 gap-3">
              {filteredProducts.map(product => (
                <button key={product.id} type="button" onClick={() => openConfigurator(product)} className="group overflow-hidden rounded-2xl bg-white border border-gray-100 text-left shadow-sm active:scale-[0.98] transition-transform">
                  <div className="relative aspect-square w-full overflow-hidden bg-gray-100">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" onError={e => { e.currentTarget.style.display = "none"; }} />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-50">
                        <span className="text-2xl font-bold text-gray-300">{productInitial(product.name)}</span>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-semibold text-gray-900">{product.name}</p>
                    <p className="text-xs text-gray-400">{product.category || ""}</p>
                    <p className="mt-1 text-sm font-bold text-[#7F1D1D]">{formatMoney(product.price)}</p>
                  </div>
                </button>
              ))}
            </div>

            {filteredProducts.length === 0 && (
              <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-400">Tiada produk dijumpai</div>
            )}
          </div>
        )}

        {/* ━━━ CART TAB ━━━ */}
        {activeTab === "cart" && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold">Cart</h2>
            {cartItems.length === 0 ? (
              <div className="rounded-xl bg-white p-8 text-center">
                <p className="text-sm text-gray-400">Cart kosong</p>
                <button type="button" onClick={() => setActiveTab("menu")} className="mt-3 text-sm font-medium text-[#7F1D1D]">Lihat Menu</button>
              </div>
            ) : (
              <>
                {cartItems.map(item => (
                  <div key={item.key} className="rounded-xl bg-white border border-gray-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900">{item.product_name}{item.variant_name ? ` (${item.variant_name})` : ""}</p>
                        {item.addon_names.length > 0 && <p className="text-xs text-gray-400">+ {item.addon_names.join(", ")}</p>}
                        {item.sugar_level !== "normal" && <p className="text-xs text-gray-400">{SUGAR_OPTIONS.find(v => v.value === item.sugar_level)?.label || ""} sugar</p>}
                        <p className="mt-1 text-sm font-semibold text-[#7F1D1D]">{formatMoney(item.unit_price)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => decreaseCartQty(item.key)} className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 font-bold">−</button>
                        <span className="w-6 text-center text-sm font-semibold">{item.qty}</span>
                        <button type="button" onClick={() => increaseCartQty(item.key)} className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 font-bold">+</button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Order Summary */}
                <div className="rounded-xl bg-white border border-gray-100 p-4 space-y-3">
                  {/* Payment method */}
                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-2">Kaedah Bayaran</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[["fpx", "Online Banking"], ["card", "Card / E-Wallet"]].map(([method, label]) => (
                        <button key={method} type="button" onClick={() => setPaymentMethod(method)} className={`rounded-lg py-2.5 text-xs font-medium transition-colors ${paymentMethod === method ? "bg-[#7F1D1D] text-white" : "border border-gray-200 text-gray-600"}`}>{label}</button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[10px] text-gray-300">Powered by CHIP Collect</p>
                  </div>

                  {/* Redeem points */}
                  {availablePoints >= LOYALTY_REDEEM_MIN_POINTS && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 mb-1">Tebus Points ({availablePoints} ada)</p>
                      <div className="flex gap-2">
                        <input value={redeemPoints} onChange={e => setRedeemPoints(e.target.value)} placeholder={`Min ${LOYALTY_REDEEM_MIN_POINTS}`} className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#7F1D1D]" />
                        <button type="button" onClick={() => setRedeemPoints(String(redeemEligibleMaxPoints))} className="shrink-0 rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-600">Max</button>
                      </div>
                      {appliedRedeemPoints > 0 && <p className="mt-1 text-xs text-green-600">Diskaun: -{formatMoney(estimatedRedeemAmount)}</p>}
                    </div>
                  )}

                  {/* Totals */}
                  <div className="border-t border-gray-100 pt-3 space-y-1">
                    <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>{formatMoney(cartSubtotal)}</span></div>
                    {estimatedRedeemAmount > 0 && <div className="flex justify-between text-sm text-green-600"><span>Points Discount</span><span>-{formatMoney(estimatedRedeemAmount)}</span></div>}
                    <div className="flex justify-between text-base font-bold"><span>Total</span><span className="text-[#7F1D1D]">{formatMoney(estimatedTotal)}</span></div>
                  </div>

                  {checkoutError && <p className="text-xs text-red-500">{checkoutError}</p>}
                  {checkoutMessage && <p className="text-xs text-green-600">{checkoutMessage}</p>}

                  <button type="button" onClick={() => void placeOrder()} disabled={placingOrder} className="w-full rounded-xl bg-[#7F1D1D] py-3.5 text-sm font-semibold text-white disabled:opacity-50 active:bg-[#6B1818]">
                    {placingOrder ? "Memproses..." : `Bayar ${formatMoney(estimatedTotal)}`}
                  </button>
                  <button type="button" onClick={clearCart} className="w-full text-center text-xs text-gray-400 py-2">Kosongkan Cart</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ━━━ ORDERS TAB ━━━ */}
        {activeTab === "orders" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Pesanan Saya</h2>
              <button type="button" onClick={() => void loadOrders()} className="text-xs font-medium text-[#7F1D1D]">Refresh</button>
            </div>
            {orders.length === 0 ? (
              <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-400">Belum ada pesanan</div>
            ) : (
              orders.map(order => (
                <div key={order.id} className="rounded-xl bg-white border border-gray-100 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">#{order.order_number}</p>
                      <p className="text-xs text-gray-400">{formatDateTime(order.created_at)}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${order.status === "completed" ? "bg-green-50 text-green-700" : order.status === "preparing" ? "bg-amber-50 text-amber-700" : order.status === "ready" ? "bg-blue-50 text-blue-700" : "bg-gray-50 text-gray-600"}`}>{order.status || "pending"}</span>
                        <span className="text-[10px] text-gray-400">{order.item_count} items</span>
                      </div>
                    </div>
                    <p className="text-base font-bold text-gray-900">{formatMoney(order.total)}</p>
                  </div>
                  <button type="button" onClick={() => void openOrderDetail(order.id)} className="mt-2 text-xs font-medium text-[#7F1D1D]">{selectedOrderId === order.id ? "Tutup" : "Lihat Detail"}</button>

                  {selectedOrderId === order.id && (
                    <div className="mt-3 rounded-lg bg-gray-50 p-3 space-y-2">
                      {orderLoading ? <p className="text-xs text-gray-400">Memuatkan...</p> : selectedOrder ? (
                        <>
                          {selectedOrder.items.map(item => (
                            <div key={item.id} className="flex justify-between text-xs">
                              <span className="text-gray-600">{item.name} x{item.qty}</span>
                              <span className="text-gray-900 font-medium">{formatMoney(item.line_total)}</span>
                            </div>
                          ))}
                          <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-semibold">
                            <span>Jumlah</span><span>{formatMoney(selectedOrder.total)}</span>
                          </div>
                        </>
                      ) : <p className="text-xs text-gray-400">Tidak dapat dimuatkan</p>}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ━━━ ACCOUNT TAB ━━━ */}
        {activeTab === "account" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Akaun Saya</h2>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-white border border-gray-100 p-3 text-center">
                <p className="text-lg font-bold text-[#7F1D1D]">{Number(loyalty?.points_available || 0)}</p>
                <p className="text-[10px] text-gray-400">Points</p>
              </div>
              <div className="rounded-xl bg-white border border-gray-100 p-3 text-center">
                <p className="text-lg font-bold text-gray-900">{profile?.total_orders || 0}</p>
                <p className="text-[10px] text-gray-400">Orders</p>
              </div>
              <div className="rounded-xl bg-white border border-gray-100 p-3 text-center">
                <p className="text-lg font-bold text-gray-900">{formatMoney(profile?.total_spend || 0)}</p>
                <p className="text-[10px] text-gray-400">Spent</p>
              </div>
            </div>

            {/* Profile form */}
            <div className="rounded-xl bg-white border border-gray-100 p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-900">Profil</p>
              <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="Nama" className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D]" />
              <input value={accountPhone} onChange={e => setAccountPhone(e.target.value)} placeholder="Telefon" className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D]" />
              <input value={accountEmail} onChange={e => setAccountEmail(e.target.value)} placeholder="Email" className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D]" />
              <input type="date" value={accountBirthDate} onChange={e => setAccountBirthDate(e.target.value)} className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D]" />
              <select value={consentMode} onChange={e => setConsentMode(e.target.value as ConsentMode)} className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D] bg-white">
                <option value="none">Tiada Marketing</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="both">WhatsApp + Email</option>
              </select>
              {accountError && <p className="text-xs text-red-500">{accountError}</p>}
              {accountMessage && <p className="text-xs text-green-600">{accountMessage}</p>}
              <button type="button" onClick={() => void saveAccount()} disabled={accountSaving} className="w-full rounded-xl bg-[#7F1D1D] py-2.5 text-sm font-semibold text-white disabled:opacity-50">{accountSaving ? "Menyimpan..." : "Simpan"}</button>
            </div>

            <Link href="/auth/logout?next=/login" className="block text-center text-sm text-[#7F1D1D] py-3">Log Keluar</Link>
          </div>
        )}
        </div>
      </div>

      {/* ━━━ BOTTOM NAV ━━━ */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom,0px)]">
        <div className="mx-auto grid w-full max-w-lg grid-cols-4">
          {([["menu","Menu"],["cart",`Cart (${cartCount})`],["orders","Orders"],["account","Akaun"]] as [ActiveTab, string][]).map(([tab, label]) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`py-3 text-xs font-medium transition-colors ${activeTab === tab ? "text-[#7F1D1D]" : "text-gray-400"}`}>{label}</button>
          ))}
        </div>
      </nav>

      {/* ━━━ PRODUCT CONFIGURATOR MODAL ━━━ */}
      {configProduct && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={closeConfigurator}>
          <div className="w-full max-w-lg rounded-t-3xl bg-white p-5 pb-8 shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" />

            {/* Product header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative h-16 w-16 overflow-hidden rounded-xl bg-gray-100 shrink-0">
                {configProduct.image_url ? (
                  <img src={configProduct.image_url} alt={configProduct.name} className="h-full w-full object-cover" onError={e => { e.currentTarget.style.display = "none"; }} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center"><span className="text-lg font-bold text-gray-300">{productInitial(configProduct.name)}</span></div>
                )}
              </div>
              <div>
                <p className="text-base font-bold text-gray-900">{configProduct.name}</p>
                <p className="text-sm text-[#7F1D1D] font-semibold">{formatMoney(configProduct.price)}</p>
              </div>
            </div>

            {/* Variants */}
            {configProduct.variants.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-400 mb-2">Pilih Saiz</p>
                <div className="flex gap-2 flex-wrap">
                  {configProduct.variants.map(v => (
                    <button key={v.id} type="button" onClick={() => setConfigVariantId(v.id)} className={`rounded-full px-4 py-2 text-xs font-medium transition-colors ${configVariantId === v.id ? "bg-[#7F1D1D] text-white" : "border border-gray-200 text-gray-600"}`}>
                      {v.name} {v.price_adjustment ? `+RM${v.price_adjustment}` : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Addons */}
            {configProduct.addons.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-400 mb-2">Tambahan</p>
                <div className="space-y-2">
                  {configProduct.addons.map(addon => {
                    const selected = configAddonIds.includes(addon.id);
                    return (
                      <button key={addon.id} type="button" onClick={() => setConfigAddonIds(prev => selected ? prev.filter(id => id !== addon.id) : [...prev, addon.id])} className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm transition-colors ${selected ? "bg-[#7F1D1D]/10 border border-[#7F1D1D]/20 text-[#7F1D1D]" : "border border-gray-200 text-gray-600"}`}>
                        <span>{addon.name}</span>
                        <span className="text-xs">+{formatMoney(addon.price)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sugar - only for drinks */}
            {isSugarSupportedCategory(configProduct.category) && (
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-400 mb-2">Tahap Gula</p>
              <div className="grid grid-cols-4 gap-2">
                {SUGAR_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setConfigSugar(opt.value)} className={`rounded-lg py-2 text-xs font-medium transition-colors ${configSugar === opt.value ? "bg-[#7F1D1D] text-white" : "border border-gray-200 text-gray-600"}`}>{opt.label}</button>
                ))}
              </div>
            </div>
            )}

            {/* Qty + Add button */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setConfigQty(prev => Math.max(1, prev - 1))} className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-lg font-bold text-gray-500">−</button>
                <span className="w-8 text-center text-base font-bold">{configQty}</span>
                <button type="button" onClick={() => setConfigQty(prev => prev + 1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-lg font-bold text-gray-500">+</button>
              </div>
              <button type="button" onClick={addConfiguredToCart} className="flex-1 rounded-xl bg-[#7F1D1D] py-3.5 text-sm font-semibold text-white active:bg-[#6B1818]">Tambah ke Cart</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
