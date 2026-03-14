"use client";

import ThemeToggle from "@/components/theme-toggle";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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
      const redeemPointsNum = redeemPointsInputNumber;
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

      if (paymentMethod === "fpx" && paymentStatus !== "paid") {
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
              "Order created, but failed to initialize payment provider. Please contact staff."
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
      <main className="min-h-screen bg-black text-gray-200">
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
          <p className="text-sm text-gray-400">Loading customer app...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-black text-gray-200">
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
          <div className="rounded-xl border border-red-900 bg-red-950/20 p-4 text-red-300">
            {error}
          </div>
          <button
            type="button"
            onClick={() => void bootstrap()}
            className="mt-3 rounded-lg bg-[#7F1D1D] px-4 py-2 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-gray-100">
      <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">
        <header className="mb-4 rounded-xl border border-gray-800 bg-[#111] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Loka POS</p>
              <h1 className="text-xl font-semibold text-white">Customer Order</h1>
              <p className="text-xs text-gray-400">{profile?.name || "Member"}</p>
            </div>
            <div className="text-right">
              <ThemeToggle className="mb-2" />
              <p className="text-xs text-gray-500">Available Points</p>
              <p className="text-lg font-semibold text-[#34d399]">
                {Number(loyalty?.points_available || 0)}
              </p>
            </div>
          </div>
          {loyalty?.expiring_points_30d ? (
            <p className="mt-2 text-xs text-amber-300">
              {loyalty.expiring_points_30d} points expiring in 30 days.
            </p>
          ) : null}
        </header>

        {activeTab === "menu" ? (
          <section className="space-y-4">
            <div className="rounded-xl border border-gray-800 bg-[#111] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-gray-500">Order Menu</p>
                <p className="text-xs text-gray-400">{filteredProducts.length} items</p>
              </div>
              <input
                value={menuSearch}
                onChange={event => setMenuSearch(event.target.value)}
                placeholder="Search drink or food"
                className="mt-2 w-full rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
              />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setCategoryFilter("All")}
                className={`shrink-0 rounded-full px-4 py-2 text-sm ${
                  categoryFilter === "All"
                    ? "bg-[#7F1D1D] text-white"
                    : "border border-gray-700 bg-[#111] text-gray-300"
                }`}
              >
                All
              </button>
              {categories.map(category => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setCategoryFilter(category.name)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm ${
                    categoryFilter === category.name
                      ? "bg-[#7F1D1D] text-white"
                      : "border border-gray-700 bg-[#111] text-gray-300"
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {filteredProducts.map(product => (
                <article
                  key={product.id}
                  className="overflow-hidden rounded-xl border border-gray-800 bg-[#111]"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden border-b border-gray-800 bg-gradient-to-br from-[#1f2937] to-[#111827]">
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-full w-full object-cover"
                        onError={event => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    ) : null}
                    <span className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-black/45 text-xs font-semibold text-white">
                      {productInitial(product.name)}
                    </span>
                  </div>

                  <div className="space-y-2 p-3">
                    <div>
                      <p className="truncate text-sm font-semibold text-white">{product.name}</p>
                      <p className="mt-0.5 truncate text-xs text-gray-400">
                        {product.category || "Uncategorized"}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-gray-100">{formatMoney(product.price)}</p>
                        <p className="text-[11px] text-gray-500">
                          {product.variants.length} variant • {product.addons.length} addon
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openConfigurator(product)}
                        className="rounded-md bg-[#7F1D1D] px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {filteredProducts.length === 0 ? (
              <div className="rounded-xl border border-gray-800 bg-[#111] p-4 text-sm text-gray-400">
                No product found for current filter.
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "cart" ? (
          <section className="space-y-3">
            {cartItems.length === 0 ? (
              <div className="rounded-xl border border-gray-800 bg-[#111] p-4 text-sm text-gray-400">
                Cart is empty.
              </div>
            ) : (
              <>
                {cartItems.map(item => (
                  <div key={item.key} className="rounded-xl border border-gray-800 bg-[#111] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {item.product_name}
                          {item.variant_name ? ` (${item.variant_name})` : ""}
                        </p>
                        {item.addon_names.length > 0 ? (
                          <p className="mt-0.5 text-xs text-gray-400">
                            Addon: {item.addon_names.join(", ")}
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-xs text-gray-400">
                          Sugar: {SUGAR_OPTIONS.find(v => v.value === item.sugar_level)?.label || "Normal"}
                        </p>
                        <p className="mt-1 text-sm text-gray-300">{formatMoney(item.unit_price)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => decreaseCartQty(item.key)}
                          className="h-8 w-8 rounded-md border border-gray-700 bg-black text-sm text-gray-200"
                        >
                          -
                        </button>
                        <span className="w-5 text-center text-sm">{item.qty}</span>
                        <button
                          type="button"
                          onClick={() => increaseCartQty(item.key)}
                          className="h-8 w-8 rounded-md border border-gray-700 bg-black text-sm text-gray-200"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="rounded-xl border border-gray-800 bg-[#111] p-4">
                  <p className="text-sm text-gray-400">Payment Method</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {["fpx", "card", "qr"].map(method => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`rounded-md px-3 py-2 text-sm ${
                          paymentMethod === method
                            ? "bg-[#7F1D1D] text-white"
                            : "border border-gray-700 bg-black text-gray-300"
                        }`}
                      >
                        {method.toUpperCase()}
                      </button>
                    ))}
                  </div>

                  <div className="mt-3">
                    <label className="mb-1 block text-xs text-gray-400">Redeem points (optional)</label>
                    <input
                      value={redeemPoints}
                      onChange={event => setRedeemPoints(event.target.value)}
                      placeholder={`Min ${LOYALTY_REDEEM_MIN_POINTS} • Available ${availablePoints}`}
                      className="w-full rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setRedeemPoints(String(LOYALTY_REDEEM_MIN_POINTS))}
                        className="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300"
                      >
                        Use 100
                      </button>
                      <button
                        type="button"
                        onClick={() => setRedeemPoints(String(redeemPointsCap))}
                        className="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300"
                      >
                        Use Max ({redeemPointsCap})
                      </button>
                      <button
                        type="button"
                        onClick={() => setRedeemPoints("")}
                        className="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300"
                      >
                        Clear
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      100 pts = RM 5.00 • Max 30% order • Allowed now: {redeemPointsCap} pts
                    </p>
                    {!canRedeemByMinRule && cartItems.length > 0 ? (
                      <p className="mt-1 text-xs text-amber-300">
                        Subtotal terlalu rendah untuk min redeem 100 points (cap 30% sekarang {redeemPointsCap} pts).
                      </p>
                    ) : null}
                    {redeemPointsInputNumber > 0 && appliedRedeemPoints === 0 && canRedeemByMinRule ? (
                      <p className="mt-1 text-xs text-amber-300">
                        Minimum redeem {LOYALTY_REDEEM_MIN_POINTS} points.
                      </p>
                    ) : null}
                    {redeemPointsInputNumber > redeemPointsCap && canRedeemByMinRule ? (
                      <p className="mt-1 text-xs text-amber-300">
                        Input melebihi had semasa, sistem akan guna maksimum {redeemPointsCap} points.
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-3 space-y-1 text-sm">
                    <div className="flex items-center justify-between text-gray-300">
                      <span>Subtotal</span>
                      <span>{formatMoney(cartSubtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-300">
                      <span>Redeem Discount</span>
                      <span>- {formatMoney(estimatedRedeemAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-white">
                      <span className="font-semibold">Estimated Total</span>
                      <span className="font-semibold">{formatMoney(estimatedTotal)}</span>
                    </div>
                  </div>

                  {checkoutError ? (
                    <p className="mt-2 text-xs text-red-400">{checkoutError}</p>
                  ) : null}
                  {checkoutMessage ? (
                    <p className="mt-2 text-xs text-green-400">{checkoutMessage}</p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void placeOrder()}
                    disabled={placingOrder}
                    className="mt-4 w-full rounded-lg bg-[#7F1D1D] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {placingOrder ? "Placing..." : "Place Order"}
                  </button>
                  <button
                    type="button"
                    onClick={clearCart}
                    className="mt-2 w-full rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300"
                  >
                    Clear Cart
                  </button>
                </div>
              </>
            )}
          </section>
        ) : null}

        {activeTab === "orders" ? (
          <section className="space-y-3">
            <button
              type="button"
              onClick={() => void loadOrders()}
              className="rounded-lg border border-gray-700 bg-[#111] px-3 py-2 text-xs text-gray-300"
            >
              Refresh Orders
            </button>

            {orders.length === 0 ? (
              <div className="rounded-xl border border-gray-800 bg-[#111] p-4 text-sm text-gray-400">
                No orders yet.
              </div>
            ) : (
              orders.map(order => (
                <div key={order.id} className="rounded-xl border border-gray-800 bg-[#111] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">#{order.order_number}</p>
                      <p className="text-xs text-gray-400">{formatDateTime(order.created_at)}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {order.item_count} items • {formatPayment(order.payment_method)}
                      </p>
                    </div>
                    <p className="text-base font-semibold text-white">{formatMoney(order.total)}</p>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                    <p>
                      {String(order.status || "-")} • {String(order.payment_status || "-")}
                    </p>
                    <button
                      type="button"
                      onClick={() => void openOrderDetail(order.id)}
                      className="rounded-md border border-gray-700 px-2 py-1 text-gray-200"
                    >
                      {selectedOrderId === order.id ? "Hide" : "View"}
                    </button>
                  </div>

                  {selectedOrderId === order.id ? (
                    <div className="mt-3 rounded-lg border border-gray-800 bg-black p-3">
                      {orderLoading ? (
                        <p className="text-xs text-gray-400">Loading detail...</p>
                      ) : selectedOrder ? (
                        <div className="space-y-2">
                          <p className="text-xs text-gray-400">
                            #{selectedOrder.order_number} • {formatDateTime(selectedOrder.created_at)}
                          </p>
                          {selectedOrder.items.map(item => (
                            <div
                              key={item.id}
                              className="flex items-start justify-between gap-2 rounded-md border border-gray-800 bg-[#0d0d0d] px-3 py-2"
                            >
                              <p className="text-xs text-gray-200">
                                {item.name} x{item.qty}
                              </p>
                              <p className="text-xs text-gray-200">{formatMoney(item.line_total)}</p>
                            </div>
                          ))}
                          <div className="border-t border-gray-800 pt-2 text-xs text-gray-300">
                            <p>Subtotal: {formatMoney(selectedOrder.subtotal)}</p>
                            <p>Discount: {formatMoney(selectedOrder.discount)}</p>
                            <p className="font-semibold text-white">Total: {formatMoney(selectedOrder.total)}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">Order detail unavailable.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </section>
        ) : null}

        {activeTab === "account" ? (
          <section className="space-y-3">
            <div className="rounded-xl border border-gray-800 bg-[#111] p-4">
              <h2 className="text-base font-semibold text-white">Profile</h2>

              <div className="mt-3 space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Name</label>
                  <input
                    value={accountName}
                    onChange={event => setAccountName(event.target.value)}
                    className="w-full rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Phone</label>
                  <input
                    value={accountPhone}
                    onChange={event => setAccountPhone(event.target.value)}
                    className="w-full rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Email</label>
                  <input
                    value={accountEmail}
                    onChange={event => setAccountEmail(event.target.value)}
                    className="w-full rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Birth Date</label>
                  <input
                    type="date"
                    value={accountBirthDate}
                    onChange={event => setAccountBirthDate(event.target.value)}
                    className="w-full rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Marketing Consent</label>
                  <select
                    value={consentMode}
                    onChange={event => setConsentMode(event.target.value as ConsentMode)}
                    className="w-full rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
                  >
                    <option value="none">No Marketing</option>
                    <option value="whatsapp">WhatsApp Only</option>
                    <option value="email">Email Only</option>
                    <option value="both">WhatsApp + Email</option>
                  </select>
                </div>
              </div>

              {accountError ? <p className="mt-2 text-xs text-red-400">{accountError}</p> : null}
              {accountMessage ? <p className="mt-2 text-xs text-green-400">{accountMessage}</p> : null}

              <button
                type="button"
                onClick={() => void saveAccount()}
                disabled={accountSaving}
                className="mt-4 w-full rounded-lg bg-[#7F1D1D] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {accountSaving ? "Saving..." : "Save Profile"}
              </button>
            </div>

            <div className="rounded-xl border border-gray-800 bg-[#111] p-4 text-sm">
              <p className="text-gray-400">Total Orders: {profile?.total_orders || 0}</p>
              <p className="mt-1 text-gray-400">Total Spend: {formatMoney(profile?.total_spend || 0)}</p>
              <p className="mt-2 text-gray-400">Points: {Number(loyalty?.points_available || 0)}</p>
              <Link
                href="/auth/logout?next=/login"
                className="mt-4 inline-flex rounded-md border border-gray-700 px-3 py-2 text-xs text-red-300"
              >
                Sign out
              </Link>
            </div>
          </section>
        ) : null}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-800 bg-[#111] px-2 py-2">
        <div className="mx-auto grid w-full max-w-3xl grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("menu")}
            className={`rounded-md px-2 py-2 text-xs ${
              activeTab === "menu"
                ? "bg-[#7F1D1D] text-white"
                : "text-gray-300 hover:bg-[#1b1b1b]"
            }`}
          >
            Menu
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cart")}
            className={`rounded-md px-2 py-2 text-xs ${
              activeTab === "cart"
                ? "bg-[#7F1D1D] text-white"
                : "text-gray-300 hover:bg-[#1b1b1b]"
            }`}
          >
            Cart ({cartCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("orders")}
            className={`rounded-md px-2 py-2 text-xs ${
              activeTab === "orders"
                ? "bg-[#7F1D1D] text-white"
                : "text-gray-300 hover:bg-[#1b1b1b]"
            }`}
          >
            Orders
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("account")}
            className={`rounded-md px-2 py-2 text-xs ${
              activeTab === "account"
                ? "bg-[#7F1D1D] text-white"
                : "text-gray-300 hover:bg-[#1b1b1b]"
            }`}
          >
            Account
          </button>
        </div>
      </nav>

      {configProduct ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl border border-gray-800 bg-[#111] p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Customize Item</h3>
              <button type="button" onClick={closeConfigurator} className="text-sm text-gray-400">
                Close
              </button>
            </div>

            <div className="mb-3 flex items-center gap-3 rounded-lg border border-gray-800 bg-black p-2">
              <div className="relative h-14 w-14 overflow-hidden rounded-md bg-gradient-to-br from-[#1f2937] to-[#111827]">
                {configProduct.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={configProduct.image_url}
                    alt={configProduct.name}
                    className="h-full w-full object-cover"
                    onError={event => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                ) : null}
                <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white/90">
                  {productInitial(configProduct.name)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{configProduct.name}</p>
                <p className="text-xs text-gray-400">{formatMoney(configProduct.price)}</p>
              </div>
            </div>

            {configProduct.variants.length > 0 ? (
              <div className="mb-3">
                <p className="mb-1 text-xs text-gray-400">Variant</p>
                <div className="grid grid-cols-2 gap-2">
                  {configProduct.variants.map(variant => (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => setConfigVariantId(variant.id)}
                      className={`rounded-md px-3 py-2 text-xs ${
                        configVariantId === variant.id
                          ? "bg-[#7F1D1D] text-white"
                          : "border border-gray-700 bg-black text-gray-300"
                      }`}
                    >
                      {variant.name} {variant.price_adjustment ? `(+RM${variant.price_adjustment})` : ""}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {configProduct.addons.length > 0 ? (
              <div className="mb-3">
                <p className="mb-1 text-xs text-gray-400">Addons</p>
                <div className="space-y-2">
                  {configProduct.addons.map(addon => {
                    const selected = configAddonIds.includes(addon.id);
                    return (
                      <label
                        key={addon.id}
                        className="flex items-center justify-between rounded-md border border-gray-800 bg-black px-3 py-2 text-xs text-gray-200"
                      >
                        <span>
                          {addon.name} (+RM{Number(addon.price || 0).toFixed(2)})
                        </span>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={event => {
                            if (event.target.checked) {
                              setConfigAddonIds(prev => [...prev, addon.id]);
                            } else {
                              setConfigAddonIds(prev => prev.filter(id => id !== addon.id));
                            }
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="mb-3">
              <p className="mb-1 text-xs text-gray-400">Sugar</p>
              <div className="grid grid-cols-2 gap-2">
                {SUGAR_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setConfigSugar(option.value)}
                    className={`rounded-md px-3 py-2 text-xs ${
                      configSugar === option.value
                        ? "bg-[#7F1D1D] text-white"
                        : "border border-gray-700 bg-black text-gray-300"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <p className="mb-1 text-xs text-gray-400">Quantity</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfigQty(prev => Math.max(1, prev - 1))}
                  className="h-9 w-9 rounded-md border border-gray-700 bg-black text-gray-200"
                >
                  -
                </button>
                <span className="w-8 text-center text-sm">{configQty}</span>
                <button
                  type="button"
                  onClick={() => setConfigQty(prev => prev + 1)}
                  className="h-9 w-9 rounded-md border border-gray-700 bg-black text-gray-200"
                >
                  +
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={addConfiguredToCart}
              className="w-full rounded-lg bg-[#7F1D1D] px-4 py-3 text-sm font-semibold text-white"
            >
              Add To Cart
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
