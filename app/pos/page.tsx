"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { buildReceiptHtml } from "@/lib/receipt-print";
import {
  ModalShell, ModalTitle, ModalSubtitle, ModalActions,
  ModalBtnPrimary, ModalBtnSecondary, ModalInput, ModalTextArea, InfoCard,
} from "./components/modal-primitives";
import {
  Product, Shift, PaidOutEntry, CartItem, ReceiptData, SugarLevel,
  MarketingConsentMode, MemberLookup, DEFAULT_SUGAR_LEVEL, SUGAR_LEVEL_OPTIONS,
  LOYALTY_REDEEM_RM_PER_POINT, LOYALTY_REDEEM_MIN_POINTS, LOYALTY_REDEEM_MAX_RATIO,
  DISCOUNT_TYPES, PAYMENT_METHODS,
  buildCartKey, isSugarSupportedCategory, sugarLabel,
} from "./types";

const REGISTER_ID = "main";
const POS_AUTO_PRINT_KEY = "pos_auto_print_enabled";
const POS_PAID_OUT_STAFF_NAME_KEY = "pos_paid_out_staff_name";

// ━━━ Navigation types ━━━
type MainTab = "checkout" | "orders" | "reports" | "more";
type CheckoutSubTab = "keypad" | "library" | "favourites";
type Overlay = "none" | "cart" | "payment" | "done" | "customer" | "products";

