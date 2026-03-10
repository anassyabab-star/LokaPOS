"use client";

import { useEffect, useState } from "react";
import { buildReceiptHtml } from "@/lib/receipt-print";

type Variant = {
  id: string;
  name: string;
  price_adjustment: number;
};

type Addon = {
  id: string;
  name: string;
  price: number;
};

type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  category?: string;
  variants?: Variant[];
  addons?: Addon[];
};

type Shift = {
  id: string;
  register_id: string;
  opened_by: string;
  opened_at: string;
  opening_cash: number;
  opening_note: string | null;
  status: "open" | "closed";
  closed_by: string | null;
  closed_at: string | null;
  counted_cash: number | null;
  expected_cash: number | null;
  over_short: number | null;
  closing_note: string | null;
};

type CartItem = {
  id: string;
  product_id: string;
  name: string;
  price: number;
  qty: number;
  variant_id: string | null;
  addon_ids: string[];
  addon_names: string[];
  sugar_level: SugarLevel | null;
  supports_sugar: boolean;
};

type ReceiptData = {
  order_id?: string;
  receipt_number: string;
  customerName: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  payment_method: "cash" | "qr" | "card";
  created_at: string;
};

type SugarQuickPickPayload = {
  product_id: string;
  product_name: string;
  variant_id?: string;
  addon_ids?: string[];
  feedback_label?: string;
};

type MemberLookup = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  consent_whatsapp: boolean;
  consent_email: boolean;
  total_orders: number;
  total_spend: number;
  last_order_at: string | null;
  loyalty_points: number;
  expiring_points_30d: number;
};

const DISCOUNT_TYPES: Array<"percent" | "fixed" | "none"> = ["percent", "fixed", "none"];
const PAYMENT_METHODS: Array<"cash" | "qr" | "card"> = ["cash", "qr", "card"];
type MarketingConsentMode = "none" | "whatsapp" | "email" | "both";
type SugarLevel = "normal" | "less" | "half" | "none";
const LOYALTY_REDEEM_RM_PER_POINT = 0.05;
const LOYALTY_REDEEM_MIN_POINTS = 100;
const LOYALTY_REDEEM_MAX_RATIO = 0.3;
const POS_AUTO_PRINT_KEY = "pos_auto_print_enabled";
const DEFAULT_SUGAR_LEVEL: SugarLevel = "normal";
const SUGAR_LEVEL_OPTIONS: Array<{ value: SugarLevel; label: string }> = [
  { value: "normal", label: "Normal Sugar" },
  { value: "less", label: "Less Sugar" },
  { value: "half", label: "Half Sugar" },
  { value: "none", label: "No Sugar" },
];

function buildCartKey(
  productId: string,
  variantId?: string,
  addonIds?: string[],
  sugarLevel?: SugarLevel | null
) {
  const normalizedAddonIds =
    addonIds && addonIds.length > 0 ? [...addonIds].sort().join(",") : "noaddon";
  const sugarKey = sugarLevel || DEFAULT_SUGAR_LEVEL;
  return `${productId}__${variantId || "base"}__${normalizedAddonIds}__${sugarKey}`;
}

function isSugarSupportedCategory(category?: string | null) {
  const key = String(category || "").trim().toLowerCase();
  if (!key) return false;
  return (
    key.includes("coffee") ||
    key.includes("kopi") ||
    key.includes("drink") ||
    key.includes("minuman") ||
    key.includes("beverage") ||
    key.includes("tea") ||
    key.includes("matcha")
  );
}

function sugarLabel(level: SugarLevel | null | undefined) {
  const normalized = (level || DEFAULT_SUGAR_LEVEL) as SugarLevel;
  return (
    SUGAR_LEVEL_OPTIONS.find(option => option.value === normalized)?.label ||
    SUGAR_LEVEL_OPTIONS[0].label
  );
}

