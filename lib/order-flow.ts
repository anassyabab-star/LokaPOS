// ============================================================================
// LokaPOS — Order flow vocabulary (PURE, client-safe).
//
// Shared by API routes, POS, KDS, admin dashboard and the customer app.
// No Supabase / env access here — anything that touches the DB lives in
// `lib/order-status.ts` (server only).
//
// Pipeline:  awaiting_payment → pending → preparing → ready → completed
//            (+ cancelled, reachable only through void / refund / expiry)
// ============================================================================

export type OrderStatus =
  | "awaiting_payment"
  | "pending"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

export const ORDER_STATUSES: OrderStatus[] = [
  "awaiting_payment",
  "pending",
  "preparing",
  "ready",
  "completed",
  "cancelled",
];

/** Forward pipeline order (index = stage). `cancelled` is off the line. */
export const FORWARD_ORDER: OrderStatus[] = [
  "awaiting_payment",
  "pending",
  "preparing",
  "ready",
  "completed",
];

/** Statuses shown on the Kitchen Display. */
export const KITCHEN_ACTIVE_STATUSES = ["pending", "preparing", "ready"] as const;

/** Statuses that count as a sale (always combine with payment_status = 'paid'). */
export const SALES_STATUSES = ["pending", "preparing", "ready", "completed"] as const;

/** Statuses a staff member may set through the generic status endpoint. */
export const STAFF_SETTABLE_STATUSES: OrderStatus[] = ["pending", "preparing", "ready", "completed"];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as string[]).includes(value);
}

export function normalizeOrderStatus(value: unknown): OrderStatus | null {
  const v = String(value || "").trim().toLowerCase();
  return isOrderStatus(v) ? v : null;
}

export function stageIndex(status: OrderStatus): number {
  return FORWARD_ORDER.indexOf(status);
}

/** Bahasa Melayu labels used across POS / KDS / customer app. */
export const ORDER_STATUS_LABELS_MS: Record<OrderStatus, string> = {
  awaiting_payment: "Belum Bayar",
  pending: "Dalam Barisan",
  preparing: "Sedang Dibuat",
  ready: "Sedia",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

export const ORDER_STATUS_LABELS_EN: Record<OrderStatus, string> = {
  awaiting_payment: "Awaiting Payment",
  pending: "Pending",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

// ---------------------------------------------------------------------------
// Order type + fulfilment target (table / buzzer)
// ---------------------------------------------------------------------------

export type OrderType = "dine_in" | "take_away";

/** Accepts `dine`, `dine_in`, `dinein`, `takeaway`, `take_away`, `take-away`. */
export function normalizeOrderType(value: unknown): OrderType | null {
  const v = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (v === "dine" || v === "dine_in" || v === "dinein") return "dine_in";
  if (v === "takeaway" || v === "take_away" || v === "pickup" || v === "take_out") return "take_away";
  return null;
}

/** Table / buzzer labels are short alphanumerics ("7", "A3", "12"). */
export function sanitizeTargetLabel(value: unknown, maxLen = 10): string | null {
  const v = String(value ?? "")
    .trim()
    .replace(/[^\w-]/g, "")
    .slice(0, maxLen);
  return v.length > 0 ? v : null;
}

export type OrderTargetFields = {
  order_type?: string | null;
  table_number?: string | null;
  buzzer_number?: string | null;
};

export type OrderTarget =
  | { kind: "table"; label: string; text: string }
  | { kind: "buzzer"; label: string; text: string }
  | { kind: "take_away"; label: null; text: string }
  | { kind: "counter"; label: null; text: string };

/**
 * Where does this order go once it is ready?
 *   table  → "Meja 7"       buzzer → "Buzzer 12"
 *   take_away (no buzzer) → "Take Away"     nothing known → "Ambil di kaunter"
 */
export function orderTarget(order: OrderTargetFields | null | undefined): OrderTarget {
  const table = sanitizeTargetLabel(order?.table_number);
  const buzzer = sanitizeTargetLabel(order?.buzzer_number);
  const type = normalizeOrderType(order?.order_type);

  if (table) return { kind: "table", label: table, text: `Meja ${table}` };
  if (buzzer) return { kind: "buzzer", label: buzzer, text: `Buzzer ${buzzer}` };
  if (type === "take_away") return { kind: "take_away", label: null, text: "Take Away" };
  return { kind: "counter", label: null, text: "Ambil di kaunter" };
}

export function orderTypeLabel(value: unknown): string | null {
  const t = normalizeOrderType(value);
  if (t === "dine_in") return "Dine In";
  if (t === "take_away") return "Take Away";
  return null;
}

// ---------------------------------------------------------------------------
// Order number display
// ---------------------------------------------------------------------------

/**
 * Short daily number the customer quotes at the counter.
 *   "15092026-042" → "042"     (fallback: last 3 chars of the id)
 */
export function shortOrderNumber(receiptNumber: string | null | undefined, fallbackId?: string | null): string {
  const receipt = String(receiptNumber || "").trim();
  const m = receipt.match(/-(\d+)$/);
  if (m) return m[1].padStart(3, "0");
  if (receipt) return receipt.slice(-3).padStart(3, "0");
  const id = String(fallbackId || "").replace(/[^0-9a-z]/gi, "");
  return id ? id.slice(-3).toUpperCase() : "---";
}
