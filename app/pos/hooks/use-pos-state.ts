"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Product, Shift, PaidOutEntry, CartItem, ReceiptData, SugarLevel,
  MarketingConsentMode, MemberLookup, DEFAULT_SUGAR_LEVEL, SUGAR_LEVEL_OPTIONS,
  LOYALTY_REDEEM_RM_PER_POINT, LOYALTY_REDEEM_MIN_POINTS, LOYALTY_REDEEM_MAX_RATIO,
  buildCartKey, isSugarSupportedCategory, sugarLabel,
} from "../types";

const REGISTER_ID = "main";
const POS_AUTO_PRINT_KEY = "pos_auto_print_enabled";
const POS_AUTO_LABEL_KEY = "pos_auto_label_enabled";
const POS_PAID_OUT_STAFF_NAME_KEY = "pos_paid_out_staff_name";
const POS_PRINTER_IP_KEY = "pos_printer_ip";

// ━━━ Navigation types ━━━
export type MainTab = "checkout" | "orders" | "reports" | "more";
export type CheckoutSubTab = "keypad" | "library" | "favourites";
export type Overlay = "none" | "cart" | "payment" | "done" | "customer" | "products";

// ━━━ Orders list type ━━━
export type OrderRow = {
  id: string;
  receipt_number: string;
  customer_name: string;
  total: number;
  payment_method: string;
  payment_status: string;
  status: string;
  order_source: string | null;
  created_at: string;
};

// ━━━ Order detail item ━━━
export type OrderDetailItem = {
  name: string;
  variant_name: string | null;
  addon_names: string[];
  sugar_level: string | null;
  price: number;
  qty: number;
  line_total: number;
};

// ━━━ Reports types ━━━
export type ReportRange = "today" | "yesterday" | "7days" | "month";
export type DashboardData = {
  orders: Array<{ id: string; total: number; payment_method: string; created_at: string }>;
  topProducts: Array<{ product_name: string; total_qty: number }>;
  yesterdaySales: number;
  bestHour: string | null;
  bestHourSales: number;
  paymentMix: Record<string, number>;
  lowStock: Array<{ id: string; name: string; stock: number }>;
  monthlyPL: { month: string; sales: number; expenses: number; paid_out: number; outflow: number; profit_loss: number };
};

export { REGISTER_ID };

