"use client";

// ============================================================================
// Loka customer-ordering — shared client state for the (order) flow.
// The prototype was a single-screen SPA with `screen` state; here the screens
// are real routes, so cross-screen state (cart, order type, redeem, table)
// lives in this context + localStorage (guest cart; synced to Supabase on
// checkout). See design_handoff_loka_ordering/README.md.
// ============================================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type CartLine = {
  /** Unique per configured line (same product with different options = new line). */
  lineId: string;
  productId: string;
  name: string;
  /** CSS gradient/colour swatch used as image placeholder. */
  swatch: string;
  imageUrl: string | null;
  unitPrice: number;
  qty: number;
  /** Human-readable options summary, e.g. "Iced · Large · Oat". */
  optionsText: string;
  variantId: string | null;
  addonIds: string[];
};

export type OrderType = "dine" | "takeaway";

/** Who the server says we are. `null` while the first /api/public/me is in
 *  flight — screens render the signed-out state until it resolves, so the
 *  static HTML and the first client render always agree. */
export type Member = {
  signedIn: boolean;
  name: string | null;
  phone: string | null;
  /** "google" | "otp" | "email" — handy for wording, not for access control. */
  provider: string | null;
};

/** Snapshot of a just-placed order (design's `lastOrder`) — drives the
 *  confirmation + track screens without re-fetching items from the server. */
export type LastOrder = {
  orderId: string;
  receipt: string;
  /** Short daily Order ID the customer quotes at the counter, e.g. "042". */
  shortNumber?: string;
  phone: string;
  name: string;
  items: { name: string; optionsText: string; qty: number; unitPrice: number }[];
  subtotal: number;
  total: number;
  payment: "online" | "counter";
  type: OrderType;
  table: string | null;
  createdAt: string;
};

type OrderState = {
  cart: CartLine[];
  addLine: (line: Omit<CartLine, "lineId">) => void;
  setQty: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
  clearCart: () => void;
  cartCount: number;
  subtotal: number;
  orderType: OrderType;
  setOrderType: (t: OrderType) => void;
  redeem: boolean;
  setRedeem: (v: boolean) => void;
  table: string | null;
  setTable: (t: string | null) => void;
  // Guest contact (persisted so we don't re-ask across the flow).
  contact: { name: string; phone: string };
  setContact: (c: { name: string; phone: string }) => void;
  lastOrder: LastOrder | null;
  setLastOrder: (o: LastOrder | null) => void;
  /** Referral code captured from ?ref= (applied on the first order). */
  referral: string | null;
  /** False until localStorage has been read. Screens that redirect on an empty
   *  cart must wait for this, or the first render redirects every reload. */
  hydrated: boolean;
  /** Server-confirmed session, or null while still loading. */
  member: Member | null;
  /** Re-ask the server who we are (after sign-in or sign-out). */
  refreshMember: () => Promise<void>;
  /** Forget the local member session (contact, last order, referral). */
  clearSession: () => void;
  toast: string | null;
  showToast: (msg: string) => void;
};

const Ctx = createContext<OrderState | null>(null);

const CART_KEY = "loka_order_cart";
const TABLE_KEY = "loka_order_table";
const TYPE_KEY = "loka_order_type";
const CONTACT_KEY = "loka_order_contact";
const LAST_KEY = "loka_order_last";
const REF_KEY = "loka_referral_code";

function genLineId() {
  return `l_${Math.random().toString(36).slice(2, 10)}`;
}