export default function POSPage() {
  const registerId = "main";

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [category, setCategory] = useState("All");
  const [showCheckout, setShowCheckout] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [showAddonModal, setShowAddonModal] = useState(false);
  const [addedToast, setAddedToast] = useState<string | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showSugarQuickPick, setShowSugarQuickPick] = useState(false);
  const [sugarQuickPickPayload, setSugarQuickPickPayload] = useState<SugarQuickPickPayload | null>(
    null
  );

  const [shiftLoading, setShiftLoading] = useState(true);
  const [shiftError, setShiftError] = useState<string | null>(null);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [cashSalesLive, setCashSalesLive] = useState(0);
  const [expectedCashLive, setExpectedCashLive] = useState(0);
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [openingCash, setOpeningCash] = useState("");
  const [openingNote, setOpeningNote] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [closingNote, setClosingNote] = useState("");
  const [shiftSubmitting, setShiftSubmitting] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [consentWhatsapp, setConsentWhatsapp] = useState(false);
  const [consentEmail, setConsentEmail] = useState(false);
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null);
  const [memberLookupLoading, setMemberLookupLoading] = useState(false);
  const [memberLookupMessage, setMemberLookupMessage] = useState<string | null>(null);
  const [memberLookupTone, setMemberLookupTone] = useState<"default" | "success" | "warn">(
    "default"
  );
  const [memberPoints, setMemberPoints] = useState(0);
  const [memberExpiringPoints, setMemberExpiringPoints] = useState(0);
  const [redeemPointsInput, setRedeemPointsInput] = useState("");

  const [showDiscountControls, setShowDiscountControls] = useState(false);
  const [discountType, setDiscountType] = useState<"none" | "percent" | "fixed">("none");
  const [discountValue, setDiscountValue] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "qr" | "card">("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false);

  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  function getMarketingConsentMode(): MarketingConsentMode {
    if (consentWhatsapp && consentEmail) return "both";
    if (consentWhatsapp) return "whatsapp";
    if (consentEmail) return "email";
    return "none";
  }

  function applyMarketingConsentMode(mode: MarketingConsentMode) {
    if (mode === "both") {
      setConsentWhatsapp(true);
      setConsentEmail(true);
      return;
    }
    if (mode === "whatsapp") {
      setConsentWhatsapp(true);
      setConsentEmail(false);
      return;
    }
    if (mode === "email") {
      setConsentWhatsapp(false);
      setConsentEmail(true);
      return;
    }
    setConsentWhatsapp(false);
    setConsentEmail(false);
  }

  async function refreshShiftState(options?: { autoPromptIfClosed?: boolean }) {
    const autoPromptIfClosed = options?.autoPromptIfClosed ?? true;
    setShiftLoading(true);
    setShiftError(null);

    try {
      const res = await fetch(`/api/pos/shift?register_id=${registerId}`, { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        setShiftError(data?.error || "Failed to load shift");
        setCurrentShift(null);
        setCashSalesLive(0);
        setExpectedCashLive(0);
        if (autoPromptIfClosed) setShowOpenShiftModal(true);
        return;
      }

      setCurrentShift(data.shift || null);
      setCashSalesLive(Number(data.cash_sales || 0));
      setExpectedCashLive(Number(data.expected_cash_live || 0));

      if (autoPromptIfClosed) {
        setShowOpenShiftModal(!data.shift);
      } else if (data.shift) {
        setShowOpenShiftModal(false);
      }
    } catch {
      setShiftError("Failed to load shift");
      setCurrentShift(null);
      setCashSalesLive(0);
      setExpectedCashLive(0);
      if (autoPromptIfClosed) setShowOpenShiftModal(true);
    } finally {
      setShiftLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/products")
      .then(res => res.json())
      .then(data => setProducts(Array.isArray(data) ? (data as Product[]) : []))
      .catch(() => setProducts([]));

    void refreshShiftState();
  }, []);

  useEffect(() => {
    if (!addedToast) return;
    const timer = setTimeout(() => setAddedToast(null), 1200);
    return () => clearTimeout(timer);
  }, [addedToast]);

  useEffect(() => {
    try {
      setAutoPrintEnabled(window.localStorage.getItem(POS_AUTO_PRINT_KEY) === "1");
    } catch {
      setAutoPrintEnabled(false);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(POS_AUTO_PRINT_KEY, autoPrintEnabled ? "1" : "0");
    } catch {
      // Ignore storage failures (private mode / strict browser settings)
    }
  }, [autoPrintEnabled]);

  function addToCart(
    productId: string,
    variantId?: string,
    addonIds?: string[],
    sugarLevel?: SugarLevel | null,
    feedbackLabel?: string,
    silent = false
  ) {
    const key = buildCartKey(productId, variantId, addonIds, sugarLevel);

    setCart(prev => ({
      ...prev,
      [key]: (prev[key] || 0) + 1,
    }));

    if (!silent) {
      const product = products.find(p => p.id === productId);
      setAddedToast(feedbackLabel || product?.name || "Item added");
    }
  }

  function removeFromCart(key: string) {
    setCart(prev => {
      const updated = { ...prev };
      if (!updated[key]) return updated;
      updated[key] -= 1;
      if (updated[key] <= 0) delete updated[key];
      return updated;
    });
  }

  function promptQuickSugar(payload: SugarQuickPickPayload) {
    setSugarQuickPickPayload(payload);
    setShowSugarQuickPick(true);
  }

  function closeQuickSugarPrompt() {
    setShowSugarQuickPick(false);
    setSugarQuickPickPayload(null);
  }

  function addProductWithQuickSugar(options: {
    product: Product;
    variantId?: string;
    addonIds?: string[];
    feedbackLabel?: string;
  }) {
    const { product, variantId, addonIds, feedbackLabel } = options;
    if (!isSugarSupportedCategory(product.category)) {
      addToCart(product.id, variantId, addonIds, null, feedbackLabel);
      return;
    }

    promptQuickSugar({
      product_id: product.id,
      product_name: product.name,
      variant_id: variantId,
      addon_ids: addonIds,
      feedback_label: feedbackLabel,
    });
  }

  function submitQuickSugar(level: SugarLevel) {
    if (!sugarQuickPickPayload) return;

    addToCart(
      sugarQuickPickPayload.product_id,
      sugarQuickPickPayload.variant_id,
      sugarQuickPickPayload.addon_ids,
      level,
      sugarQuickPickPayload.feedback_label
    );
    closeQuickSugarPrompt();
  }

  function updateItemSugar(item: CartItem, nextSugarLevel: SugarLevel) {
    const nextKey = buildCartKey(
      item.product_id,
      item.variant_id || undefined,
      item.addon_ids,
      nextSugarLevel
    );
    if (nextKey === item.id) return;

    setCart(prev => {
      const qty = prev[item.id] || 0;
      if (!qty) return prev;

      const next = { ...prev };
      delete next[item.id];
      next[nextKey] = (next[nextKey] || 0) + qty;
      return next;
    });
  }

  const filteredProducts =
    category === "All" ? products : products.filter(p => p.category === category);

  const categoryOptions = [
    "All",
    ...Array.from(new Set(products.map(p => p.category).filter((v): v is string => Boolean(v)))),
  ];

  const items = Object.entries(cart)
    .map(([key, qty]) => {
      const [productId, variantId = "base", addonKey = "noaddon", sugarKey = DEFAULT_SUGAR_LEVEL] =
        key.split("__");
      const product = products.find(p => p.id === productId);
      if (!product) return null;

      let price = Number(product.price);
      let variantName = "";
      const addonNames: string[] = [];
      const addonIds: string[] = [];

      if (variantId !== "base" && product.variants) {
        const variant = product.variants.find(v => v.id === variantId);
        if (variant) {
          price += Number(variant.price_adjustment);
          variantName = variant.name;
        }
      }

      if (addonKey !== "noaddon") {
        addonKey.split(",").forEach(addonId => {
          const addon = product.addons?.find(a => a.id === addonId);
          if (addon) {
            price += Number(addon.price);
            addonNames.push(addon.name);
            addonIds.push(addon.id);
          }
        });
      }

      const supportsSugar = isSugarSupportedCategory(product.category);
      const parsedSugar = (sugarKey || DEFAULT_SUGAR_LEVEL) as SugarLevel;

      return {
        id: key,
        product_id: productId,
        name:
          (variantName ? `${product.name} (${variantName})` : product.name) +
          (addonNames.length > 0 ? ` + ${addonNames.join(", ")}` : ""),
        price,
        qty,
        variant_id: variantId !== "base" ? variantId : null,
        addon_ids: addonIds,
        addon_names: addonNames,
        sugar_level: supportsSugar ? parsedSugar : null,
        supports_sugar: supportsSugar,
      };
    })
    .filter((item): item is CartItem => item !== null);

  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discountNum = Number(discountValue) || 0;
  const cashNum = Number(cashReceived) || 0;

  let discountAmount = 0;
  if (discountType === "percent") discountAmount = subtotal * (discountNum / 100);
  if (discountType === "fixed") discountAmount = discountNum;

  const totalAfterDiscount = Math.max(subtotal - discountAmount, 0);
  const requestedRedeemPoints = Math.max(0, Math.floor(Number(redeemPointsInput || 0)));
  const maxRedeemByAmount = Math.floor(
    (totalAfterDiscount * LOYALTY_REDEEM_MAX_RATIO) / LOYALTY_REDEEM_RM_PER_POINT
  );
  const redeemEligibleMaxPoints = linkedCustomerId ? Math.min(memberPoints, maxRedeemByAmount) : 0;
  const candidateRedeemPoints = linkedCustomerId
    ? Math.min(requestedRedeemPoints, memberPoints, maxRedeemByAmount)
    : 0;
  const appliedRedeemPoints =
    candidateRedeemPoints >= LOYALTY_REDEEM_MIN_POINTS ? candidateRedeemPoints : 0;
  const redeemAmount = appliedRedeemPoints * LOYALTY_REDEEM_RM_PER_POINT;
  const total = Math.max(totalAfterDiscount - redeemAmount, 0);
  const balance = paymentMethod === "cash" ? cashNum - total : 0;

  async function openShift() {
    const openingCashNum = Number(openingCash || 0);
    if (!Number.isFinite(openingCashNum) || openingCashNum < 0) {
      alert("Opening cash tak valid");
      return;
    }

    setShiftSubmitting(true);
    setShiftError(null);

    try {
      const res = await fetch("/api/pos/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "open",
          register_id: registerId,
          opening_cash: openingCashNum,
          opening_note: openingNote,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setShiftError(data?.error || "Failed to open shift");
        return;
      }

      setCurrentShift(data.shift || null);
      setCashSalesLive(Number(data.cash_sales || 0));
      setExpectedCashLive(Number(data.expected_cash_live || 0));
      setOpeningCash("");
      setOpeningNote("");
      setShowOpenShiftModal(false);
    } finally {
      setShiftSubmitting(false);
    }
  }

  async function closeShift() {
    if (items.length > 0) {
      alert("Clear cart dulu sebelum close shift.");
      return;
    }

    const countedCashNum = Number(countedCash || 0);
    if (!Number.isFinite(countedCashNum) || countedCashNum < 0) {
      alert("Counted cash tak valid");
      return;
    }

    setShiftSubmitting(true);
    setShiftError(null);

    try {
      const res = await fetch("/api/pos/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "close",
          register_id: registerId,
          counted_cash: countedCashNum,
          closing_note: closingNote,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setShiftError(data?.error || "Failed to close shift");
        return;
      }

      setCurrentShift(null);
      setCashSalesLive(0);
      setExpectedCashLive(0);
      setCountedCash("");
      setClosingNote("");
      setShowCloseShiftModal(false);
      setShowOpenShiftModal(true);
    } finally {
      setShiftSubmitting(false);
    }
  }

  async function lookupMemberByPhone() {
    const phone = customerPhone.trim();
    if (!phone) {
      setMemberLookupTone("warn");
      setMemberLookupMessage("Enter phone number first");
      return;
    }

    setMemberLookupLoading(true);
    setMemberLookupMessage(null);
    setMemberLookupTone("default");

    try {
      const res = await fetch(`/api/pos/customers/lookup?phone=${encodeURIComponent(phone)}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        setMemberLookupTone("warn");
        setMemberLookupMessage(data?.error || "Lookup failed");
        return;
      }

      const customer = data?.customer as MemberLookup | null;
      if (!customer) {
        setLinkedCustomerId(null);
        setMemberPoints(0);
        setMemberExpiringPoints(0);
        setMemberLookupTone("warn");
        setMemberLookupMessage("No member found. Continue as new customer.");
        return;
      }

      setLinkedCustomerId(customer.id);
      setCustomerName(customer.name || customerName);
      setCustomerPhone(customer.phone || phone);
      setCustomerEmail(customer.email || "");
      setConsentWhatsapp(Boolean(customer.consent_whatsapp));
      setConsentEmail(Boolean(customer.consent_email));
      setMemberPoints(Number(customer.loyalty_points || 0));
      setMemberExpiringPoints(Number(customer.expiring_points_30d || 0));
      setMemberLookupTone("success");
      setMemberLookupMessage(
        `Member found (${customer.total_orders} orders • RM ${customer.total_spend.toFixed(2)} • ${Number(
          customer.loyalty_points || 0
        )} pts)`
      );
    } finally {
      setMemberLookupLoading(false);
    }
  }

  async function completePayment() {
    if (!currentShift) {
      alert("Please open shift first");
      setShowOpenShiftModal(true);
      return;
    }

    if (!customerName.trim()) {
      alert("Customer name required");
      return;
    }

    if (consentWhatsapp && !customerPhone.trim()) {
      alert("Phone number required for WhatsApp consent");
      return;
    }

    if (consentEmail && !customerEmail.trim()) {
      alert("Email required for Email consent");
      return;
    }

    if (paymentMethod === "cash" && (!cashNum || cashNum < total)) {
      alert("Cash received is not enough");
      return;
    }

    let reservedPrintWindow: Window | null = null;
    if (autoPrintEnabled) {
      reservedPrintWindow = window.open("", "_blank", "noopener,noreferrer,width=420,height=720");
      if (!reservedPrintWindow) {
        alert("Popup blocked. Please allow popups for auto print.");
        return;
      }
    }

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          register_id: registerId,
          customer_name: customerName,
          customer: {
            id: linkedCustomerId || undefined,
            name: customerName,
            phone: customerPhone,
            email: customerEmail,
            consent_whatsapp: consentWhatsapp,
            consent_email: consentEmail,
          },
          loyalty_redeem_points: appliedRedeemPoints,
          subtotal,
          discount_type: discountType,
          discount_value: discountAmount,
          total,
          payment_method: paymentMethod,
          cash_received: paymentMethod === "cash" ? cashNum : total,
          balance: paymentMethod === "cash" ? cashNum - total : 0,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        if (reservedPrintWindow) reservedPrintWindow.close();
        alert(data?.error || "Payment failed");
        return;
      }

      setShowCheckout(false);
      const nextReceiptData: ReceiptData = {
        order_id: String(data.order_id || ""),
        receipt_number: data.receipt_number,
        customerName,
        items,
        subtotal,
        discount: discountAmount + redeemAmount,
        total,
        payment_method: paymentMethod,
        created_at: new Date().toISOString(),
      };
      setReceiptData(nextReceiptData);
      if (autoPrintEnabled) {
        printReceipt(nextReceiptData, reservedPrintWindow);
      }

      setCart({});
      setCustomerName("");
      setCustomerPhone("");
      setCustomerEmail("");
      setConsentWhatsapp(false);
      setConsentEmail(false);
      setLinkedCustomerId(null);
      setMemberPoints(0);
      setMemberExpiringPoints(0);
      setRedeemPointsInput("");
      setMemberLookupMessage(null);
      setDiscountType("none");
      setDiscountValue("");
      setCashReceived("");
      setShowDiscountControls(false);
      void refreshShiftState({ autoPromptIfClosed: false });
    } catch (error) {
      if (reservedPrintWindow) reservedPrintWindow.close();
      alert("Server error");
      console.error(error);
    }
  }

  function printReceipt(data: ReceiptData, existingWindow?: Window | null) {
    if (data.order_id) {
      const printUrl = `/api/orders/receipt/${encodeURIComponent(data.order_id)}`;
      if (existingWindow && !existingWindow.closed) {
        existingWindow.location.replace(printUrl);
        return;
      }
      const opened = window.open(printUrl, "_blank", "width=420,height=720");
      if (!opened) {
        alert("Popup blocked. Please allow popups to print receipt.");
      }
      return;
    }

    const html = buildReceiptHtml({
      receiptNumber: data.receipt_number,
      createdAt: data.created_at,
      customerName: data.customerName,
      paymentMethod: data.payment_method,
      subtotal: data.subtotal,
      discount: data.discount,
      total: data.total,
      items: data.items.map(item => ({
        name:
          item.name +
          (item.supports_sugar ? ` • Sugar: ${sugarLabel(item.sugar_level || DEFAULT_SUGAR_LEVEL)}` : ""),
        qty: item.qty,
        unitPrice: item.price,
        lineTotal: item.price * item.qty,
      })),
      autoPrint: true,
    });

    const printWindow =
      existingWindow && !existingWindow.closed
        ? existingWindow
        : window.open("", "_blank", "width=420,height=720");
    if (!printWindow) {
      alert("Popup blocked. Please allow popups to print receipt.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-28">
      <div className="sticky top-0 z-10 bg-black p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">Loka POS</div>
            <div className={`text-xs ${currentShift ? "text-green-400" : "text-amber-300"}`}>
              {shiftLoading
                ? "Checking shift..."
                : currentShift
                  ? `Shift Open · Cash RM ${expectedCashLive.toFixed(2)}`
                  : "Shift Closed"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-white/10 px-3 py-1 text-xs">{items.length} item</div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMoreMenu(prev => !prev)}
                className="rounded-full border border-white/20 px-3 py-1 text-xs hover:bg-white/10"
              >
                More
              </button>
              {showMoreMenu ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowMoreMenu(false)}
                    className="fixed inset-0 z-10"
                    aria-label="Close menu"
                  />
                  <div className="absolute right-0 z-20 mt-2 w-44 rounded-lg border border-white/10 bg-[#111] p-1.5 shadow-xl">
                    <a
                      href="/dashboard"
                      onClick={() => setShowMoreMenu(false)}
                      className="block rounded-md px-3 py-2 text-sm text-gray-200 hover:bg-[#1b1b1b]"
                    >
                      Admin Panel
                    </a>
                    {currentShift ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCountedCash(expectedCashLive.toFixed(2));
                          setShowCloseShiftModal(true);
                          setShowMoreMenu(false);
                        }}
                        className="block w-full rounded-md px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#1b1b1b]"
                      >
                        Close Shift
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setShowOpenShiftModal(true);
                          setShowMoreMenu(false);
                        }}
                        className="block w-full rounded-md px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#1b1b1b]"
                      >
                        Start Shift
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setShowSignOutConfirm(true);
                        setShowMoreMenu(false);
                      }}
                      className="block w-full rounded-md px-3 py-2 text-left text-sm text-red-300 hover:bg-[#1b1b1b]"
                    >
                      Sign out
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {shiftError ? (
        <div className="mx-4 mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {shiftError}
        </div>
      ) : null}

      {showSignOutConfirm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Sign out now?</h3>
            <p className="mt-1 text-sm text-gray-500">Anda akan keluar dari POS pada peranti ini.</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowSignOutConfirm(false)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
              >
                Cancel
              </button>
              <a
                href="/auth/logout?next=/login"
                className="flex-1 rounded-lg bg-[#7F1D1D] px-3 py-2 text-center text-sm font-medium text-white"
              >
                Yes, Sign out
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {showSugarQuickPick && sugarQuickPickPayload ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Sugar Level</h3>
            <p className="mt-1 text-sm text-gray-500">{sugarQuickPickPayload.product_name}</p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => submitQuickSugar("normal")}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800"
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => submitQuickSugar("less")}
                className="rounded-lg bg-[#7F1D1D] px-3 py-2 text-sm font-medium text-white"
              >
                Less Sugar
              </button>
            </div>

            <p className="mt-2 text-xs text-gray-500">
              Half / No Sugar boleh ubah di checkout.
            </p>

            <button
              type="button"
              onClick={closeQuickSugarPrompt}
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {showOpenShiftModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Start Shift</h3>
            <p className="mt-1 text-sm text-gray-500">
              Masukkan opening cash (float) sebelum mula ambil order.
            </p>
            <div className="mt-3 space-y-2">
              <input
                type="number"
                value={openingCash}
                onChange={e => setOpeningCash(e.target.value)}
                placeholder="Opening cash (RM)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <textarea
                value={openingNote}
                onChange={e => setOpeningNote(e.target.value)}
                placeholder="Note (optional)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                rows={2}
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowOpenShiftModal(false)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void openShift()}
                disabled={shiftSubmitting}
                className="flex-1 rounded-lg bg-[#7F1D1D] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {shiftSubmitting ? "Starting..." : "Start Shift"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCloseShiftModal && currentShift ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Close Shift</h3>
            <p className="mt-1 text-sm text-gray-500">Confirm cash count untuk closing shift.</p>

            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              <div>Opening Cash: RM {Number(currentShift.opening_cash || 0).toFixed(2)}</div>
              <div>Cash Sales: RM {cashSalesLive.toFixed(2)}</div>
              <div className="font-semibold">Expected Cash: RM {expectedCashLive.toFixed(2)}</div>
            </div>

            <div className="mt-3 space-y-2">
              <input
                type="number"
                value={countedCash}
                onChange={e => setCountedCash(e.target.value)}
                placeholder="Counted cash (RM)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <div className="text-sm">
                Over/Short:{" "}
                <span className="font-semibold">
                  RM {(Number(countedCash || 0) - expectedCashLive).toFixed(2)}
                </span>
              </div>
              <textarea
                value={closingNote}
                onChange={e => setClosingNote(e.target.value)}
                placeholder="Closing note (optional)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                rows={2}
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowCloseShiftModal(false)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void closeShift()}
                disabled={shiftSubmitting}
                className="flex-1 rounded-lg bg-[#7F1D1D] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {shiftSubmitting ? "Closing..." : "Close Shift"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto p-4 pb-3">
        {categoryOptions.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm ${
              category === cat ? "bg-[#7F1D1D] text-white" : "border bg-white"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3">
        {filteredProducts.map(product => (
          <button
            key={product.id}
            onClick={() => {
              if (!currentShift) {
                setShowOpenShiftModal(true);
                return;
              }
              if (Number(product.stock || 0) <= 0) return;
              if (product.variants && product.variants.length > 0) {
                setSelectedProduct(product);
                setSelectedVariant(null);
                setSelectedAddons([]);
                setShowAddonModal(false);
              } else if (product.addons && product.addons.length > 0) {
                setSelectedProduct(product);
                setSelectedVariant(null);
                setSelectedAddons([]);
                setShowAddonModal(true);
              } else {
                addProductWithQuickSugar({
                  product,
                  feedbackLabel: `${product.name} added`,
                });
              }
            }}
            className={`rounded-2xl border p-4 text-left shadow-sm transition ${
              Number(product.stock || 0) <= 0
                ? "border-gray-200 bg-gray-100 text-gray-400"
                : "border-gray-200 bg-white hover:shadow"
            }`}
          >
            <div className="min-h-10 line-clamp-2 text-sm font-medium">{product.name}</div>
            <div className="mt-2 font-semibold">RM {product.price}</div>
            <div className={`mt-1 text-xs ${product.stock <= 10 ? "text-red-500" : "text-gray-500"}`}>
              Stock: {product.stock}
            </div>
          </button>
        ))}
      </div>

      {filteredProducts.length === 0 ? (
        <div className="px-4 py-6 text-sm text-gray-500">
          No active products found. Enable products in Dashboard or switch category.
        </div>
      ) : null}

      {selectedProduct && !showAddonModal ? (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-4">
            <h2 className="text-lg font-bold">{selectedProduct.name}</h2>

            {selectedProduct.variants?.map(variant => (
              <button
                key={variant.id}
                onClick={() => {
                  if (selectedProduct.addons && selectedProduct.addons.length > 0) {
                    setSelectedVariant(variant.id);
                    setShowAddonModal(true);
                  } else {
                    addProductWithQuickSugar({
                      product: selectedProduct,
                      variantId: variant.id,
                      feedbackLabel: `${selectedProduct.name} (${variant.name}) added`,
                    });
                    setSelectedProduct(null);
                    setSelectedVariant(null);
                    setSelectedAddons([]);
                  }
                }}
                className="mb-2 w-full rounded border p-2"
              >
                {variant.name} (+RM{variant.price_adjustment})
              </button>
            ))}

            {!selectedProduct.variants?.length ? (
              <button
                onClick={() => {
                  addProductWithQuickSugar({
                    product: selectedProduct,
                  });
                  setSelectedProduct(null);
                  setSelectedVariant(null);
                  setSelectedAddons([]);
                }}
                className="w-full rounded bg-[#7F1D1D] py-2 text-white"
              >
                Add
              </button>
            ) : null}

            <button
              onClick={() => {
                setSelectedProduct(null);
                setSelectedVariant(null);
                setSelectedAddons([]);
                setShowAddonModal(false);
              }}
              className="w-full rounded bg-gray-200 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {showAddonModal && selectedProduct ? (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-4">
            <h2 className="text-lg font-bold">{selectedProduct.name} Addons</h2>

            {selectedProduct.addons?.map(addon => (
              <label key={addon.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedAddons.includes(addon.id)}
                  onChange={e => {
                    if (e.target.checked) {
                      setSelectedAddons(prev => [...prev, addon.id]);
                    } else {
                      setSelectedAddons(prev => prev.filter(id => id !== addon.id));
                    }
                  }}
                />
                {addon.name} (+RM{addon.price})
              </label>
            ))}

            <button
              onClick={() => {
                addProductWithQuickSugar({
                  product: selectedProduct,
                  variantId: selectedVariant || undefined,
                  addonIds: selectedAddons,
                  feedbackLabel: `${selectedProduct.name} added`,
                });
                setSelectedProduct(null);
                setSelectedVariant(null);
                setSelectedAddons([]);
                setShowAddonModal(false);
              }}
              className="w-full rounded bg-[#7F1D1D] py-2 text-white"
            >
              Add
            </button>

            <button
              onClick={() => {
                if (selectedProduct.variants && selectedProduct.variants.length > 0) {
                  setShowAddonModal(false);
                } else {
                  setSelectedProduct(null);
                  setShowAddonModal(false);
                }
                setSelectedAddons([]);
              }}
              className="w-full rounded bg-gray-200 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {items.length > 0 && !showCheckout ? (
        <div className="fixed bottom-0 left-0 right-0 border-t bg-white p-2.5">
          <button
            onClick={() => setShowCheckout(true)}
            disabled={!currentShift}
            className="w-full rounded-xl bg-[#7F1D1D] py-3 text-base text-white disabled:opacity-60"
          >
            View Cart ({items.length}) • RM {total.toFixed(2)}
          </button>
        </div>
      ) : null}

      {!currentShift && !shiftLoading && !showCheckout ? (
        <div className="fixed bottom-0 left-0 right-0 border-t bg-white p-2.5">
          <button
            type="button"
            onClick={() => setShowOpenShiftModal(true)}
            className="w-full rounded-xl bg-[#7F1D1D] py-3 text-base text-white"
          >
            Start Shift To Begin Orders
          </button>
        </div>
      ) : null}

      {addedToast ? (
        <div className="fixed bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-black px-4 py-2 text-sm text-white shadow-lg">
          {addedToast}
        </div>
      ) : null}

      {showCheckout ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-t-2xl bg-white sm:max-w-md sm:rounded-2xl">
            <div className="flex items-center justify-between border-b p-3">
              <h2 className="text-base font-bold sm:text-lg">Checkout</h2>
              <button onClick={() => setShowCheckout(false)} className="text-xl text-gray-500">
                ×
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.id} className="flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                      <div className="truncate text-[13px] leading-tight">{item.name}</div>
                      {item.supports_sugar ? (
                        <div className="mt-1">
                          <select
                            value={(item.sugar_level || DEFAULT_SUGAR_LEVEL) as SugarLevel}
                            onChange={e => updateItemSugar(item, e.target.value as SugarLevel)}
                            className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-700"
                          >
                            {SUGAR_LEVEL_OPTIONS.map(option => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                      {item.addon_names?.length > 0 ? (
                        <div className="truncate text-xs text-[#7F1D1D]">
                          Addon: {item.addon_names.join(", ")}
                        </div>
                      ) : null}
                      <div className="text-xs text-gray-500">RM {item.price}</div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="h-6 w-6 rounded bg-gray-200 text-sm"
                      >
                        -
                      </button>
                      <span className="text-sm">{item.qty}</span>
                      <button
                        onClick={() =>
                          addToCart(
                            item.product_id,
                            item.variant_id || undefined,
                            item.addon_ids,
                            item.sugar_level,
                            undefined,
                            true
                          )
                        }
                        className="h-6 w-6 rounded bg-gray-200 text-sm"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2 border-t pt-2">
                <input
                  placeholder="Customer Name"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full rounded-lg border p-2.5"
                />

                <div className="flex gap-2">
                  <input
                    placeholder="Phone (optional)"
                    value={customerPhone}
                    onChange={e => {
                      setCustomerPhone(e.target.value);
                      setLinkedCustomerId(null);
                      setMemberPoints(0);
                      setMemberExpiringPoints(0);
                      setRedeemPointsInput("");
                      setMemberLookupMessage(null);
                    }}
                    className="w-full rounded-lg border p-2.5"
                  />
                  <button
                    type="button"
                    onClick={() => void lookupMemberByPhone()}
                    disabled={memberLookupLoading}
                    className="whitespace-nowrap rounded-lg border border-gray-300 px-3 text-sm"
                  >
                    {memberLookupLoading ? "Finding..." : "Find"}
                  </button>
                </div>

                {memberLookupMessage ? (
                  <div
                    className={`text-xs ${
                      memberLookupTone === "success"
                        ? "text-green-600"
                        : memberLookupTone === "warn"
                          ? "text-amber-600"
                          : "text-gray-500"
                    }`}
                  >
                    {memberLookupMessage}
                  </div>
                ) : null}

                {linkedCustomerId ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    <div>
                      Available points (valid 1 year): <span className="font-semibold">{memberPoints}</span>
                    </div>
                    {memberExpiringPoints > 0 ? (
                      <div className="mt-0.5 text-[11px] text-amber-700">
                        Expiring in next 30 days: {memberExpiringPoints} pts
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <input
                  placeholder="Email (optional)"
                  value={customerEmail}
                  onChange={e => setCustomerEmail(e.target.value)}
                  className="w-full rounded-lg border p-2.5"
                />

                <div className="rounded-lg border border-gray-200 p-2.5 text-sm">
                  <label className="mb-1 block text-xs font-medium text-gray-600">Marketing Consent</label>
                  <select
                    value={getMarketingConsentMode()}
                    onChange={e => applyMarketingConsentMode(e.target.value as MarketingConsentMode)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="none">None</option>
                    <option value="whatsapp">WhatsApp Only</option>
                    <option value="email">Email Only</option>
                    <option value="both">WhatsApp + Email</option>
                  </select>
                </div>

                <div>
                  <button
                    onClick={() => setShowDiscountControls(prev => !prev)}
                    className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  >
                    <span>Discount</span>
                    <span className="text-gray-500">
                      {discountType === "percent" ? "%" : discountType === "fixed" ? "RM" : "None"}
                    </span>
                  </button>

                  {showDiscountControls ? (
                    <div className="mt-2">
                      <div className="flex gap-2">
                        {DISCOUNT_TYPES.map(type => (
                          <button
                            key={type}
                            onClick={() => setDiscountType(type)}
                            className={`flex-1 rounded-lg py-1.5 text-sm ${
                              discountType === type ? "bg-[#7F1D1D] text-white" : "bg-gray-200"
                            }`}
                          >
                            {type === "percent" ? "%" : type === "fixed" ? "RM" : "None"}
                          </button>
                        ))}
                      </div>

                      {discountType !== "none" ? (
                        <input
                          type="number"
                          placeholder="Enter value"
                          value={discountValue}
                          onChange={e => setDiscountValue(e.target.value)}
                          className="mt-2 w-full rounded-lg border p-2"
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {linkedCustomerId ? (
                  <div className="rounded-lg border border-gray-200 p-2.5">
                    <div className="mb-1 text-sm">Redeem Points</div>
                    <input
                      type="number"
                      min={0}
                      max={memberPoints}
                      placeholder={`Min ${LOYALTY_REDEEM_MIN_POINTS} • Max ${Math.min(
                        memberPoints,
                        maxRedeemByAmount
                      )} pts`}
                      value={redeemPointsInput}
                      onChange={e => setRedeemPointsInput(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setRedeemPointsInput(String(LOYALTY_REDEEM_MIN_POINTS))}
                        disabled={redeemEligibleMaxPoints < LOYALTY_REDEEM_MIN_POINTS}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
                      >
                        Use 100
                      </button>
                      <button
                        type="button"
                        onClick={() => setRedeemPointsInput(String(redeemEligibleMaxPoints))}
                        disabled={redeemEligibleMaxPoints < LOYALTY_REDEEM_MIN_POINTS}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
                      >
                        Use Max
                      </button>
                      <button
                        type="button"
                        onClick={() => setRedeemPointsInput("")}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      100 pts = RM 5.00 | Max 30% order | Redeem: {appliedRedeemPoints} pts (RM{" "}
                      {redeemAmount.toFixed(2)})
                    </div>
                    {redeemEligibleMaxPoints >= LOYALTY_REDEEM_MIN_POINTS && !redeemPointsInput ? (
                      <div className="mt-1 text-xs text-amber-600">
                        Member eligible. Tap `Use 100` or enter points to apply redeem.
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div>
                  <div className="mb-1 text-sm">Payment</div>
                  <div className="flex gap-2">
                    {PAYMENT_METHODS.map(type => (
                      <button
                        key={type}
                        onClick={() => setPaymentMethod(type)}
                        className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${
                          paymentMethod === type ? "bg-[#7F1D1D] text-white" : "bg-gray-200"
                        }`}
                      >
                        {type.toUpperCase()}
                      </button>
                    ))}
                  </div>

                  {paymentMethod === "cash" ? (
                    <input
                      type="number"
                      placeholder="Cash Received"
                      value={cashReceived}
                      onChange={e => setCashReceived(e.target.value)}
                      className="mt-2 w-full rounded-lg border p-2"
                    />
                  ) : null}
                </div>

                <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 text-sm">
                  <span>Auto Print after Complete</span>
                  <input
                    type="checkbox"
                    checked={autoPrintEnabled}
                    onChange={e => setAutoPrintEnabled(e.target.checked)}
                    className="h-4 w-4 accent-[#7F1D1D]"
                  />
                </label>
                <div className="-mt-1 text-xs text-gray-500">
                  Opens browser print dialog automatically after successful payment.
                </div>
              </div>
            </div>

            <div className="space-y-2 border-t bg-white p-3">
              <div className="space-y-1 text-sm">
                <div>Subtotal: RM {subtotal.toFixed(2)}</div>
                <div>Discount: RM {discountAmount.toFixed(2)}</div>
                {appliedRedeemPoints > 0 ? (
                  <div>
                    Loyalty Redeem: {appliedRedeemPoints} pts (-RM {redeemAmount.toFixed(2)})
                  </div>
                ) : null}
                <div className="text-lg font-semibold">Total: RM {total.toFixed(2)}</div>
                {paymentMethod === "cash" ? (
                  <div className="text-xs text-gray-500">Balance: RM {balance.toFixed(2)}</div>
                ) : null}
              </div>

              <button
                onClick={() => void completePayment()}
                className="w-full rounded-xl bg-[#7F1D1D] py-2.5 text-white"
              >
                Complete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {receiptData ? (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-2 rounded-2xl bg-white p-6">
            <h2 className="text-center text-xl font-bold">ORDER #{receiptData.receipt_number}</h2>
            <p className="text-center">{receiptData.customerName}</p>
            <hr />
            {receiptData.items.map((item, idx) => (
              <div key={idx} className="flex justify-between gap-2">
                <div>
                  <div>
                    {item.name} x{item.qty}
                  </div>
                  {item.addon_names?.length > 0 ? (
                    <div className="text-xs text-[#7F1D1D]">Addon: {item.addon_names.join(", ")}</div>
                  ) : null}
                  {item.supports_sugar ? (
                    <div className="text-xs text-gray-500">
                      Sugar: {sugarLabel(item.sugar_level || DEFAULT_SUGAR_LEVEL)}
                    </div>
                  ) : null}
                </div>
                <span>RM {(item.price * item.qty).toFixed(2)}</span>
              </div>
            ))}
            <hr />
            <div className="font-semibold">Total: RM {receiptData.total.toFixed(2)}</div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => printReceipt(receiptData)}
                className="w-full rounded-2xl border border-gray-300 py-3 text-gray-800"
              >
                Print Receipt
              </button>
              <button
                onClick={() => setReceiptData(null)}
                className="w-full rounded-2xl bg-[#7F1D1D] py-3 text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