export function usePosState() {
  // ───── Navigation ─────
  const [mainTab, setMainTab] = useState<MainTab>("checkout");
  const [checkoutSub, setCheckoutSub] = useState<CheckoutSubTab>("favourites");
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [keypadValue, setKeypadValue] = useState("0");
  const [keypadNote, setKeypadNote] = useState("");

  // ───── Products ─────
  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  // ───── Cart ─────
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({});
  const [customNotes, setCustomNotes] = useState<Record<string, string>>({});

  // ───── Product selection modals ─────
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showAddonModal, setShowAddonModal] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [showSugarPicker, setShowSugarPicker] = useState(false);
  const [sugarPickerPayload, setSugarPickerPayload] = useState<{
    product_id: string; product_name: string; variant_id?: string; addon_ids?: string[]; feedback_label?: string;
  } | null>(null);

  // ───── Shift modals ─────
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [showPaidOutModal, setShowPaidOutModal] = useState(false);
  const [addedToast, setAddedToast] = useState<string | null>(null);

  // ───── Shift state ─────
  const [shiftLoading, setShiftLoading] = useState(true);
  const [shiftError, setShiftError] = useState<string | null>(null);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [cashSalesLive, setCashSalesLive] = useState(0);
  const [paidOutTotalLive, setPaidOutTotalLive] = useState(0);
  const [expectedCashLive, setExpectedCashLive] = useState(0);
  const [openingCash, setOpeningCash] = useState("");
  const [openingNote, setOpeningNote] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [closingNote, setClosingNote] = useState("");
  const [shiftSubmitting, setShiftSubmitting] = useState(false);

  // ───── Paid Out ─────
  const [paidOutSubmitting, setPaidOutSubmitting] = useState(false);
  const [paidOutAmount, setPaidOutAmount] = useState("");
  const [paidOutStaffName, setPaidOutStaffName] = useState("");
  const [paidOutReason, setPaidOutReason] = useState("");
  const [paidOutVendor, setPaidOutVendor] = useState("");
  const [paidOutInvoiceNumber, setPaidOutInvoiceNumber] = useState("");
  const [paidOutInvoiceUrl, setPaidOutInvoiceUrl] = useState("");
  const [paidOutNotes, setPaidOutNotes] = useState("");
  const [recentPaidOuts, setRecentPaidOuts] = useState<PaidOutEntry[]>([]);

  // ───── Customer / Loyalty ─────
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [consentWhatsapp, setConsentWhatsapp] = useState(false);
  const [consentEmail, setConsentEmail] = useState(false);
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null);
  const [memberLookupLoading, setMemberLookupLoading] = useState(false);
  const [memberLookupMessage, setMemberLookupMessage] = useState<string | null>(null);
  const [memberLookupTone, setMemberLookupTone] = useState<"default" | "success" | "warn">("default");
  const [memberPoints, setMemberPoints] = useState(0);
  const [memberExpiringPoints, setMemberExpiringPoints] = useState(0);
  const [redeemPointsInput, setRedeemPointsInput] = useState("");

  // ───── Payment ─────
  const [discountType, setDiscountType] = useState<"none" | "percent" | "fixed">("none");
  const [discountValue, setDiscountValue] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "qr" | "card">("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false);
  const [autoPrintLabel, setAutoPrintLabel] = useState(false);
  const [printerIp, setPrinterIp] = useState("");
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [showDiscountPanel, setShowDiscountPanel] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // ───── Orders tab ─────
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderDetailOpen, setOrderDetailOpen] = useState<string | null>(null);
  const [orderDetailItems, setOrderDetailItems] = useState<OrderDetailItem[]>([]);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [orderDetailError, setOrderDetailError] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);

  // ───── Reports tab ─────
  const [reportRange, setReportRange] = useState<ReportRange>("today");
  const [reportData, setReportData] = useState<DashboardData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // ───── Product management ─────
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [prodName, setProdName] = useState("");
  const [prodPrice, setProdPrice] = useState("");
  const [prodCost, setProdCost] = useState("");
  const [prodStock, setProdStock] = useState("");
  const [prodCategoryId, setProdCategoryId] = useState("");
  const [prodImageUrl, setProdImageUrl] = useState("");
  const [prodSaving, setProdSaving] = useState(false);
  const [prodImageUploading, setProdImageUploading] = useState(false);
  const [allCategories, setAllCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [newCatName, setNewCatName] = useState("");
  const [variantName, setVariantName] = useState("");
  const [variantPrice, setVariantPrice] = useState("");
  const [addonName, setAddonName] = useState("");
  const [addonPrice, setAddonPrice] = useState("");

  // ━━━ Consent helpers ━━━
  function setConsentMode(mode: MarketingConsentMode) { setConsentWhatsapp(mode === "both" || mode === "whatsapp"); setConsentEmail(mode === "both" || mode === "email"); }
  function getConsentMode(): MarketingConsentMode { if (consentWhatsapp && consentEmail) return "both"; if (consentWhatsapp) return "whatsapp"; if (consentEmail) return "email"; return "none"; }

  // ━━━ Sound ━━━
  const actxRef = useRef<AudioContext | null>(null);
  const beepBufRef = useRef<AudioBuffer | null>(null);

  useEffect(() => {
    function initAudio() {
      try {
        // BUG-16 FIX: proper Safari AudioContext detection
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        actxRef.current = ctx;
        const sr = ctx.sampleRate; const len = Math.floor(sr * 0.07);
        const buf = ctx.createBuffer(1, len, sr); const ch = buf.getChannelData(0);
        for (let i = 0; i < len; i++) { const t = i / sr; ch[i] = Math.sin(2 * Math.PI * 880 * t) * 0.2 * (1 - t / 0.07); }
        beepBufRef.current = buf;
        if (ctx.state === "suspended") ctx.resume();
      } catch { /* silent */ }
    }
    function unlock() { if (!actxRef.current) initAudio(); else if (actxRef.current.state === "suspended") actxRef.current.resume(); }
    document.addEventListener("touchstart", unlock, { once: true });
    document.addEventListener("click", unlock, { once: true });
    initAudio();
    // BUG-15 FIX: Clean up AudioContext on unmount
    return () => {
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("click", unlock);
      if (actxRef.current && actxRef.current.state !== "closed") {
        actxRef.current.close().catch(() => {});
      }
    };
  }, []);

  function playBeep() {
    try {
      const ctx = actxRef.current; const buf = beepBufRef.current;
      if (!ctx || !buf) return;
      if (ctx.state === "suspended") ctx.resume();
      const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start(0);
    } catch { /* silent */ }
  }

  // ━━━ Shift ━━━
  const refreshShiftState = useCallback(async (opts?: { autoPrompt?: boolean }) => {
    const autoPrompt = opts?.autoPrompt ?? true;
    setShiftLoading(true); setShiftError(null);
    try {
      const res = await fetch(`/api/pos/shift?register_id=${REGISTER_ID}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setShiftError(data?.error || "Gagal load shift");
        setCurrentShift(null); setCashSalesLive(0); setPaidOutTotalLive(0); setExpectedCashLive(0); setRecentPaidOuts([]);
        if (autoPrompt) setShowOpenShiftModal(true);
        return;
      }
      setCurrentShift(data.shift || null);
      setCashSalesLive(Number(data.cash_sales || 0));
      setPaidOutTotalLive(Number(data.paid_out_total || 0));
      setExpectedCashLive(Number(data.expected_cash_live || 0));
      if (autoPrompt) { setShowOpenShiftModal(!data.shift); } else if (data.shift) { setShowOpenShiftModal(false); }
    } catch {
      setShiftError("Gagal load shift");
      setCurrentShift(null);
      if (autoPrompt) setShowOpenShiftModal(true);
    } finally { setShiftLoading(false); }
  }, []);

  async function loadPaidOuts() {
    try {
      const res = await fetch(`/api/pos/paid-outs?register_id=${REGISTER_ID}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) return;
      setRecentPaidOuts(Array.isArray(data.paid_outs) ? data.paid_outs : []);
      setPaidOutTotalLive(Number(data.paid_out_total || 0));
    } catch { /* silent */ }
  }

  // ━━━ Orders ━━━
  async function loadOrders() {
    setOrdersLoading(true);
    try {
      const res = await fetch("/api/orders?limit=100&today=1", { cache: "no-store" });
      const data = await res.json();
      if (data?.orders && Array.isArray(data.orders)) setOrders(data.orders);
      else if (Array.isArray(data)) setOrders(data);
      else setOrders([]);
    } catch { setOrders([]); } finally { setOrdersLoading(false); }
  }

  async function loadOrderDetail(orderId: string) {
    setOrderDetailOpen(orderId);
    setOrderDetailItems([]);
    setOrderDetailError(false);
    setOrderDetailLoading(true);
    try {
      const res = await fetch(`/api/pos/orders?order_id=${encodeURIComponent(orderId)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) { setOrderDetailError(true); return; }
      if (data?.items && Array.isArray(data.items)) setOrderDetailItems(data.items);
      else setOrderDetailItems([]);
    } catch { setOrderDetailError(true); } finally { setOrderDetailLoading(false); }
  }

  // ━━━ Reports ━━━
  // BUG-07 FIX: Add cache TTL (60s) instead of permanent cache
  const reportCache = useRef<Record<string, { data: DashboardData; timestamp: number }>>({});
  const REPORT_CACHE_TTL = 60_000; // 60 seconds

  async function loadReport(range: ReportRange) {
    const cached = reportCache.current[range];
    if (cached && Date.now() - cached.timestamp < REPORT_CACHE_TTL) {
      setReportData(cached.data);
      return;
    }
    setReportLoading(true);
    try {
      const res = await fetch(`/api/dashboard?range=${range}`, { cache: "no-store" });
      const data = await res.json();
      reportCache.current[range] = { data, timestamp: Date.now() };
      setReportData(data);
    } catch { setReportData(null); } finally { setReportLoading(false); }
  }

  // ━━━ Order polling ━━━
  // BUG-08 FIX: Reset order count when shift changes
  const lastOrderCount = useRef(0);

  useEffect(() => {
    // Reset polling count on shift change
    lastOrderCount.current = 0;
  }, [currentShift?.id]);

  // ━━━ Cart actions ━━━
  function addToCart(productId: string, variantId?: string, addonIds?: string[], sugarLevel?: SugarLevel | null, feedbackLabel?: string, silent = false) {
    const key = buildCartKey(productId, variantId, addonIds, sugarLevel);
    setCart(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
    if (!silent) { const p = products.find(p => p.id === productId); setAddedToast(feedbackLabel || p?.name || "Ditambah"); playBeep(); }
  }
  function removeFromCart(key: string) { setCart(prev => { const u = { ...prev }; if (!u[key]) return u; u[key] -= 1; if (u[key] <= 0) delete u[key]; return u; }); }
  function deleteFromCart(key: string) { setCart(prev => { const u = { ...prev }; delete u[key]; return u; }); setCustomPrices(prev => { const u = { ...prev }; delete u[key]; return u; }); setCustomNotes(prev => { const u = { ...prev }; delete u[key]; return u; }); }

  function addProductWithSugar(opts: { product: Product; variantId?: string; addonIds?: string[]; feedbackLabel?: string }) {
    if (!isSugarSupportedCategory(opts.product.category)) { addToCart(opts.product.id, opts.variantId, opts.addonIds, null, opts.feedbackLabel); return; }
    setSugarPickerPayload({ product_id: opts.product.id, product_name: opts.product.name, variant_id: opts.variantId, addon_ids: opts.addonIds, feedback_label: opts.feedbackLabel });
    setShowSugarPicker(true);
  }
  function submitSugar(level: SugarLevel) { if (!sugarPickerPayload) return; addToCart(sugarPickerPayload.product_id, sugarPickerPayload.variant_id, sugarPickerPayload.addon_ids, level, sugarPickerPayload.feedback_label); setShowSugarPicker(false); setSugarPickerPayload(null); }
  function updateItemSugar(item: CartItem, next: SugarLevel) { const nk = buildCartKey(item.product_id, item.variant_id || undefined, item.addon_ids, next); if (nk === item.id) return; setCart(prev => { const q = prev[item.id] || 0; if (!q) return prev; const n = { ...prev }; delete n[item.id]; n[nk] = (n[nk] || 0) + q; return n; }); }

  function handleSelectProduct(product: Product) {
    if (!currentShift) { setShowOpenShiftModal(true); return; }
    if (Number(product.stock || 0) <= 0) return;
    if (product.variants && product.variants.length > 0) { setSelectedProduct(product); setSelectedVariant(null); setSelectedAddons([]); setShowAddonModal(false); }
    else if (product.addons && product.addons.length > 0) { setSelectedProduct(product); setSelectedVariant(null); setSelectedAddons([]); setShowAddonModal(true); }
    else { addProductWithSugar({ product, feedbackLabel: `${product.name} ✓` }); }
  }

  function addKeypadAmount() {
    const val = parseFloat(keypadValue); if (!val || val <= 0) return;
    const key = `custom__base__noaddon__normal__${Date.now()}`;
    setCart(prev => ({ ...prev, [key]: 1 }));
    setCustomPrices(prev => ({ ...prev, [key]: val }));
    if (keypadNote.trim()) setCustomNotes(prev => ({ ...prev, [key]: keypadNote.trim() }));
    setAddedToast(`RM${val.toFixed(2)} ditambah`); playBeep();
    setKeypadValue("0"); setKeypadNote("");
  }

  function clearCart() {
    setCart({}); setCustomPrices({}); setCustomNotes({});
  }

  function resetCustomerState() {
    setCustomerName(""); setCustomerPhone(""); setCustomerEmail("");
    setConsentWhatsapp(false); setConsentEmail(false);
    setLinkedCustomerId(null); setMemberPoints(0); setMemberExpiringPoints(0);
    setRedeemPointsInput(""); setMemberLookupMessage(null);
    setDiscountType("none"); setDiscountValue(""); setCashReceived("");
    setShowDiscountPanel(false);
  }

  // ━━━ Derived: Cart Items ━━━
  const items: CartItem[] = Object.entries(cart).map(([key, qty]) => {
    if (key.startsWith("custom__")) {
      const price = customPrices[key] || 0;
      if (!price) return null;
      const note = customNotes[key] || "Custom amount";
      return { id: key, product_id: "custom", name: note, price, qty, variant_id: null, addon_ids: [], addon_names: [], sugar_level: null, supports_sugar: false };
    }
    const [productId, variantId = "base", addonKey = "noaddon", sugarKey = DEFAULT_SUGAR_LEVEL] = key.split("__");
    const product = products.find(p => p.id === productId); if (!product) return null;
    let price = Number(product.price); let variantName = ""; const addonNames: string[] = []; const addonIds: string[] = [];
    if (variantId !== "base" && product.variants) { const v = product.variants.find(v => v.id === variantId); if (v) { price += Number(v.price_adjustment); variantName = v.name; } }
    if (addonKey !== "noaddon") { addonKey.split(",").forEach(aid => { const a = product.addons?.find(a => a.id === aid); if (a) { price += Number(a.price); addonNames.push(a.name); addonIds.push(a.id); } }); }
    const supportsSugar = isSugarSupportedCategory(product.category);
    return { id: key, product_id: productId, name: (variantName ? `${product.name} (${variantName})` : product.name) + (addonNames.length > 0 ? ` + ${addonNames.join(", ")}` : ""), price, qty, variant_id: variantId !== "base" ? variantId : null, addon_ids: addonIds, addon_names: addonNames, sugar_level: supportsSugar ? (sugarKey as SugarLevel) : null, supports_sugar: supportsSugar };
  }).filter((x): x is CartItem => x !== null);

  // ━━━ Derived: Pricing ━━━
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const discountNum = Number(discountValue) || 0;
  const cashNum = Number(cashReceived) || 0;
  let discountAmount = 0;
  if (discountType === "percent") discountAmount = subtotal * (discountNum / 100);
  if (discountType === "fixed") discountAmount = discountNum;
  const totalAfterDiscount = Math.max(subtotal - discountAmount, 0);
  const requestedRedeem = Math.max(0, Math.floor(Number(redeemPointsInput || 0)));
  const maxRedeemByAmount = Math.floor((totalAfterDiscount * LOYALTY_REDEEM_MAX_RATIO) / LOYALTY_REDEEM_RM_PER_POINT);
  const redeemEligibleMaxPoints = linkedCustomerId ? Math.min(memberPoints, maxRedeemByAmount) : 0;
  const candidateRedeem = linkedCustomerId ? Math.min(requestedRedeem, memberPoints, maxRedeemByAmount) : 0;
  const appliedRedeemPoints = candidateRedeem >= LOYALTY_REDEEM_MIN_POINTS ? candidateRedeem : 0;
  let redeemStatusMessage: string | null = null;
  if (linkedCustomerId) {
    if (redeemEligibleMaxPoints < LOYALTY_REDEEM_MIN_POINTS) redeemStatusMessage = `Subtotal terlalu rendah (cap 50%: ${redeemEligibleMaxPoints} pts).`;
    else if (requestedRedeem > 0 && requestedRedeem < LOYALTY_REDEEM_MIN_POINTS) redeemStatusMessage = `Minimum: ${LOYALTY_REDEEM_MIN_POINTS} points.`;
    else if (requestedRedeem > redeemEligibleMaxPoints) redeemStatusMessage = `Max: ${redeemEligibleMaxPoints} pts (50% cap).`;
  }
  const redeemAmount = appliedRedeemPoints * LOYALTY_REDEEM_RM_PER_POINT;
  const total = Math.max(totalAfterDiscount - redeemAmount, 0);
  const balance = paymentMethod === "cash" ? cashNum - total : 0;
  const categories = ["All", ...Array.from(new Set(products.map(p => p.category).filter((v): v is string => Boolean(v))))];
  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  // ━━━ LocalStorage effects ━━━
  useEffect(() => { try { setAutoPrintEnabled(window.localStorage.getItem(POS_AUTO_PRINT_KEY) === "1"); } catch {} }, []);
  useEffect(() => { try { window.localStorage.setItem(POS_AUTO_PRINT_KEY, autoPrintEnabled ? "1" : "0"); } catch {} }, [autoPrintEnabled]);
  useEffect(() => { try { setAutoPrintLabel(window.localStorage.getItem(POS_AUTO_LABEL_KEY) === "1"); } catch {} }, []);
  useEffect(() => { try { window.localStorage.setItem(POS_AUTO_LABEL_KEY, autoPrintLabel ? "1" : "0"); } catch {} }, [autoPrintLabel]);
  useEffect(() => { try { setPaidOutStaffName(window.localStorage.getItem(POS_PAID_OUT_STAFF_NAME_KEY) || ""); } catch {} }, []);
  useEffect(() => { try { window.localStorage.setItem(POS_PAID_OUT_STAFF_NAME_KEY, paidOutStaffName); } catch {} }, [paidOutStaffName]);
  useEffect(() => { try { setPrinterIp(window.localStorage.getItem(POS_PRINTER_IP_KEY) || ""); } catch {} }, []);
  useEffect(() => { try { window.localStorage.setItem(POS_PRINTER_IP_KEY, printerIp); } catch {} }, [printerIp]);

  // Toast auto-dismiss
  useEffect(() => { if (!addedToast) return; const t = setTimeout(() => setAddedToast(null), 1200); return () => clearTimeout(t); }, [addedToast]);

  return {
    // Navigation
    mainTab, setMainTab, checkoutSub, setCheckoutSub, overlay, setOverlay,
    keypadValue, setKeypadValue, keypadNote, setKeypadNote,
    // Products
    products, setProducts, category, setCategory, searchQuery, setSearchQuery, categories,
    // Cart
    cart, customPrices, customNotes, items, totalQty,
    addToCart, removeFromCart, deleteFromCart, addKeypadAmount, clearCart,
    handleSelectProduct, addProductWithSugar, submitSugar, updateItemSugar,
    // Product selection modals
    selectedProduct, setSelectedProduct, showAddonModal, setShowAddonModal,
    selectedVariant, setSelectedVariant, selectedAddons, setSelectedAddons,
    showSugarPicker, setShowSugarPicker, sugarPickerPayload, setSugarPickerPayload,
    // Shift
    shiftLoading, shiftError, currentShift, cashSalesLive, paidOutTotalLive, expectedCashLive,
    refreshShiftState, loadPaidOuts,
    openingCash, setOpeningCash, openingNote, setOpeningNote,
    countedCash, setCountedCash, closingNote, setClosingNote, shiftSubmitting, setShiftSubmitting,
    showOpenShiftModal, setShowOpenShiftModal, showCloseShiftModal, setShowCloseShiftModal,
    showSignOutConfirm, setShowSignOutConfirm,
    setCurrentShift, setCashSalesLive, setPaidOutTotalLive, setExpectedCashLive, setShiftError,
    // Paid Out
    showPaidOutModal, setShowPaidOutModal,
    paidOutSubmitting, setPaidOutSubmitting, paidOutAmount, setPaidOutAmount,
    paidOutStaffName, setPaidOutStaffName, paidOutReason, setPaidOutReason,
    paidOutVendor, setPaidOutVendor, paidOutInvoiceNumber, setPaidOutInvoiceNumber,
    paidOutInvoiceUrl, setPaidOutInvoiceUrl, paidOutNotes, setPaidOutNotes,
    recentPaidOuts, setRecentPaidOuts,
    // Customer
    customerName, setCustomerName, customerPhone, setCustomerPhone,
    customerEmail, setCustomerEmail, consentWhatsapp, setConsentWhatsapp,
    consentEmail, setConsentEmail, linkedCustomerId, setLinkedCustomerId,
    memberLookupLoading, setMemberLookupLoading, memberLookupMessage, setMemberLookupMessage,
    memberLookupTone, setMemberLookupTone, memberPoints, setMemberPoints,
    memberExpiringPoints, setMemberExpiringPoints, redeemPointsInput, setRedeemPointsInput,
    setConsentMode, getConsentMode, resetCustomerState,
    // Payment
    discountType, setDiscountType, discountValue, setDiscountValue,
    paymentMethod, setPaymentMethod, cashReceived, setCashReceived,
    autoPrintEnabled, setAutoPrintEnabled, autoPrintLabel, setAutoPrintLabel,
    printerIp, setPrinterIp,
    receiptData, setReceiptData, showDiscountPanel, setShowDiscountPanel,
    submittingOrder, setSubmittingOrder,
    // Pricing derived
    subtotal, discountAmount, totalAfterDiscount, total, balance, cashNum,
    appliedRedeemPoints, redeemAmount, redeemStatusMessage,
    // Orders
    orders, setOrders, ordersLoading, loadOrders,
    orderDetailOpen, setOrderDetailOpen, orderDetailItems, orderDetailLoading, orderDetailError, loadOrderDetail,
    showQrScanner, setShowQrScanner,
    // Reports
    reportRange, setReportRange, reportData, reportLoading, loadReport,
    // Product management
    showAddProduct, setShowAddProduct, editingProduct, setEditingProduct,
    prodName, setProdName, prodPrice, setProdPrice, prodCost, setProdCost,
    prodStock, setProdStock, prodCategoryId, setProdCategoryId,
    prodImageUrl, setProdImageUrl, prodSaving, setProdSaving,
    prodImageUploading, setProdImageUploading,
    allCategories, setAllCategories, newCatName, setNewCatName,
    variantName, setVariantName, variantPrice, setVariantPrice,
    addonName, setAddonName, addonPrice, setAddonPrice,
    // Toast + Sound
    addedToast, setAddedToast, playBeep,
    // Polling
    lastOrderCount,
  };
}