// ━━━ Orders list type ━━━
type OrderRow = {
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

// ━━━ Reports types ━━━
type ReportRange = "today" | "yesterday" | "7days" | "month";
type DashboardData = {
  orders: Array<{ id: string; total: number; payment_method: string; created_at: string }>;
  topProducts: Array<{ product_name: string; total_qty: number }>;
  yesterdaySales: number;
  bestHour: string | null;
  bestHourSales: number;
  paymentMix: Record<string, number>;
  lowStock: Array<{ id: string; name: string; stock: number }>;
  monthlyPL: { month: string; sales: number; expenses: number; paid_out: number; outflow: number; profit_loss: number };
};

export default function POSPage() {
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
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // ───── Discount UI ─────
  const [showDiscountPanel, setShowDiscountPanel] = useState(false);

  // ───── Orders tab ─────
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // ───── Reports tab ─────
  const [reportRange, setReportRange] = useState<ReportRange>("today");
  const [reportData, setReportData] = useState<DashboardData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // ───── Product management (in POS) ─────
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
  // Variants & Addons for add/edit
  const [variantName, setVariantName] = useState("");
  const [variantPrice, setVariantPrice] = useState("");
  const [addonName, setAddonName] = useState("");
  const [addonPrice, setAddonPrice] = useState("");

  // ━━━ Helpers ━━━
  function setConsentMode(mode: MarketingConsentMode) { setConsentWhatsapp(mode === "both" || mode === "whatsapp"); setConsentEmail(mode === "both" || mode === "email"); }
  function getConsentMode(): MarketingConsentMode { if (consentWhatsapp && consentEmail) return "both"; if (consentWhatsapp) return "whatsapp"; if (consentEmail) return "email"; return "none"; }

  // ━━━ Shift ━━━
  const refreshShiftState = useCallback(async (opts?: { autoPrompt?: boolean }) => {
    const autoPrompt = opts?.autoPrompt ?? true; setShiftLoading(true); setShiftError(null);
    try { const res = await fetch(`/api/pos/shift?register_id=${REGISTER_ID}`, { cache: "no-store" }); const data = await res.json();
      if (!res.ok) { setShiftError(data?.error || "Gagal load shift"); setCurrentShift(null); setCashSalesLive(0); setPaidOutTotalLive(0); setExpectedCashLive(0); setRecentPaidOuts([]); if (autoPrompt) setShowOpenShiftModal(true); return; }
      setCurrentShift(data.shift || null); setCashSalesLive(Number(data.cash_sales || 0)); setPaidOutTotalLive(Number(data.paid_out_total || 0)); setExpectedCashLive(Number(data.expected_cash_live || 0));
      if (autoPrompt) { setShowOpenShiftModal(!data.shift); } else if (data.shift) { setShowOpenShiftModal(false); }
    } catch { setShiftError("Gagal load shift"); setCurrentShift(null); if (autoPrompt) setShowOpenShiftModal(true); } finally { setShiftLoading(false); }
  }, []);
  async function loadPaidOuts() { try { const res = await fetch(`/api/pos/paid-outs?register_id=${REGISTER_ID}`, { cache: "no-store" }); const data = await res.json(); if (!res.ok) return; setRecentPaidOuts(Array.isArray(data.paid_outs) ? data.paid_outs : []); setPaidOutTotalLive(Number(data.paid_out_total || 0)); } catch {} }

  // ━━━ Load orders (today only for speed) ━━━
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

  // ━━━ Load report (with simple cache) ━━━
  const reportCache = useRef<Record<string, DashboardData>>({});
  async function loadReport(range: ReportRange) {
    if (reportCache.current[range]) { setReportData(reportCache.current[range]); return; }
    setReportLoading(true);
    try {
      const res = await fetch(`/api/dashboard?range=${range}`, { cache: "no-store" });
      const data = await res.json();
      reportCache.current[range] = data;
      setReportData(data);
    } catch { setReportData(null); } finally { setReportLoading(false); }
  }

  // ━━━ POS Sound (zero-delay, mobile compatible) ━━━
  const actxRef = useRef<AudioContext | null>(null);
  const beepBufRef = useRef<AudioBuffer | null>(null);
  useEffect(() => {
    function initAudio() {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        actxRef.current = ctx;
        // Pre-create beep buffer in memory — plays instantly, no decode delay
        const sr = ctx.sampleRate; const len = Math.floor(sr * 0.07);
        const buf = ctx.createBuffer(1, len, sr); const ch = buf.getChannelData(0);
        for (let i = 0; i < len; i++) { const t = i / sr; ch[i] = Math.sin(2 * Math.PI * 880 * t) * 0.2 * (1 - t / 0.07); }
        beepBufRef.current = buf;
        if (ctx.state === "suspended") ctx.resume();
      } catch {}
    }
    function unlock() { if (!actxRef.current) initAudio(); else if (actxRef.current.state === "suspended") actxRef.current.resume(); }
    document.addEventListener("touchstart", unlock, { once: true });
    document.addEventListener("click", unlock, { once: true });
    // Also init immediately in case already interacted
    initAudio();
    return () => { document.removeEventListener("touchstart", unlock); document.removeEventListener("click", unlock); };
  }, []);
  function playBeep() {
    try {
      const ctx = actxRef.current; const buf = beepBufRef.current;
      if (!ctx || !buf) return;
      if (ctx.state === "suspended") ctx.resume();
      const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start(0);
    } catch {}
  }

  // ━━━ New order polling (every 15s) ━━━
  const lastOrderCount = useRef(0);
  const notifSound = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    // Create notification sound
    try { notifSound.current = new Audio("data:audio/wav;base64,UklGRiQBAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQABAAAAAAA="); } catch {}
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/orders?limit=1&today=1", { cache: "no-store" });
        const data = await res.json();
        const newCount = data?.orders?.length || 0;
        if (lastOrderCount.current > 0 && newCount > lastOrderCount.current) {
          // New order detected
          setAddedToast("Order baru masuk!");
          playBeep(); playBeep();
          if (mainTab === "orders") void loadOrders();
        }
        lastOrderCount.current = newCount;
      } catch {}
    }, 15000);
    // Init count
    fetch("/api/orders?limit=1&today=1", { cache: "no-store" }).then(r => r.json()).then(d => { lastOrderCount.current = d?.orders?.length || 0; }).catch(() => {});
    return () => clearInterval(interval);
  }, [mainTab]);

  // ━━━ Product management ━━━
  async function loadCategories() { try { const r = await fetch("/api/categories"); const d = await r.json(); setAllCategories(Array.isArray(d) ? d : []); } catch {} }
  function openAddProduct() { setProdName(""); setProdPrice(""); setProdCost(""); setProdStock("100"); setProdCategoryId(""); setProdImageUrl(""); setEditingProduct(null); setNewCatName(""); setVariantName(""); setVariantPrice(""); setAddonName(""); setAddonPrice(""); setShowAddProduct(true); void loadCategories(); }
  function openEditProduct(p: Product) {
    setProdName(p.name); setProdPrice(String(p.price)); setProdCost(""); setProdStock(String(p.stock)); setProdImageUrl("");
    setVariantName(""); setVariantPrice(""); setAddonName(""); setAddonPrice(""); setNewCatName("");
    setEditingProduct(p); setShowAddProduct(true); void loadCategories();
  }
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setProdImageUploading(true);
    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch("/api/products/upload-image", { method: "POST", body: form });
      const data = await res.json();
      if (data.file_url) setProdImageUrl(data.file_url); else alert(data.error || "Upload gagal");
    } catch { alert("Upload error"); } finally { setProdImageUploading(false); }
  }
  async function saveProduct() {
    if (!prodName.trim() || !prodPrice) { alert("Nama dan harga diperlukan"); return; }
    let categoryId = prodCategoryId;
    if (categoryId === "__new__" && newCatName.trim()) {
      try {
        await fetch("/api/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newCatName.trim() }) });
        const cats = await (await fetch("/api/categories")).json();
        setAllCategories(Array.isArray(cats) ? cats : []);
        const created = (Array.isArray(cats) ? cats : []).find((c: { name: string }) => c.name === newCatName.trim());
        categoryId = created?.id || "";
      } catch {}
    }
    if (!categoryId || categoryId === "__new__") { alert("Pilih kategori"); return; }
    setProdSaving(true);
    try {
      if (editingProduct) {
        const body: Record<string, unknown> = { name: prodName.trim(), price: Number(prodPrice), stock: Number(prodStock || 0), category_id: categoryId };
        if (prodImageUrl) body.image_url = prodImageUrl;
        const res = await fetch(`/api/products/${editingProduct.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) { alert("Gagal update"); return; }
        setShowAddProduct(false);
        const r = await fetch("/api/products"); const d = await r.json(); setProducts(Array.isArray(d) ? d : []);
      } else {
        const body: Record<string, unknown> = { name: prodName.trim(), price: Number(prodPrice), cost: Number(prodCost || 0), stock: Number(prodStock || 100), category_id: categoryId };
        if (prodImageUrl) body.image_url = prodImageUrl;
        const res = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || "Gagal tambah"); return; }
        const created = await res.json().catch(() => null);
        // Refresh products list
        const r = await fetch("/api/products"); const d = await r.json(); setProducts(Array.isArray(d) ? d : []);
        // Auto-switch to edit mode so user can add variants/addons
        if (created?.product?.id) {
          const newProd = (Array.isArray(d) ? d : []).find((p: Product) => p.id === created.product.id);
          if (newProd) { setEditingProduct(newProd); setAddedToast("Produk ditambah — tambah variant/addon di bawah"); return; }
        }
        setShowAddProduct(false);
      }
    } catch { alert("Ralat"); } finally { setProdSaving(false); }
  }
  async function addVariantToProduct(productId: string) {
    if (!variantName.trim()) return;
    await fetch("/api/products/add-variant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: productId, name: variantName.trim(), price_adjustment: Number(variantPrice || 0) }) });
    setVariantName(""); setVariantPrice("");
    const r = await fetch("/api/products"); const d = await r.json(); setProducts(Array.isArray(d) ? d : []);
    const updated = (Array.isArray(d) ? d : []).find((p: Product) => p.id === productId);
    if (updated) setEditingProduct(updated);
  }
  async function addAddonToProduct(productId: string) {
    if (!addonName.trim()) return;
    await fetch("/api/products/add-addon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: productId, name: addonName.trim(), price: Number(addonPrice || 0) }) });
    setAddonName(""); setAddonPrice("");
    const r = await fetch("/api/products"); const d = await r.json(); setProducts(Array.isArray(d) ? d : []);
    const updated = (Array.isArray(d) ? d : []).find((p: Product) => p.id === productId);
    if (updated) setEditingProduct(updated);
  }
  async function toggleProductActive(p: Product) {
    const newStock = Number(p.stock) > 0 ? 0 : 100;
    try { await fetch(`/api/products/${p.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stock: newStock }) });
      const r = await fetch("/api/products"); const d = await r.json(); setProducts(Array.isArray(d) ? d : []);
    } catch {}
  }

  // ━━━ Effects ━━━
  useEffect(() => { fetch("/api/products").then(r => r.json()).then(d => setProducts(Array.isArray(d) ? d : [])).catch(() => setProducts([])); void refreshShiftState(); }, [refreshShiftState]);
  useEffect(() => { if (!currentShift) { setRecentPaidOuts([]); return; } void loadPaidOuts(); }, [currentShift]);
  useEffect(() => { if (!addedToast) return; const t = setTimeout(() => setAddedToast(null), 1200); return () => clearTimeout(t); }, [addedToast]);
  useEffect(() => { try { setAutoPrintEnabled(window.localStorage.getItem(POS_AUTO_PRINT_KEY) === "1"); } catch {} }, []);
  useEffect(() => { try { window.localStorage.setItem(POS_AUTO_PRINT_KEY, autoPrintEnabled ? "1" : "0"); } catch {} }, [autoPrintEnabled]);
  useEffect(() => { try { setPaidOutStaffName(window.localStorage.getItem(POS_PAID_OUT_STAFF_NAME_KEY) || ""); } catch {} }, []);
  useEffect(() => { try { window.localStorage.setItem(POS_PAID_OUT_STAFF_NAME_KEY, paidOutStaffName); } catch {} }, [paidOutStaffName]);
  useEffect(() => { if (mainTab === "orders") void loadOrders(); }, [mainTab]);
  useEffect(() => { if (mainTab === "reports") void loadReport(reportRange); }, [mainTab, reportRange]);

  // ━━━ Cart actions ━━━
  function addToCart(productId: string, variantId?: string, addonIds?: string[], sugarLevel?: SugarLevel | null, feedbackLabel?: string, silent = false) {
    const key = buildCartKey(productId, variantId, addonIds, sugarLevel); setCart(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
    if (!silent) { const p = products.find(p => p.id === productId); setAddedToast(feedbackLabel || p?.name || "Ditambah"); playBeep(); }
  }
  function removeFromCart(key: string) { setCart(prev => { const u = { ...prev }; if (!u[key]) return u; u[key] -= 1; if (u[key] <= 0) delete u[key]; return u; }); }
  function deleteFromCart(key: string) { setCart(prev => { const u = { ...prev }; delete u[key]; return u; }); setCustomPrices(prev => { const u = { ...prev }; delete u[key]; return u; }); setCustomNotes(prev => { const u = { ...prev }; delete u[key]; return u; }); }
  function addProductWithSugar(opts: { product: Product; variantId?: string; addonIds?: string[]; feedbackLabel?: string }) {
    if (!isSugarSupportedCategory(opts.product.category)) { addToCart(opts.product.id, opts.variantId, opts.addonIds, null, opts.feedbackLabel); return; }
    setSugarPickerPayload({ product_id: opts.product.id, product_name: opts.product.name, variant_id: opts.variantId, addon_ids: opts.addonIds, feedback_label: opts.feedbackLabel }); setShowSugarPicker(true);
  }
  function submitSugar(level: SugarLevel) { if (!sugarPickerPayload) return; addToCart(sugarPickerPayload.product_id, sugarPickerPayload.variant_id, sugarPickerPayload.addon_ids, level, sugarPickerPayload.feedback_label); setShowSugarPicker(false); setSugarPickerPayload(null); }
  function updateItemSugar(item: CartItem, next: SugarLevel) { const nk = buildCartKey(item.product_id, item.variant_id || undefined, item.addon_ids, next); if (nk === item.id) return; setCart(prev => { const q = prev[item.id] || 0; if (!q) return prev; const n = { ...prev }; delete n[item.id]; n[nk] = (n[nk] || 0) + q; return n; }); }
  function handleSelectProduct(product: Product) {
    if (!currentShift) { setShowOpenShiftModal(true); return; } if (Number(product.stock || 0) <= 0) return;
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
    setKeypadValue("0");
    setKeypadNote("");
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
  const discountNum = Number(discountValue) || 0; const cashNum = Number(cashReceived) || 0;
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
  if (linkedCustomerId) { if (redeemEligibleMaxPoints < LOYALTY_REDEEM_MIN_POINTS) redeemStatusMessage = `Subtotal terlalu rendah (cap 30%: ${redeemEligibleMaxPoints} pts).`; else if (requestedRedeem > 0 && requestedRedeem < LOYALTY_REDEEM_MIN_POINTS) redeemStatusMessage = `Minimum: ${LOYALTY_REDEEM_MIN_POINTS} points.`; else if (requestedRedeem > redeemEligibleMaxPoints) redeemStatusMessage = `Max: ${redeemEligibleMaxPoints} pts (30% cap).`; }
  const redeemAmount = appliedRedeemPoints * LOYALTY_REDEEM_RM_PER_POINT;
  const total = Math.max(totalAfterDiscount - redeemAmount, 0);
  const balance = paymentMethod === "cash" ? cashNum - total : 0;
  const categories = ["All", ...Array.from(new Set(products.map(p => p.category).filter((v): v is string => Boolean(v))))];
  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  // ━━━ Shift/Payment actions ━━━
  async function openShift() { const val = Number(openingCash || 0); if (!Number.isFinite(val) || val < 0) { alert("Opening cash tak valid"); return; } setShiftSubmitting(true); setShiftError(null); try { const res = await fetch("/api/pos/shift", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open", register_id: REGISTER_ID, opening_cash: val, opening_note: openingNote }) }); const data = await res.json(); if (!res.ok) { setShiftError(data?.error || "Gagal buka shift"); return; } setCurrentShift(data.shift || null); setCashSalesLive(Number(data.cash_sales || 0)); setPaidOutTotalLive(Number(data.paid_out_total || 0)); setExpectedCashLive(Number(data.expected_cash_live || 0)); setOpeningCash(""); setOpeningNote(""); setRecentPaidOuts([]); setShowOpenShiftModal(false); } finally { setShiftSubmitting(false); } }
  async function closeShift() { if (items.length > 0) { alert("Kosongkan cart dulu."); return; } const val = Number(countedCash || 0); if (!Number.isFinite(val) || val < 0) { alert("Counted cash tak valid"); return; } setShiftSubmitting(true); setShiftError(null); try { const res = await fetch("/api/pos/shift", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "close", register_id: REGISTER_ID, counted_cash: val, closing_note: closingNote }) }); const data = await res.json(); if (!res.ok) { setShiftError(data?.error || "Gagal tutup shift"); return; } setCurrentShift(null); setCashSalesLive(0); setPaidOutTotalLive(0); setExpectedCashLive(0); setRecentPaidOuts([]); setCountedCash(""); setClosingNote(""); setShowCloseShiftModal(false); setShowOpenShiftModal(true); } finally { setShiftSubmitting(false); } }
  async function submitPaidOut() { if (!currentShift) { alert("Buka shift dulu"); return; } const amount = Number(paidOutAmount || 0); if (!Number.isFinite(amount) || amount <= 0) { alert("Amaun tak valid"); return; } if (!paidOutReason.trim()) { alert("Sebab diperlukan"); return; } if (!paidOutStaffName.trim()) { alert("Nama staf diperlukan"); return; } setPaidOutSubmitting(true); try { const res = await fetch("/api/pos/paid-outs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ register_id: REGISTER_ID, amount, staff_name: paidOutStaffName.trim(), reason: paidOutReason, vendor_name: paidOutVendor, invoice_number: paidOutInvoiceNumber, invoice_url: paidOutInvoiceUrl, notes: paidOutNotes }) }); const data = await res.json(); if (!res.ok) { alert(data?.error || "Gagal simpan"); return; } setPaidOutAmount(""); setPaidOutReason(""); setPaidOutVendor(""); setPaidOutInvoiceNumber(""); setPaidOutInvoiceUrl(""); setPaidOutNotes(""); setShowPaidOutModal(false); setCashSalesLive(Number(data.cash_sales || cashSalesLive)); setPaidOutTotalLive(Number(data.paid_out_total || paidOutTotalLive)); setExpectedCashLive(Number(data.expected_cash_live || expectedCashLive)); await loadPaidOuts(); } finally { setPaidOutSubmitting(false); } }
  async function lookupMember() { const phone = customerPhone.trim(); if (!phone) { setMemberLookupTone("warn"); setMemberLookupMessage("Masukkan nombor dulu"); return; } setMemberLookupLoading(true); setMemberLookupMessage(null); try { const res = await fetch(`/api/pos/customers/lookup?phone=${encodeURIComponent(phone)}`, { cache: "no-store" }); const data = await res.json(); if (!res.ok) { setMemberLookupTone("warn"); setMemberLookupMessage(data?.error || "Gagal cari"); return; } const c = data?.customer as MemberLookup | null; if (!c) { setLinkedCustomerId(null); setMemberPoints(0); setMemberExpiringPoints(0); setMemberLookupTone("warn"); setMemberLookupMessage("Tiada ahli dijumpai."); return; } setLinkedCustomerId(c.id); setCustomerName(c.name || customerName); setCustomerPhone(c.phone || phone); setCustomerEmail(c.email || ""); setConsentWhatsapp(Boolean(c.consent_whatsapp)); setConsentEmail(Boolean(c.consent_email)); setMemberPoints(Number(c.loyalty_points || 0)); setMemberExpiringPoints(Number(c.expiring_points_30d || 0)); setMemberLookupTone("success"); setMemberLookupMessage(`Ahli: ${c.total_orders} order · RM${c.total_spend.toFixed(2)} · ${Number(c.loyalty_points || 0)} pts`); } finally { setMemberLookupLoading(false); } }
  async function completePayment(overrideMethod?: "cash" | "qr" | "card", overrideCash?: number) {
    const method = overrideMethod || paymentMethod;
    const cashVal = overrideCash ?? cashNum;
    if (!currentShift) { alert("Buka shift dulu"); return; } const finalName = customerName.trim() || "Walk-in";
    if (consentWhatsapp && !customerPhone.trim()) { alert("Telefon diperlukan"); return; } if (consentEmail && !customerEmail.trim()) { alert("Email diperlukan"); return; }
    if (method === "cash" && (!cashVal || cashVal < total)) { alert("Duit tak cukup"); return; }
    let pw: Window | null = null; if (autoPrintEnabled) { pw = window.open("", "_blank", "noopener,noreferrer,width=420,height=720"); if (!pw) { alert("Popup blocked."); return; } }
    try { const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, register_id: REGISTER_ID, customer_name: finalName, customer: { id: linkedCustomerId || undefined, name: finalName, phone: customerPhone, email: customerEmail, consent_whatsapp: consentWhatsapp, consent_email: consentEmail }, loyalty_redeem_points: appliedRedeemPoints, subtotal, discount_type: discountType, discount_value: discountAmount, total, payment_method: method, cash_received: method === "cash" ? cashVal : total, balance: method === "cash" ? cashVal - total : 0 }) }); const data = await res.json();
      if (!data.success) { pw?.close(); alert(data?.error || "Gagal"); return; }
      const receipt: ReceiptData = { order_id: String(data.order_id || ""), receipt_number: data.receipt_number, customerName: finalName, items, subtotal, discount: discountAmount + redeemAmount, total, payment_method: paymentMethod, created_at: new Date().toISOString() };
      setReceiptData(receipt); if (autoPrintEnabled) printReceipt(receipt, pw);
      setCart({}); setCustomPrices({}); setCustomNotes({}); setCustomerName(""); setCustomerPhone(""); setCustomerEmail(""); setConsentWhatsapp(false); setConsentEmail(false); setLinkedCustomerId(null); setMemberPoints(0); setMemberExpiringPoints(0); setRedeemPointsInput(""); setMemberLookupMessage(null); setDiscountType("none"); setDiscountValue(""); setCashReceived(""); setShowDiscountPanel(false);
      setOverlay("done"); void refreshShiftState({ autoPrompt: false });
    } catch { pw?.close(); alert("Ralat pelayan"); }
  }
  function printReceipt(data: ReceiptData, ew?: Window | null) {
    if (data.order_id) { const url = `/api/orders/receipt/${encodeURIComponent(data.order_id)}`; if (ew && !ew.closed) { ew.location.replace(url); return; } window.open(url, "_blank", "width=420,height=720"); return; }
    const html = buildReceiptHtml({ receiptNumber: data.receipt_number, createdAt: data.created_at, customerName: data.customerName, paymentMethod: data.payment_method, subtotal: data.subtotal, discount: data.discount, total: data.total, items: data.items.map(i => ({ name: i.name + (i.supports_sugar ? ` · ${sugarLabel(i.sugar_level)}` : ""), qty: i.qty, unitPrice: i.price, lineTotal: i.price * i.qty })), autoPrint: true });
    const w = ew && !ew.closed ? ew : window.open("", "_blank", "width=420,height=720"); if (!w) return; w.document.open(); w.document.write(html); w.document.close();
  }

  // ━━━ Filtered products for Library ━━━
  const filteredProducts = products.filter(p => {
    const matchCat = category === "All" || p.category === category;
    const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  // ━━━ Order status helpers ━━━
  function statusColor(status: string) {
    switch (status?.toLowerCase()) {
      case "completed": return "bg-green-100 text-green-800";
      case "preparing": return "bg-amber-100 text-amber-800";
      case "ready": return "bg-blue-100 text-blue-800";
      case "pending": return "bg-gray-100 text-gray-800";
      case "cancelled": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-600";
    }
  }
  function paymentLabel(method: string) {
    switch (method) { case "cash": return "Cash"; case "qr": return "QR"; case "card": return "Card"; case "fpx": return "FPX"; default: return method; }
  }
  function sourceTag(source: string | null) {
    if (source === "customer_web") return { label: "Web", color: "bg-purple-100 text-purple-700" };
    if (source === "pos") return { label: "POS", color: "bg-blue-100 text-blue-700" };
    return { label: "POS", color: "bg-gray-100 text-gray-600" };
  }
  async function updateOrderStatus(orderId: string, newStatus: string) {
    try {
      await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      void loadOrders();
    } catch {}
  }

  // ━━━━━━━━━━━━━━━━━━━━ RENDER ━━━━━━━━━━━━━━━━━━━━

  return (
    <div className="pos-surface flex min-h-[100dvh] flex-col bg-white text-gray-900">

      {/* ━━━ MAIN TAB: CHECKOUT ━━━ */}
      {mainTab === "checkout" && overlay === "none" && (
        <>
          {/* FIX #1: Bigger, bolder sub-tabs with theme red accent */}
          <div className="border-b-2 border-gray-200 bg-white">
            <div className="flex">
              {(["keypad", "library", "favourites"] as CheckoutSubTab[]).map(t => (
                <button key={t} onClick={() => setCheckoutSub(t)} className={`flex-1 py-4 text-base font-semibold capitalize transition-all ${checkoutSub === t ? "border-b-[3px] border-[#7F1D1D] text-[#7F1D1D] bg-red-50/40" : "text-gray-400 hover:text-gray-600"}`}>
                  {t === "keypad" ? "Keypad" : t === "library" ? "Library" : "Favourites"}
                </button>
              ))}
            </div>
          </div>

          {/* Sub-tab content */}
          <div className="flex-1 overflow-y-auto pb-36">

            {/* FIX #2: KEYPAD with notes field */}
            {checkoutSub === "keypad" && (
              <div className="flex flex-col items-center px-6 pt-8">
                <div className="mb-6 text-4xl font-bold tabular-nums text-gray-900">RM{keypadValue === "0" ? "0.00" : keypadValue}</div>
                <div className="grid w-full max-w-xs grid-cols-3 gap-3">
                  {["1","2","3","4","5","6","7","8","9",".","0","⌫"].map(k => (
                    <button key={k} onClick={() => {
                      if (k === "⌫") setKeypadValue(prev => prev.length <= 1 ? "0" : prev.slice(0, -1));
                      else if (k === ".") { if (!keypadValue.includes(".")) setKeypadValue(prev => prev + "."); }
                      else setKeypadValue(prev => prev === "0" ? k : prev + k);
                    }} className="flex h-14 items-center justify-center rounded-lg bg-gray-100 text-lg font-medium text-gray-900 active:bg-gray-200">
                      {k}
                    </button>
                  ))}
                </div>
                {/* Notes field for custom amount */}
                <div className="mt-4 w-full max-w-xs">
                  <input
                    value={keypadNote}
                    onChange={e => setKeypadNote(e.target.value)}
                    placeholder="Nota item (cth: Nasi Lemak Special)"
                    className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20"
                  />
                </div>
                <button onClick={() => { if (!currentShift) { setShowOpenShiftModal(true); return; } addKeypadAmount(); }} className="mt-4 w-full max-w-xs rounded-full bg-[#7F1D1D] py-3.5 text-sm font-semibold text-white active:bg-[#6B1818]">
                  Charge RM{keypadValue === "0" ? "0.00" : parseFloat(keypadValue).toFixed(2)}
                </button>
              </div>
            )}

            {/* FIX #3: LIBRARY with stronger borders and visible rows */}
            {checkoutSub === "library" && (
              <div>
                {/* Search bar */}
                <div className="border-b border-gray-200 px-4 py-3">
                  <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2.5">
                    <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Cari produk..." className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400" />
                  </div>
                </div>
                {/* Category rows */}
                <div className="border-b border-gray-200">
                  {categories.filter(c => c !== "All").map(cat => (
                    <button key={cat} onClick={() => { setCategory(cat); setCheckoutSub("favourites"); }} className="flex w-full items-center justify-between border-b border-gray-200 bg-white px-4 py-4 text-left hover:bg-gray-50 transition-colors">
                      <span className="text-sm font-semibold text-gray-900">{cat}</span>
                      <span className="text-gray-400 text-lg">›</span>
                    </button>
                  ))}
                </div>
                {/* All items list — increased opacity & border */}
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

            {/* FAVOURITES — product grid */}
            {checkoutSub === "favourites" && (
              <div>
                {/* Category pills */}
                <div className="scrollbar-hide flex gap-2 overflow-x-auto border-b border-gray-200 px-4 py-2.5">
                  {categories.map(cat => (
                    <button key={cat} onClick={() => setCategory(cat)} className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${category === cat ? "bg-[#7F1D1D] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{cat}</button>
                  ))}
                </div>
                {/* Grid */}
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

          {/* "Review sale" button — themed red */}
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
      )}

      {/* ━━━ MAIN TAB: ORDERS ━━━ */}
      {mainTab === "orders" && overlay === "none" && (
        <div className="flex-1 overflow-y-auto pb-20">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4">
            <h1 className="text-xl font-bold text-gray-900">Orders</h1>
            <button onClick={() => void loadOrders()} className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 active:bg-gray-200">
              ↻ Refresh
            </button>
          </div>
          {ordersLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-sm text-gray-400">Memuatkan...</div>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="text-sm font-medium text-gray-300 mb-1">—</div>
              <div className="text-sm text-gray-400">Tiada order dijumpai</div>
            </div>
          ) : (
            <div>
              {orders.map(order => {
                const src = sourceTag(order.order_source);
                const st = order.status?.toLowerCase() || "pending";
                return (
                <div key={order.id} className="border-b border-gray-200 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">#{order.receipt_number}</span>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor(order.status)}`}>{order.status}</span>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${src.color}`}>{src.label}</span>
                        {order.payment_status === "pending" && <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-600">Belum Bayar</span>}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-400">
                        {order.customer_name || "Walk-in"} · {paymentLabel(order.payment_method)} · {new Date(order.created_at).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-gray-900 shrink-0">RM{Number(order.total).toFixed(2)}</span>
                  </div>
                  {/* Action buttons */}
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {st === "pending" && (
                      <button onClick={() => void updateOrderStatus(order.id, "preparing")} className="rounded-md bg-amber-500 px-3 py-1.5 text-[11px] font-medium text-white active:bg-amber-600">Preparing</button>
                    )}
                    {st === "preparing" && (
                      <button onClick={() => void updateOrderStatus(order.id, "ready")} className="rounded-md bg-blue-500 px-3 py-1.5 text-[11px] font-medium text-white active:bg-blue-600">Ready</button>
                    )}
                    {st === "ready" && (
                      <button onClick={() => void updateOrderStatus(order.id, "completed")} className="rounded-md bg-green-600 px-3 py-1.5 text-[11px] font-medium text-white active:bg-green-700">Completed</button>
                    )}
                    <button onClick={() => { window.open(`/api/orders/receipt/${order.id}`, "_blank", "width=420,height=720"); }} className="rounded-md border border-gray-200 px-3 py-1.5 text-[11px] font-medium text-gray-500 active:bg-gray-100">
                      Print
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ━━━ MAIN TAB: REPORTS (Square-style sales report) ━━━ */}
      {mainTab === "reports" && overlay === "none" && (
        <div className="flex-1 overflow-y-auto pb-20">
          <div className="border-b border-gray-200 px-4 py-4">
            <h1 className="text-xl font-bold text-gray-900">Sales Report</h1>
            <div className="mt-3 flex gap-2">
              {([["today", "1D"], ["yesterday", "Yesterday"], ["7days", "1W"], ["month", "1M"]] as [ReportRange, string][]).map(([val, label]) => (
                <button key={val} onClick={() => setReportRange(val)} className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${reportRange === val ? "bg-[#7F1D1D] text-white" : "bg-gray-100 text-gray-600"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {reportLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-sm text-gray-400">Memuatkan...</div>
            </div>
          ) : reportData ? (() => {
            const gross = reportData.orders.reduce((s, o) => s + Number(o.total || 0), 0);
            const orderCount = reportData.orders.length;
            const avg = orderCount > 0 ? gross / orderCount : 0;
            const pl = reportData.monthlyPL;
            return (
              <div className="px-4 py-4 space-y-6">
                {/* Sales Summary */}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Sales Summary</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-2xl font-bold text-gray-900">RM{gross.toFixed(2)}</div>
                      <div className="text-xs text-gray-400">Gross Sales</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">RM{gross.toFixed(2)}</div>
                      <div className="text-xs text-gray-400">Net Sales</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{orderCount}</div>
                      <div className="text-xs text-gray-400">Sales</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">RM{avg.toFixed(2)}</div>
                      <div className="text-xs text-gray-400">Average Sale</div>
                    </div>
                  </div>
                </div>

                {/* Payment Mix */}
                {Object.keys(reportData.paymentMix).length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Payment Breakdown</div>
                    <div className="space-y-2">
                      {Object.entries(reportData.paymentMix).map(([method, amount]) => (
                        <div key={method} className="flex items-center justify-between">
                          <span className="text-sm text-gray-700 capitalize">{method}</span>
                          <span className="text-sm font-semibold tabular-nums text-gray-900">RM{amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Products */}
                {reportData.topProducts.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Top Products</div>
                    <div className="space-y-2">
                      {reportData.topProducts.map((p, i) => (
                        <div key={p.product_name} className="flex items-center justify-between">
                          <span className="text-sm text-gray-700">{i + 1}. {p.product_name}</span>
                          <span className="text-sm font-semibold tabular-nums text-gray-500">{p.total_qty} sold</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Best Hour */}
                {reportData.bestHour && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Peak Hour</div>
                    <div className="text-sm text-gray-700">{reportData.bestHour}:00 — RM{reportData.bestHourSales.toFixed(2)}</div>
                  </div>
                )}

                {/* Monthly P/L */}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Monthly P&L ({pl.month})</div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm"><span className="text-gray-600">Sales</span><span className="font-semibold text-gray-900">RM{pl.sales.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-600">Expenses</span><span className="font-semibold text-red-600">-RM{pl.expenses.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-600">Paid Out</span><span className="font-semibold text-red-600">-RM{pl.paid_out.toFixed(2)}</span></div>
                    <div className="border-t border-gray-200 pt-1.5 flex justify-between text-sm"><span className="font-semibold text-gray-900">Profit/Loss</span><span className={`font-bold ${pl.profit_loss >= 0 ? "text-green-700" : "text-red-700"}`}>RM{pl.profit_loss.toFixed(2)}</span></div>
                  </div>
                </div>

                {/* Low Stock */}
                {reportData.lowStock.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Low Stock Alert</div>
                    <div className="space-y-1.5">
                      {reportData.lowStock.map(p => (
                        <div key={p.id} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">{p.name}</span>
                          <span className="font-semibold text-amber-600">{p.stock} left</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Yesterday comparison */}
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">vs Yesterday</div>
                  <div className="text-sm font-semibold text-gray-700">RM{reportData.yesterdaySales.toFixed(2)}</div>
                </div>
              </div>
            );
          })() : (
            <div className="flex items-center justify-center py-20">
              <div className="text-sm text-gray-400">Gagal load report</div>
            </div>
          )}
        </div>
      )}

      {/* ━━━ MAIN TAB: MORE (simplified) ━━━ */}
      {mainTab === "more" && overlay === "none" && (
        <div className="flex-1 overflow-y-auto pb-20">
          <div className="px-4 pb-2 pt-6">
            <h1 className="text-2xl font-bold text-gray-900">More</h1>
            <p className="text-sm text-gray-500">Loka POS v2.1</p>
          </div>
          {/* Shift status */}
          <div className="mx-4 my-3 rounded-xl bg-[#7F1D1D]/5 border border-[#7F1D1D]/10 px-4 py-3">
            <div className="text-xs text-gray-500">Shift</div>
            <div className="text-sm font-medium">{currentShift ? `Aktif · RM${expectedCashLive.toFixed(2)} tunai` : "Tutup"}</div>
          </div>
          {/* Menu rows */}
          <button onClick={() => setOverlay("products")} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left text-sm font-medium text-gray-900">Products / Items <span className="text-gray-400">›</span></button>
          {currentShift ? (
            <>
              <button onClick={() => setShowPaidOutModal(true)} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left text-sm font-medium text-gray-900">Paid Out <span className="text-gray-400">›</span></button>
              <button onClick={() => { setCountedCash(expectedCashLive.toFixed(2)); setShowCloseShiftModal(true); }} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left text-sm font-medium text-gray-900">Tutup Shift <span className="text-gray-400">›</span></button>
            </>
          ) : (
            <button onClick={() => setShowOpenShiftModal(true)} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left text-sm font-medium text-gray-900">Buka Shift <span className="text-gray-400">›</span></button>
          )}
          <a href="/dashboard" className="flex items-center justify-between border-b border-gray-200 px-4 py-4 text-sm font-medium text-gray-400">Admin Panel <span>›</span></a>
          <button onClick={() => setShowSignOutConfirm(true)} className="px-4 py-4 text-left text-sm font-medium text-[#7F1D1D]">Sign out</button>
        </div>
      )}

      {/* ━━━ OVERLAY: PRODUCTS MANAGEMENT (full) ━━━ */}
      {overlay === "products" && (
        <div className="screen-enter fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <button onClick={() => { setOverlay("none"); setShowAddProduct(false); }} className="text-sm text-gray-500">← Kembali</button>
            <span className="text-sm font-semibold text-gray-900">Products</span>
            <button onClick={openAddProduct} className="text-sm font-medium text-[#7F1D1D]">+ Tambah</button>
          </div>

          {/* Add/Edit form */}
          {showAddProduct && (
            <div className="border-b border-gray-200 px-4 py-4 space-y-3 bg-gray-50/50 max-h-[70vh] overflow-y-auto">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{editingProduct ? "Edit Product" : "Produk Baru"}</div>
              <input value={prodName} onChange={e => setProdName(e.target.value)} placeholder="Nama produk" className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D]" />
              <div className="flex gap-2">
                <input type="number" value={prodPrice} onChange={e => setProdPrice(e.target.value)} placeholder="Selling Price (RM)" className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D]" />
                <input type="number" value={prodCost} onChange={e => setProdCost(e.target.value)} placeholder="Cost Price" className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D]" />
              </div>
              <div className="flex gap-2">
                <input type="number" value={prodStock} onChange={e => setProdStock(e.target.value)} placeholder="Stock" className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D]" />
              </div>
              {/* Category dropdown */}
              <select value={prodCategoryId} onChange={e => setProdCategoryId(e.target.value)} className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D] bg-white">
                <option value="">— Pilih kategori —</option>
                {allCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
                <option value="__new__">+ Kategori baru...</option>
              </select>
              {prodCategoryId === "__new__" && (
                <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Nama kategori baru" className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D]" />
              )}
              {/* Image upload */}
              <div>
                <div className="text-xs text-gray-400 mb-1">Product Image (optional)</div>
                <div className="flex items-center gap-3">
                  {prodImageUrl && <img src={prodImageUrl} alt="" className="h-12 w-12 rounded-lg object-cover border border-gray-200" />}
                  <label className="cursor-pointer rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
                    {prodImageUploading ? "Uploading..." : "Choose Image"}
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={prodImageUploading} />
                  </label>
                </div>
              </div>
              {/* Variants (edit only) */}
              {editingProduct && (
                <div>
                  <div className="text-xs text-gray-400 mb-1">Variants</div>
                  {editingProduct.variants && editingProduct.variants.length > 0 && (
                    <div className="mb-2 space-y-1">{editingProduct.variants.map(v => (
                      <div key={v.id} className="flex justify-between text-xs bg-white rounded-md border border-gray-100 px-3 py-1.5">
                        <span className="text-gray-700">{v.name}</span>
                        <span className="text-gray-400">+RM{v.price_adjustment.toFixed(2)}</span>
                      </div>
                    ))}</div>
                  )}
                  <div className="flex gap-2">
                    <input value={variantName} onChange={e => setVariantName(e.target.value)} placeholder="Variant name" className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#7F1D1D]" />
                    <input type="number" value={variantPrice} onChange={e => setVariantPrice(e.target.value)} placeholder="+RM" className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#7F1D1D]" />
                    <button onClick={() => void addVariantToProduct(editingProduct.id)} className="shrink-0 rounded-lg bg-[#7F1D1D] px-3 py-2 text-xs font-medium text-white">Add</button>
                  </div>
                </div>
              )}
              {/* Addons (edit only) */}
              {editingProduct && (
                <div>
                  <div className="text-xs text-gray-400 mb-1">Addons</div>
                  {editingProduct.addons && editingProduct.addons.length > 0 && (
                    <div className="mb-2 space-y-1">{editingProduct.addons.map(a => (
                      <div key={a.id} className="flex justify-between text-xs bg-white rounded-md border border-gray-100 px-3 py-1.5">
                        <span className="text-gray-700">{a.name}</span>
                        <span className="text-gray-400">+RM{a.price.toFixed(2)}</span>
                      </div>
                    ))}</div>
                  )}
                  <div className="flex gap-2">
                    <input value={addonName} onChange={e => setAddonName(e.target.value)} placeholder="Addon name" className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#7F1D1D]" />
                    <input type="number" value={addonPrice} onChange={e => setAddonPrice(e.target.value)} placeholder="+RM" className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#7F1D1D]" />
                    <button onClick={() => void addAddonToProduct(editingProduct.id)} className="shrink-0 rounded-lg bg-[#7F1D1D] px-3 py-2 text-xs font-medium text-white">Add</button>
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowAddProduct(false)} className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600">Batal</button>
                <button onClick={() => void saveProduct()} disabled={prodSaving} className="flex-1 rounded-lg bg-[#7F1D1D] py-2.5 text-sm font-semibold text-white disabled:opacity-50">{prodSaving ? "Saving..." : "Simpan"}</button>
              </div>
            </div>
          )}

          {/* Product list */}
          <div className="flex-1 overflow-y-auto">
            {products.length === 0 ? (
              <div className="flex items-center justify-center py-20 text-sm text-gray-400">Tiada produk</div>
            ) : (
              products.map(p => (
                <div key={p.id} className={`flex items-center justify-between border-b border-gray-200 px-4 py-3.5 ${Number(p.stock) <= 0 ? "opacity-40" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900">{p.name}</div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      {p.category || "—"} · Stock: {p.stock}
                      {p.variants && p.variants.length > 0 && ` · ${p.variants.length} variants`}
                      {p.addons && p.addons.length > 0 && ` · ${p.addons.length} addons`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold tabular-nums text-gray-700">RM{Number(p.price).toFixed(2)}</span>
                    <button onClick={() => openEditProduct(p)} className="rounded-md border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-500 active:bg-gray-100">Edit</button>
                    <button onClick={() => void toggleProductActive(p)} className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${Number(p.stock) > 0 ? "border border-gray-200 text-gray-500" : "bg-[#7F1D1D] text-white"}`}>
                      {Number(p.stock) > 0 ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ━━━ FIX #6: BOTTOM NAV BAR — 3 tabs with Orders ━━━ */}
      {overlay === "none" && (
        <div className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom,0px)]">
          <button onClick={() => setMainTab("checkout")} className={`flex flex-1 flex-col items-center gap-0.5 py-3 text-xs font-medium ${mainTab === "checkout" ? "text-[#7F1D1D]" : "text-gray-400"}`}>
            Checkout
          </button>
          <button onClick={() => setMainTab("orders")} className={`flex flex-1 flex-col items-center gap-0.5 py-3 text-xs font-medium ${mainTab === "orders" ? "text-[#7F1D1D]" : "text-gray-400"}`}>
            Orders
          </button>
          <button onClick={() => setMainTab("reports")} className={`flex flex-1 flex-col items-center gap-0.5 py-3 text-xs font-medium ${mainTab === "reports" ? "text-[#7F1D1D]" : "text-gray-400"}`}>
            Reports
          </button>
          <button onClick={() => setMainTab("more")} className={`flex flex-1 flex-col items-center gap-0.5 py-3 text-xs font-medium ${mainTab === "more" ? "text-[#7F1D1D]" : "text-gray-400"}`}>
            More
          </button>
        </div>
      )}

      {/* ━━━ OVERLAY: CART — FIX #4 delete button + FIX #5 discount working ━━━ */}
      {overlay === "cart" && (
        <div className="animate-slide-up fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <button onClick={() => setOverlay("none")} className="text-xl text-gray-500">✕</button>
            <span className="text-sm font-semibold text-gray-900">Current sale ({totalQty})</span>
            <button onClick={() => { setCart({}); setCustomPrices({}); setCustomNotes({}); setOverlay("none"); }} className="text-xs font-medium text-[#7F1D1D]">Clear all</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {/* Add customer row */}
            <button onClick={() => setOverlay("customer")} className="flex w-full items-center gap-3 border-b border-gray-200 px-4 py-3.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7F1D1D]/10 text-xs font-bold text-[#7F1D1D]">C</div>
              <span className="flex-1 text-left text-sm text-gray-700">{linkedCustomerId ? customerName || "Customer linked" : "Add a customer"}</span>
              <span className="text-gray-400">›</span>
            </button>
            {/* FIX #4: Items list with qty +/- and delete button */}
            <div className="px-4">
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-2 border-b border-gray-200 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900">{item.name}</div>
                    {customNotes[item.id] && <div className="text-[11px] text-[#7F1D1D]">Nota: {customNotes[item.id]}</div>}
                    {item.supports_sugar && <div className="text-[11px] text-gray-400">{sugarLabel(item.sugar_level)}</div>}
                    {item.addon_names?.length > 0 && <div className="text-[11px] text-gray-400">+ {item.addon_names.join(", ")}</div>}
                  </div>
                  {/* Qty controls */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => removeFromCart(item.id)} className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-500 text-sm font-bold active:bg-gray-100">−</button>
                    <span className="w-6 text-center text-sm font-semibold tabular-nums text-gray-900">{item.qty}</span>
                    <button onClick={() => addToCart(item.product_id, item.variant_id || undefined, item.addon_ids.length ? item.addon_ids : undefined, item.sugar_level, undefined, true)} className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-500 text-sm font-bold active:bg-gray-100">+</button>
                  </div>
                  <span className="text-sm tabular-nums text-gray-900 shrink-0 w-20 text-right">RM{(item.price * item.qty).toFixed(2)}</span>
                  {/* Delete button */}
                  <button onClick={() => deleteFromCart(item.id)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500 transition-colors hover:bg-red-100 active:bg-red-200" aria-label="Delete item">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                </div>
              ))}
            </div>

            {/* FIX #5: Discount panel — now working */}
            <div className="px-4 py-3 border-b border-gray-100">
              <button onClick={() => setShowDiscountPanel(!showDiscountPanel)} className="text-sm font-medium text-[#7F1D1D]">
                {showDiscountPanel ? "▾ Tutup diskaun" : "＋ Tambah diskaun"}
              </button>
              {showDiscountPanel && (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    {(["none", "percent", "fixed"] as const).map(dt => (
                      <button key={dt} onClick={() => { setDiscountType(dt); if (dt === "none") setDiscountValue(""); }} className={`rounded-full px-4 py-2 text-xs font-medium transition-colors ${discountType === dt ? "bg-[#7F1D1D] text-white" : "bg-gray-100 text-gray-600"}`}>
                        {dt === "none" ? "Tiada" : dt === "percent" ? "% Peratus" : "RM Tetap"}
                      </button>
                    ))}
                  </div>
                  {discountType !== "none" && (
                    <input
                      type="number"
                      value={discountValue}
                      onChange={e => setDiscountValue(e.target.value)}
                      placeholder={discountType === "percent" ? "Masukkan % (cth: 10)" : "Masukkan RM (cth: 5.00)"}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20"
                    />
                  )}
                </div>
              )}
              {discountAmount > 0 && <div className="mt-2 text-xs font-medium text-green-600">Diskaun: -RM{discountAmount.toFixed(2)}</div>}
            </div>
          </div>
          {/* Charge button — themed red */}
          <div className="border-t border-gray-200 px-4 py-4 pb-[env(safe-area-inset-bottom,12px)]">
            <button onClick={() => setOverlay("payment")} className="w-full rounded-full bg-[#7F1D1D] py-4 text-base font-semibold text-white active:bg-[#6B1818]">
              Charge RM{total.toFixed(2)}
            </button>
          </div>
        </div>
      )}

      {/* ━━━ OVERLAY: CUSTOMER ━━━ */}
      {overlay === "customer" && (
        <div className="screen-enter fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <button onClick={() => setOverlay("cart")} className="text-sm text-gray-500">← Kembali</button>
            <span className="text-sm font-semibold">Pelanggan</span>
            <button onClick={() => setOverlay("cart")} className="text-sm font-medium text-[#7F1D1D]">Simpan</button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nama" className="w-full border-b border-gray-200 py-3 text-sm outline-none placeholder:text-gray-400 focus:border-[#7F1D1D]" />
            <div className="flex gap-2">
              <input value={customerPhone} onChange={e => { setCustomerPhone(e.target.value); setLinkedCustomerId(null); setMemberPoints(0); setMemberExpiringPoints(0); setRedeemPointsInput(""); setMemberLookupMessage(null); }} placeholder="Telefon" className="flex-1 border-b border-gray-200 py-3 text-sm outline-none placeholder:text-gray-400 focus:border-[#7F1D1D]" />
              <button onClick={() => void lookupMember()} disabled={memberLookupLoading} className="shrink-0 rounded-lg bg-[#7F1D1D] px-4 py-2 text-xs font-medium text-white disabled:opacity-50">{memberLookupLoading ? "..." : "Cari"}</button>
            </div>
            {memberLookupMessage && <div className={`rounded-lg px-3 py-2 text-xs ${memberLookupTone === "success" ? "bg-green-50 text-green-700" : memberLookupTone === "warn" ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-600"}`}>{memberLookupMessage}</div>}
            {linkedCustomerId && <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">{memberPoints} points{memberExpiringPoints > 0 && ` · ${memberExpiringPoints} tamat 30 hari`}</div>}
            <input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="Email" className="w-full border-b border-gray-200 py-3 text-sm outline-none placeholder:text-gray-400 focus:border-[#7F1D1D]" />
            <div>
              <label className="mb-1 block text-xs text-gray-500">Marketing</label>
              <select value={getConsentMode()} onChange={e => setConsentMode(e.target.value as MarketingConsentMode)} className="w-full border-b border-gray-200 py-2.5 text-sm outline-none">
                <option value="none">Tiada</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="both">Semua</option>
              </select>
            </div>
            {linkedCustomerId && (
              <div>
                <label className="mb-1 block text-xs text-gray-500">Tebus Points ({memberPoints})</label>
                <input type="number" value={redeemPointsInput} onChange={e => setRedeemPointsInput(e.target.value)} placeholder={`Min ${LOYALTY_REDEEM_MIN_POINTS}`} className="w-full border-b border-gray-200 py-3 text-sm outline-none" />
                {redeemStatusMessage && <div className="mt-1 text-xs text-amber-600">{redeemStatusMessage}</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ━━━ OVERLAY: PAYMENT ━━━ */}
      {overlay === "payment" && (
        <div className="screen-enter fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => setOverlay("cart")} className="text-2xl text-gray-400">✕</button>
            <span />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="text-4xl font-bold tabular-nums text-gray-900">RM{total.toFixed(2)}</div>
            <div className="mt-2 text-sm text-gray-400">Pilih kaedah pembayaran</div>
          </div>
          <div className="border-t border-gray-200">
            <button onClick={() => { setCashReceived(String(total)); void completePayment("cash", total); }} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left">
              <span className="text-base font-medium text-gray-900">Cash</span>
              <span className="text-gray-400">›</span>
            </button>
            <button onClick={() => { void completePayment("qr"); }} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left">
              <span className="text-base font-medium text-gray-900">QR Payment</span>
              <span className="text-gray-400">›</span>
            </button>
            <button onClick={() => { void completePayment("card"); }} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left">
              <span className="text-base font-medium text-gray-900">Record Card Payment</span>
              <span className="text-gray-400">›</span>
            </button>
          </div>
          <div className="h-[env(safe-area-inset-bottom,12px)]" />
        </div>
      )}

      {/* ━━━ OVERLAY: DONE ━━━ */}
      {overlay === "done" && receiptData && (
        <div className="screen-enter fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between px-4 py-3">
            <span />
            <button onClick={() => { setReceiptData(null); setOverlay("none"); }} className="text-sm font-medium text-[#7F1D1D]">Selesai</button>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center px-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-4xl">✓</div>
            <div className="mt-5 text-2xl font-bold">RM{receiptData.total.toFixed(2)}</div>
            <div className="mt-1 text-sm text-gray-500">#{receiptData.receipt_number} · {receiptData.customerName}</div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => printReceipt(receiptData)} className="rounded-full border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-700">Print Receipt</button>
              <button onClick={() => { setReceiptData(null); setOverlay("none"); }} className="rounded-full bg-[#7F1D1D] px-6 py-2.5 text-sm font-medium text-white">New Sale</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {addedToast && <div className="animate-toast fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-[#7F1D1D] px-4 py-2 text-sm text-white shadow-lg">{addedToast}</div>}

      {/* ━━━ MODALS ━━━ */}
      {showSugarPicker && sugarPickerPayload && (
        <ModalShell onClose={() => { setShowSugarPicker(false); setSugarPickerPayload(null); }}>
          <ModalTitle>Tahap Gula</ModalTitle><ModalSubtitle>{sugarPickerPayload.product_name}</ModalSubtitle>
          <div className="mt-4 grid grid-cols-2 gap-2">{SUGAR_LEVEL_OPTIONS.map(o => <button key={o.value} onClick={() => submitSugar(o.value)} className="pos-tile rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-medium text-gray-800">{o.emoji} {o.label}</button>)}</div>
          <button onClick={() => { setShowSugarPicker(false); setSugarPickerPayload(null); }} className="mt-3 w-full py-2.5 text-sm text-gray-500">Batal</button>
        </ModalShell>
      )}
      {selectedProduct && !showAddonModal && (
        <ModalShell onClose={() => { setSelectedProduct(null); setSelectedVariant(null); setSelectedAddons([]); }}>
          <ModalTitle>{selectedProduct.name}</ModalTitle><ModalSubtitle>Pilih saiz</ModalSubtitle>
          <div className="mt-4 space-y-2">{selectedProduct.variants?.map(v => <button key={v.id} onClick={() => { if (selectedProduct.addons?.length) { setSelectedVariant(v.id); setShowAddonModal(true); } else { addProductWithSugar({ product: selectedProduct, variantId: v.id }); setSelectedProduct(null); }}} className="pos-tile w-full rounded-xl border border-gray-200 px-4 py-3.5 text-left text-sm font-medium">{v.name} <span className="text-gray-400">+RM{v.price_adjustment.toFixed(2)}</span></button>)}</div>
          <button onClick={() => { setSelectedProduct(null); setSelectedVariant(null); setSelectedAddons([]); }} className="mt-3 w-full py-2.5 text-sm text-gray-500">Batal</button>
        </ModalShell>
      )}
      {showAddonModal && selectedProduct && (
        <ModalShell onClose={() => { setShowAddonModal(false); setSelectedAddons([]); }}>
          <ModalTitle>Tambahan</ModalTitle>
          <div className="mt-4 space-y-2">{selectedProduct.addons?.map(a => <label key={a.id} className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3"><input type="checkbox" checked={selectedAddons.includes(a.id)} onChange={e => setSelectedAddons(e.target.checked ? [...selectedAddons, a.id] : selectedAddons.filter(x => x !== a.id))} className="h-4 w-4 accent-[#7F1D1D]" /><span className="flex-1 text-sm">{a.name}</span><span className="text-sm text-gray-400">+RM{a.price.toFixed(2)}</span></label>)}</div>
          <ModalActions>
            <ModalBtnSecondary onClick={() => { if (selectedProduct.variants?.length) setShowAddonModal(false); else { setSelectedProduct(null); setShowAddonModal(false); } setSelectedAddons([]); }}>Batal</ModalBtnSecondary>
            <ModalBtnPrimary onClick={() => { addProductWithSugar({ product: selectedProduct, variantId: selectedVariant || undefined, addonIds: selectedAddons }); setSelectedProduct(null); setSelectedVariant(null); setSelectedAddons([]); setShowAddonModal(false); }}>Tambah</ModalBtnPrimary>
          </ModalActions>
        </ModalShell>
      )}
      {showOpenShiftModal && (<ModalShell onClose={() => setShowOpenShiftModal(false)}><ModalTitle>Buka Shift</ModalTitle><ModalSubtitle>Masukkan duit permulaan.</ModalSubtitle><div className="mt-4 space-y-3"><ModalInput type="number" value={openingCash} onChange={setOpeningCash} placeholder="Duit permulaan (RM)" /><ModalTextArea value={openingNote} onChange={setOpeningNote} placeholder="Nota (pilihan)" /></div><ModalActions><ModalBtnSecondary onClick={() => setShowOpenShiftModal(false)}>Batal</ModalBtnSecondary><ModalBtnPrimary onClick={() => void openShift()} disabled={shiftSubmitting}>{shiftSubmitting ? "Membuka..." : "Buka"}</ModalBtnPrimary></ModalActions></ModalShell>)}
      {showCloseShiftModal && currentShift && (<ModalShell onClose={() => setShowCloseShiftModal(false)}><ModalTitle>Tutup Shift</ModalTitle><InfoCard><div className="space-y-0.5"><div>Permulaan: RM{Number(currentShift.opening_cash || 0).toFixed(2)}</div><div>Jualan: RM{cashSalesLive.toFixed(2)}</div><div>Paid out: RM{paidOutTotalLive.toFixed(2)}</div><div className="font-semibold">Jangkaan: RM{expectedCashLive.toFixed(2)}</div></div></InfoCard><div className="mt-3 space-y-3"><ModalInput type="number" value={countedCash} onChange={setCountedCash} placeholder="Duit dikira (RM)" /><div className="text-sm">Lebih/Kurang: <span className="font-semibold">RM{(Number(countedCash || 0) - expectedCashLive).toFixed(2)}</span></div><ModalTextArea value={closingNote} onChange={setClosingNote} placeholder="Nota penutup" /></div><ModalActions><ModalBtnSecondary onClick={() => setShowCloseShiftModal(false)}>Batal</ModalBtnSecondary><ModalBtnPrimary onClick={() => void closeShift()} disabled={shiftSubmitting}>{shiftSubmitting ? "Menutup..." : "Tutup"}</ModalBtnPrimary></ModalActions></ModalShell>)}
      {showPaidOutModal && currentShift && (<ModalShell onClose={() => setShowPaidOutModal(false)}><ModalTitle>Paid Out</ModalTitle><InfoCard><div>Tunai: RM{cashSalesLive.toFixed(2)} · Keluar: RM{paidOutTotalLive.toFixed(2)} · Baki: RM{expectedCashLive.toFixed(2)}</div></InfoCard><div className="mt-3 space-y-2"><ModalInput type="number" value={paidOutAmount} onChange={setPaidOutAmount} placeholder="Amaun (RM)" /><ModalInput value={paidOutReason} onChange={setPaidOutReason} placeholder="Sebab" /><ModalInput value={paidOutStaffName} onChange={setPaidOutStaffName} placeholder="Nama staf" /><ModalInput value={paidOutVendor} onChange={setPaidOutVendor} placeholder="Vendor (pilihan)" /></div>{recentPaidOuts.length > 0 && <div className="mt-2 max-h-20 overflow-auto rounded-lg bg-gray-50 p-2"><div className="mb-1 text-[11px] font-medium text-gray-500">Terkini</div>{recentPaidOuts.slice(0, 3).map(e => <div key={e.id} className="flex justify-between text-xs"><span className="truncate text-gray-600">{e.reason}</span><span className="text-red-600">RM{Number(e.amount || 0).toFixed(2)}</span></div>)}</div>}<ModalActions><ModalBtnSecondary onClick={() => setShowPaidOutModal(false)}>Batal</ModalBtnSecondary><ModalBtnPrimary onClick={() => void submitPaidOut()} disabled={paidOutSubmitting}>{paidOutSubmitting ? "Saving..." : "Simpan"}</ModalBtnPrimary></ModalActions></ModalShell>)}
      {showSignOutConfirm && (<ModalShell onClose={() => setShowSignOutConfirm(false)}><ModalTitle>Log keluar?</ModalTitle><ModalActions><ModalBtnSecondary onClick={() => setShowSignOutConfirm(false)}>Batal</ModalBtnSecondary><a href="/auth/logout?next=/staff/login" className="flex flex-1 items-center justify-center rounded-xl bg-[#7F1D1D] px-4 py-3 text-sm font-semibold text-white">Ya</a></ModalActions></ModalShell>)}
    </div>
  );
}