export function OrderProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderTypeState] = useState<OrderType>("dine");
  const [redeem, setRedeem] = useState(false);
  const [table, setTableState] = useState<string | null>(null);
  const [contact, setContactState] = useState<{ name: string; phone: string }>({ name: "", phone: "" });
  const [lastOrder, setLastOrderState] = useState<LastOrder | null>(null);
  const [referral, setReferral] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Hydrate from localStorage once.
  useEffect(() => {
    try {
      const c = localStorage.getItem(CART_KEY);
      if (c) setCart(JSON.parse(c));
      const t = localStorage.getItem(TABLE_KEY);
      if (t) setTableState(t);
      const ty = localStorage.getItem(TYPE_KEY);
      if (ty === "dine" || ty === "takeaway") setOrderTypeState(ty);
      const ct = localStorage.getItem(CONTACT_KEY);
      if (ct) setContactState(JSON.parse(ct));
      const lo = localStorage.getItem(LAST_KEY);
      if (lo) setLastOrderState(JSON.parse(lo));
      // ?ref=CODE from a shared referral link wins over a stored one.
      const urlRef = new URLSearchParams(window.location.search).get("ref");
      const ref = String(urlRef || localStorage.getItem(REF_KEY) || "").trim().toUpperCase().slice(0, 32);
      if (ref) { setReferral(ref); localStorage.setItem(REF_KEY, ref); }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {}
  }, [cart, loaded]);

  // On every load, ask the server who we are. For a Google-backed session this
  // re-mints the 30-minute loyalty phone cookie (so check-in / redeem never
  // bounce to a code), and on a fresh device it recovers name + phone.
  const [member, setMember] = useState<Member | null>(null);

  const refreshMember = useCallback(async () => {
    try {
      const res = await fetch("/api/public/me", { cache: "no-store" });
      const d = await res.json();
      const signedIn = Boolean(d?.signed_in);
      const phone = d?.phone ? String(d.phone) : null;
      const name = d?.name ? String(d.name) : null;
      setMember({ signedIn, name, phone, provider: d?.provider ? String(d.provider) : null });
      // Recover contact details on a fresh device, without clobbering what the
      // customer typed themselves.
      if (signedIn && phone) {
        setContactRef.current({ name, phone });
      }
    } catch {
      // Offline or the endpoint is down — stay signed-out rather than guess.
      setMember(m => m ?? { signedIn: false, name: null, phone: null, provider: null });
    }
  }, []);

  // `setContact` closes over the current contact, so keep the latest in a ref
  // instead of re-running (and re-fetching) whenever the contact changes.
  const setContactRef = useRef<(d: { name: string | null; phone: string }) => void>(() => {});
  setContactRef.current = (d) => {
    if (!contact.phone) setContact({ name: contact.name || (d.name ?? ""), phone: d.phone });
  };

  useEffect(() => {
    if (!loaded) return;
    void refreshMember();
  }, [loaded, refreshMember]);

  function clearSession() {
    setContactState({ name: "", phone: "" });
    setLastOrderState(null);
    setReferral(null);
    setMember({ signedIn: false, name: null, phone: null, provider: null });
    try {
      localStorage.removeItem(CONTACT_KEY);
      localStorage.removeItem(LAST_KEY);
      localStorage.removeItem(REF_KEY);
    } catch {}
  }

  function setTable(t: string | null) {
    setTableState(t);
    try { t ? localStorage.setItem(TABLE_KEY, t) : localStorage.removeItem(TABLE_KEY); } catch {}
  }
  function setOrderType(t: OrderType) {
    setOrderTypeState(t);
    try { localStorage.setItem(TYPE_KEY, t); } catch {}
  }
  function setContact(c: { name: string; phone: string }) {
    setContactState(c);
    try { localStorage.setItem(CONTACT_KEY, JSON.stringify(c)); } catch {}
  }
  function setLastOrder(o: LastOrder | null) {
    setLastOrderState(o);
    try { o ? localStorage.setItem(LAST_KEY, JSON.stringify(o)) : localStorage.removeItem(LAST_KEY); } catch {}
  }

  function addLine(line: Omit<CartLine, "lineId">) {
    setCart(prev => [...prev, { ...line, lineId: genLineId() }]);
  }
  function setQty(lineId: string, qty: number) {
    setCart(prev =>
      qty <= 0
        ? prev.filter(l => l.lineId !== lineId)
        : prev.map(l => (l.lineId === lineId ? { ...l, qty } : l))
    );
  }
  function removeLine(lineId: string) {
    setCart(prev => prev.filter(l => l.lineId !== lineId));
  }
  function clearCart() {
    setCart([]);
    setRedeem(false);
  }
  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(t => (t === msg ? null : t)), 1700);
  }

  const cartCount = useMemo(() => cart.reduce((s, l) => s + l.qty, 0), [cart]);
  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.unitPrice * l.qty, 0), [cart]);

  const value: OrderState = {
    cart, addLine, setQty, removeLine, clearCart, cartCount, subtotal,
    orderType, setOrderType, redeem, setRedeem, table, setTable,
    contact, setContact, lastOrder, setLastOrder, referral, clearSession, toast, showToast,
    hydrated: loaded, member, refreshMember,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrder() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOrder must be used within OrderProvider");
  return ctx;
}

/** Bottom-centre espresso toast (design: "{qty}× {name} added", ~1.7s). */
export function OrderToast() {
  const { toast } = useOrder();
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-7 z-[60] flex justify-center px-6">
      <div className="animate-fadeIn rounded-full bg-espresso px-4 py-2.5 font-sans text-[13px] font-semibold text-cream shadow-card">
        {toast}
      </div>
    </div>
  );
}

/** Canonical Malaysian phone ("0123…"/"123…"/"+60…" → "60123…") so the customer
 *  record, OTP and redeem all key on the same value. */
export function normalizeMyPhone(input: string) {
  let d = String(input || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "60" + d.slice(1);
  else if (!d.startsWith("60")) d = "60" + d;
  return d;
}

/** Local part for display in a "+60" input (strips the 60 country code). */
export function localPhone(canonical: string) {
  return String(canonical || "").replace(/^60/, "");
}

/** RM formatter — whole numbers without decimals (design: "RM 12"), else 2dp. */
export function rm(n: number) {
  const v = Math.max(0, Number(n) || 0);
  return `RM ${Number.isInteger(v) ? v : v.toFixed(2)}`;
}

/** Deterministic diagonal-stripe gradient swatch for a product (image placeholder). */
export function swatchFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  const a = `hsl(${h} 38% 82%)`;
  const b = `hsl(${(h + 28) % 360} 34% 72%)`;
  return `repeating-linear-gradient(135deg, ${a} 0 14px, ${b} 14px 28px)`;
}
