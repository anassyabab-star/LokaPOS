import { createClient } from "@supabase/supabase-js";
import OrderStatusActions from "./order-status-actions";

type OrdersPageProps = {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    payment?: string;
    source?: string;
    range?: string;
  }>;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

type OrderItemAddonRow = {
  order_item_id?: string | null;
  order_item?: string | null;
  order_items_id?: string | null;
  addon_id?: string | null;
  addon_name_snapshot?: string | null;
  addon_name?: string | null;
  name?: string | null;
};

type OrderSource = "pos" | "customer_web" | "unknown";

function formatSugarLevel(value: string | null | undefined) {
  const key = String(value || "").toLowerCase();
  if (!key) return "";
  if (key === "normal") return "Normal Sugar";
  if (key === "less") return "Less Sugar";
  if (key === "half") return "Half Sugar";
  if (key === "none") return "No Sugar";
  return key;
}

function pickAddonItemId(row: OrderItemAddonRow) {
  return String(row.order_item_id || row.order_item || row.order_items_id || "").trim();
}

function pickAddonName(row: OrderItemAddonRow) {
  return String(row.addon_name_snapshot || row.addon_name || row.name || "").trim();
}

const ORDER_STATUS_STEPS = ["pending", "preparing", "ready", "completed"] as const;

type OrderTimelineStatus = (typeof ORDER_STATUS_STEPS)[number] | "cancelled" | "unknown";

function normalizeOrderStatus(value: string | null | undefined): OrderTimelineStatus {
  const status = String(value || "").trim().toLowerCase();
  if (status === "pending") return "pending";
  if (status === "preparing") return "preparing";
  if (status === "ready") return "ready";
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  return "unknown";
}

function formatOrderStatus(status: OrderTimelineStatus) {
  if (status === "pending") return "Pending";
  if (status === "preparing") return "Preparing";
  if (status === "ready") return "Ready";
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  return "Unknown";
}

function orderStatusBadgeStyle(status: OrderTimelineStatus): React.CSSProperties {
  if (status === "pending")   return { color: "var(--d-warning)", background: "var(--d-warning-soft)", border: "1px solid var(--d-warning)" };
  if (status === "preparing") return { color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid #f59e0b" };
  if (status === "ready")     return { color: "var(--d-success)", background: "var(--d-success-soft)", border: "1px solid var(--d-success)" };
  if (status === "completed") return { color: "var(--d-info)", background: "var(--d-info-soft)", border: "1px solid var(--d-info)" };
  if (status === "cancelled") return { color: "var(--d-error)", background: "var(--d-error-soft)", border: "1px solid var(--d-error)" };
  return { color: "var(--d-text-3)", background: "var(--d-surface-hover)", border: "1px solid var(--d-border)" };
}

function normalizeOrderSource(value: string | null | undefined): OrderSource {
  const source = String(value || "").trim().toLowerCase();
  if (source === "pos") return "pos";
  if (source === "customer_web") return "customer_web";
  return "unknown";
}

function formatOrderSource(source: OrderSource) {
  if (source === "pos") return "POS";
  if (source === "customer_web") return "Web App";
  return "Unknown";
}

function orderSourceBadgeStyle(source: OrderSource): React.CSSProperties {
  if (source === "pos")          return { color: "var(--d-info)", background: "var(--d-info-soft)", border: "1px solid var(--d-info)" };
  if (source === "customer_web") return { color: "#8b5cf6", background: "rgba(139,92,246,0.12)", border: "1px solid #8b5cf6" };
  return { color: "var(--d-text-3)", background: "var(--d-surface-hover)", border: "1px solid var(--d-border)" };
}

function getFromDate(range: string) {
  const now = new Date();
  if (range === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }
  if (range === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }
  if (range === "30d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d.toISOString();
  }
  return null;
}

// Shared inline style helpers
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  fontSize: 13,
  color: "var(--d-text-1)",
  background: "var(--d-input-bg)",
  border: "1px solid var(--d-border)",
  outline: "none",
  boxSizing: "border-box",
};

const badgePillStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 10px",
  borderRadius: 20,
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = (await searchParams) || {};
  const q = (params.q || "").trim();
  const status = params.status || "all";
  const payment = params.payment || "all";
  const source = params.source || "all";
  const sourceFilter = source === "pos" || source === "customer_web" ? source : "all";
  const range = params.range || "30d";

  function buildOrdersQuery(includeOrderSource: boolean) {
    let query = supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (status !== "all") query = query.eq("status", status);
    if (payment !== "all") query = query.eq("payment_method", payment);
    if (includeOrderSource && sourceFilter !== "all") query = query.eq("order_source", sourceFilter);

    const fromDate = getFromDate(range);
    if (fromDate) query = query.gte("created_at", fromDate);
    if (q) query = query.or(`receipt_number.ilike.%${q}%,customer_name.ilike.%${q}%`);

    return query.limit(200);
  }

  let sourceColumnAvailable = true;
  let ordersQueryResult = await buildOrdersQuery(true);
  if (
    ordersQueryResult.error &&
    String(ordersQueryResult.error.message || "").toLowerCase().includes("order_source")
  ) {
    sourceColumnAvailable = false;
    ordersQueryResult = await buildOrdersQuery(false);
  }

  const { data: ordersRaw, error: ordersError } = ordersQueryResult;
  const sourceFilterUnavailable = !sourceColumnAvailable && sourceFilter !== "all";

  if (ordersError || !ordersRaw) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--d-bg)", padding: "28px 28px 40px", color: "var(--d-text-1)" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Orders History</h1>
        <p style={{ marginTop: 12, fontSize: 13, color: "var(--d-error)" }}>
          Failed to load orders: {ordersError?.message || "Unknown error"}
        </p>
      </div>
    );
  }

  const orderIds = ordersRaw.map(order => order.id);

  const { data: orderItemsRaw } =
    orderIds.length > 0
      ? await supabase
          .from("order_items")
          .select("id, order_id, product_name_snapshot, variant_id, sugar_level, price, qty, line_total")
          .in("order_id", orderIds)
      : { data: [] };

  const itemIds = (orderItemsRaw || []).map(item => item.id);
  const variantIds = Array.from(
    new Set((orderItemsRaw || []).map(item => item.variant_id).filter(Boolean))
  ) as string[];

  const { data: variantsRaw } =
    variantIds.length > 0
      ? await supabase.from("product_variants").select("id, name").in("id", variantIds)
      : { data: [] };

  let orderItemAddonsRaw: OrderItemAddonRow[] = [];
  if (itemIds.length > 0) {
    const { data: primaryAddons, error: primaryAddonsError } = await supabase
      .from("order_item_addons").select("*").in("order_item_id", itemIds);

    if (primaryAddonsError) {
      const { data: fallbackAddons, error: fallbackAddonsError } = await supabase
        .from("order_item_addons").select("*").in("order_item", itemIds);
      if (!fallbackAddonsError) {
        orderItemAddonsRaw = (fallbackAddons || []) as OrderItemAddonRow[];
      } else {
        const { data: thirdAddons, error: thirdAddonsError } = await supabase
          .from("order_item_addons").select("*").in("order_items_id", itemIds);
        if (!thirdAddonsError) {
          orderItemAddonsRaw = (thirdAddons || []) as OrderItemAddonRow[];
        }
      }
    } else {
      orderItemAddonsRaw = (primaryAddons || []) as OrderItemAddonRow[];
    }
  }

  const missingAddonNameIds = Array.from(
    new Set(
      orderItemAddonsRaw
        .filter(row => !pickAddonName(row))
        .map(row => String(row.addon_id || "").trim())
        .filter(Boolean)
    )
  );

  const addonNameById = new Map<string, string>();
  if (missingAddonNameIds.length > 0) {
    const { data: addonRows } = await supabase
      .from("product_addons").select("id,name").in("id", missingAddonNameIds);
    for (const row of addonRows || []) {
      addonNameById.set(String(row.id), String(row.name || ""));
    }
  }

  const variantNameById = new Map<string, string>();
  for (const variant of variantsRaw || []) {
    variantNameById.set(variant.id, variant.name);
  }

  const addonsByOrderItemId = new Map<string, Array<{ addon_name: string | null }>>();
  for (const addon of orderItemAddonsRaw) {
    const orderItemId = pickAddonItemId(addon);
    if (!orderItemId) continue;
    const existing = addonsByOrderItemId.get(orderItemId) || [];
    const fallbackName = addonNameById.get(String(addon.addon_id || "").trim()) || "";
    const addonName = pickAddonName(addon) || fallbackName;
    existing.push({ addon_name: addonName || null });
    addonsByOrderItemId.set(orderItemId, existing);
  }

  const itemsByOrderId = new Map<
    string,
    Array<{
      id: string;
      product_name_snapshot: string | null;
      variant_id: string | null;
      sugar_level: string | null;
      price: number | null;
      qty: number | null;
      line_total: number | null;
      order_item_addons: Array<{ addon_name: string | null }>;
    }>
  >();

  for (const item of orderItemsRaw || []) {
    const existing = itemsByOrderId.get(item.order_id) || [];
    existing.push({
      id: item.id,
      product_name_snapshot: item.product_name_snapshot,
      variant_id: item.variant_id,
      sugar_level: item.sugar_level,
      price: item.price,
      qty: item.qty,
      line_total: item.line_total,
      order_item_addons: addonsByOrderItemId.get(item.id) || [],
    });
    itemsByOrderId.set(item.order_id, existing);
  }

  const orders = ordersRaw.map(order => ({
    ...order,
    order_items: itemsByOrderId.get(order.id) || [],
  }));

  return (
    <div style={{ minHeight: "100vh", background: "var(--d-bg)", padding: "28px 28px 40px", color: "var(--d-text-1)" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Orders History</h1>
        <p style={{ fontSize: 13, color: "var(--d-text-3)", marginTop: 4 }}>
          Semak order lepas, cari ikut receipt/customer, dan buka detail item bila perlu.
        </p>
      </div>

      {/* Filter form */}
      <form
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 10,
          background: "var(--d-surface)",
          border: "1px solid var(--d-border)",
          borderRadius: 14,
          padding: "14px 16px",
          marginBottom: 16,
        }}
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Search receipt / customer"
          style={inputStyle}
        />

        <select name="status" defaultValue={status} style={inputStyle}>
          <option value="all">All status</option>
          <option value="pending">Pending</option>
          <option value="preparing">Preparing</option>
          <option value="ready">Ready</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select name="payment" defaultValue={payment} style={inputStyle}>
          <option value="all">All payment</option>
          <option value="fpx">FPX</option>
          <option value="cash">Cash</option>
          <option value="qr">QR</option>
          <option value="card">Card</option>
        </select>

        <select name="source" defaultValue={source} style={inputStyle}>
          <option value="all">All source</option>
          <option value="pos">POS</option>
          <option value="customer_web">Web App</option>
        </select>

        <select name="range" defaultValue={range} style={inputStyle}>
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="all">All time</option>
        </select>

        <button
          type="submit"
          style={{
            padding: "9px 18px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            background: "var(--d-accent)",
            border: "none",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Filter
        </button>
      </form>

      {sourceFilterUnavailable && (
        <p style={{ marginBottom: 12, fontSize: 12, color: "var(--d-warning)" }}>
          Source filter needs `orders.order_source` column. Please run migration first.
        </p>
      )}

      {/* Orders list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {orders.length === 0 && (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              background: "var(--d-surface)",
              border: "1px solid var(--d-border)",
              borderRadius: 14,
            }}
          >
            <p style={{ fontSize: 14, color: "var(--d-text-2)" }}>No orders found.</p>
          </div>
        )}

        {orders.map(order => {
          const displayNumber = order.receipt_number || order.order_number || order.id.slice(0, 8);

          const orderItems = (order.order_items || []) as Array<{
            id: string;
            product_name_snapshot: string | null;
            variant_id: string | null;
            sugar_level: string | null;
            price: number | null;
            qty: number | null;
            line_total: number | null;
            order_item_addons: Array<{ addon_name: string | null }>;
          }>;
          const itemCount = orderItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
          const normalizedStatus = normalizeOrderStatus(order.status);
          const normalizedSource = normalizeOrderSource(
            sourceColumnAvailable ? String((order as { order_source?: string | null }).order_source || "") : null
          );
          const statusIndex = ORDER_STATUS_STEPS.indexOf(normalizedStatus as (typeof ORDER_STATUS_STEPS)[number]);

          return (
            <div
              key={order.id}
              style={{
                background: "var(--d-surface)",
                border: "1px solid var(--d-border)",
                borderRadius: 14,
                padding: "16px 18px",
              }}
            >
              {/* Order header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                {/* Left */}
                <div>
                  <p style={{ fontFamily: "monospace", fontSize: 12, letterSpacing: "0.08em", color: "var(--d-text-3)", fontWeight: 600 }}>
                    ORDER #{displayNumber}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--d-text-3)", marginTop: 3 }}>
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                  {order.customer_name && (
                    <p style={{ fontSize: 12, color: "var(--d-text-2)", marginTop: 3 }}>
                      Customer: {order.customer_name}
                    </p>
                  )}
                  <div style={{ marginTop: 8 }}>
                    <span style={{ ...badgePillStyle, ...orderSourceBadgeStyle(normalizedSource) }}>
                      {formatOrderSource(normalizedSource)}
                    </span>
                  </div>
                </div>

                {/* Right */}
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 18, fontWeight: 700, color: "var(--d-text-1)" }}>
                    RM {Number(order.total || 0).toFixed(2)}
                  </p>
                  <div style={{ marginTop: 6 }}>
                    <span style={{ ...badgePillStyle, ...orderStatusBadgeStyle(normalizedStatus) }}>
                      {formatOrderStatus(normalizedStatus)}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: "var(--d-text-3)", marginTop: 5, textTransform: "capitalize" }}>
                    {order.payment_method} · {order.payment_status}
                  </p>
                  <a
                    href={`/api/orders/receipt/${order.id}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-block",
                      marginTop: 8,
                      padding: "4px 12px",
                      borderRadius: 7,
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--d-text-2)",
                      border: "1px solid var(--d-border)",
                      textDecoration: "none",
                    }}
                  >
                    Print
                  </a>
                </div>
              </div>

              {/* Status timeline */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 14 }}>
                {ORDER_STATUS_STEPS.map((step, idx) => {
                  const isCurrent = normalizedStatus === step;
                  const isDone = normalizedStatus !== "cancelled" && statusIndex >= 0 && idx <= statusIndex;
                  let stepStyle: React.CSSProperties;
                  if (isCurrent) {
                    stepStyle = {
                      background: "var(--d-accent-soft)",
                      border: "1px solid var(--d-accent)",
                      color: "var(--d-accent)",
                    };
                  } else if (isDone) {
                    stepStyle = {
                      background: "var(--d-surface-hover)",
                      border: "1px solid var(--d-border)",
                      color: "var(--d-text-2)",
                    };
                  } else {
                    stepStyle = {
                      background: "transparent",
                      border: "1px solid var(--d-border-soft)",
                      color: "var(--d-text-3)",
                    };
                  }
                  return (
                    <div
                      key={step}
                      style={{
                        ...stepStyle,
                        borderRadius: 7,
                        padding: "5px 4px",
                        textAlign: "center",
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {step}
                    </div>
                  );
                })}
              </div>

              {normalizedStatus === "cancelled" && (
                <p style={{ marginTop: 8, fontSize: 12, color: "var(--d-error)" }}>Order cancelled</p>
              )}

              <OrderStatusActions
                orderId={order.id}
                currentStatus={order.status}
                paymentStatus={order.payment_status}
                total={Number(order.total || 0)}
              />

              {/* Items expandable */}
              <details
                style={{
                  marginTop: 12,
                  borderRadius: 10,
                  border: "1px solid var(--d-border-soft)",
                  background: "var(--d-surface-hover)",
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    listStyle: "none",
                    padding: "9px 14px",
                    fontSize: 13,
                    color: "var(--d-text-2)",
                    fontWeight: 500,
                  }}
                >
                  View items ({itemCount})
                </summary>

                <div
                  style={{
                    borderTop: "1px solid var(--d-border-soft)",
                    padding: "10px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {orderItems.map((item, i) => {
                    const baseName = item.product_name_snapshot || "Item";
                    const variantName = item.variant_id ? variantNameById.get(item.variant_id) || "" : "";
                    const addonNames = (item.order_item_addons || [])
                      .map(addon => addon.addon_name)
                      .filter((addon): addon is string => Boolean(addon));
                    const lowerBase = baseName.toLowerCase();
                    const hasVariantInBase = !!variantName && lowerBase.includes(`(${variantName.toLowerCase()})`);
                    const missingAddons = addonNames.filter(addon => !lowerBase.includes(addon.toLowerCase()));
                    const fullName =
                      `${baseName}${variantName && !hasVariantInBase ? ` (${variantName})` : ""}` +
                      `${missingAddons.length ? ` + ${missingAddons.join(", ")}` : ""}`;
                    const sugarText = formatSugarLevel(item.sugar_level);
                    const calculatedTotal = item.line_total ?? Number(item.price || 0) * Number(item.qty || 0);

                    return (
                      <div
                        key={i}
                        style={{
                          borderRadius: 8,
                          border: "1px solid var(--d-border)",
                          background: "var(--d-surface)",
                          padding: "8px 10px",
                          fontSize: 13,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 12,
                        }}
                      >
                        <span style={{ color: "var(--d-text-2)" }}>
                          {fullName} ×{item.qty}
                          {sugarText ? ` · Sugar: ${sugarText}` : ""}
                        </span>
                        <span style={{ color: "var(--d-text-1)", fontWeight: 600, whiteSpace: "nowrap" }}>
                          RM {Number(calculatedTotal).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}
