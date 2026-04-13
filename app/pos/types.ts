export type Variant = {
  id: string;
  name: string;
  price_adjustment: number;
};

export type Addon = {
  id: string;
  name: string;
  price: number;
};

export type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  category?: string;
  variants?: Variant[];
  addons?: Addon[];
};

export type Shift = {
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

export type PaidOutEntry = {
  id: string;
  shift_id: string;
  register_id: string;
  amount: number;
  staff_name: string | null;
  reason: string;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_url: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
};

export type SugarLevel = "normal" | "less" | "half" | "none";

export type CartItem = {
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

export type ReceiptData = {
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

export type MemberLookup = {
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

export type CheckoutTab = "items" | "customer" | "promo" | "payment";
export type MarketingConsentMode = "none" | "whatsapp" | "email" | "both";

export const SUGAR_LEVEL_OPTIONS: Array<{ value: SugarLevel; label: string; emoji: string }> = [
  { value: "normal", label: "Normal", emoji: "🍯" },
  { value: "less", label: "Kurang", emoji: "🍵" },
  { value: "half", label: "Separuh", emoji: "½" },
  { value: "none", label: "Kosong", emoji: "⚪" },
];

export const DEFAULT_SUGAR_LEVEL: SugarLevel = "normal";
export const PAYMENT_METHODS: Array<"cash" | "qr" | "card"> = ["cash", "qr", "card"];
export const DISCOUNT_TYPES: Array<"percent" | "fixed" | "none"> = ["percent", "fixed", "none"];
export const LOYALTY_REDEEM_RM_PER_POINT = 0.05;
export const LOYALTY_REDEEM_MIN_POINTS = 50;
export const LOYALTY_REDEEM_MAX_RATIO = 0.5;

export function buildCartKey(
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

export function isSugarSupportedCategory(category?: string | null) {
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

export function sugarLabel(level: SugarLevel | null | undefined) {
  const normalized = (level || DEFAULT_SUGAR_LEVEL) as SugarLevel;
  return SUGAR_LEVEL_OPTIONS.find((o) => o.value === normalized)?.label || "Normal";
}

export const PAYMENT_ICONS: Record<string, string> = {
  cash: "💵",
  qr: "📱",
  card: "💳",
};
