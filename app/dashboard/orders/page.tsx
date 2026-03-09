import { createClient } from "@supabase/supabase-js";

type OrdersPageProps = {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    payment?: string;
    range?: string;
  }>;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type OrderItemAddonRow = {
  order_item_id?: string | null;
  order_item?: string | null;
  order_items_id?: string | null;
  addon_name_snapshot?: string | null;
  addon_name?: string | null;
  name?: string | null;
};

function pickAddonItemId(row: OrderItemAddonRow) {
  return String(row.order_item_id || row.order_item || row.order_items_id || "").trim();
}

function pickAddonName(row: OrderItemAddonRow) {
  return String(row.addon_name_snapshot || row.addon_name || row.name || "").trim();
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

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = (await searchParams) || {};
  const q = (params.q || "").trim();
  const status = params.status || "all";
  const payment = params.payment || "all";
  const range = params.range || "30d";

  let query = supabase
    .from("orders")
    .select(`
      id,
      receipt_number,
      order_number,
      created_at,
      customer_name,
      total,
      status,
      payment_method,
      payment_status
    `)
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  if (payment !== "all") {
    query = query.eq("payment_method", payment);
  }

  const fromDate = getFromDate(range);
  if (fromDate) {
    query = query.gte("created_at", fromDate);
  }

  if (q) {
    query = query.or(
      `receipt_number.ilike.%${q}%,customer_name.ilike.%${q}%`
    );
  }

  const { data: ordersRaw, error: ordersError } = await query.limit(200);
  if (ordersError || !ordersRaw) {
    return (
      <div className="min-h-screen bg-black p-4 text-gray-200 md:p-6">
        <h1 className="text-xl font-semibold">Orders History</h1>
        <p className="mt-3 text-sm text-red-400">
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
          .select("id, order_id, product_name_snapshot, variant_id, price, qty, line_total")
          .in("order_id", orderIds)
      : { data: [] };

  const itemIds = (orderItemsRaw || []).map(item => item.id);
  const variantIds = Array.from(
    new Set((orderItemsRaw || []).map(item => item.variant_id).filter(Boolean))
  ) as string[];

  const { data: variantsRaw } =
    variantIds.length > 0
      ? await supabase
          .from("product_variants")
          .select("id, name")
          .in("id", variantIds)
      : { data: [] };

  let orderItemAddonsRaw: OrderItemAddonRow[] = [];
  if (itemIds.length > 0) {
    const { data: primaryAddons, error: primaryAddonsError } = await supabase
      .from("order_item_addons")
      .select("*")
      .in("order_item_id", itemIds);

    if (primaryAddonsError) {
      const { data: fallbackAddons, error: fallbackAddonsError } = await supabase
        .from("order_item_addons")
        .select("*")
        .in("order_item", itemIds);
      if (!fallbackAddonsError) {
        orderItemAddonsRaw = (fallbackAddons || []) as OrderItemAddonRow[];
      }
    } else {
      orderItemAddonsRaw = (primaryAddons || []) as OrderItemAddonRow[];
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
    const addonName = pickAddonName(addon);
    existing.push({ addon_name: addonName || null });
    addonsByOrderItemId.set(orderItemId, existing);
  }

  const itemsByOrderId = new Map<
    string,
    Array<{
      id: string;
      product_name_snapshot: string | null;
      variant_id: string | null;
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
    <div className="min-h-screen bg-black p-4 text-gray-200 md:p-6">
      <h1 className="text-xl font-semibold">Orders History</h1>
      <p className="mt-1 text-sm text-gray-400">
        Semak order lepas, cari ikut receipt/customer, dan buka detail item bila perlu.
      </p>

      <form className="mt-4 grid grid-cols-1 gap-2 rounded-xl border border-gray-800 bg-[#111] p-3 md:grid-cols-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search receipt / customer"
          className="rounded border border-gray-700 bg-black px-3 py-2 text-sm"
        />

        <select
          name="status"
          defaultValue={status}
          className="rounded border border-gray-700 bg-black px-3 py-2 text-sm"
        >
          <option value="all">All status</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          name="payment"
          defaultValue={payment}
          className="rounded border border-gray-700 bg-black px-3 py-2 text-sm"
        >
          <option value="all">All payment</option>
          <option value="cash">Cash</option>
          <option value="qr">QR</option>
          <option value="card">Card</option>
        </select>

        <div className="flex gap-2">
          <select
            name="range"
            defaultValue={range}
            className="w-full rounded border border-gray-700 bg-black px-3 py-2 text-sm"
          >
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
          <button
            type="submit"
            className="rounded bg-[#7F1D1D] px-4 py-2 text-sm font-medium text-white"
          >
            Filter
          </button>
        </div>
      </form>

      <div className="mt-4 space-y-3">
        {orders?.map(order => {
          const displayNumber =
            order.receipt_number || order.order_number || order.id.slice(0, 8);

          const itemCount = (order.order_items || []).reduce(
            (sum, item) => sum + Number(item.qty || 0),
            0
          );

          return (
            <div key={order.id} className="rounded-xl border border-gray-800 bg-[#111] p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs tracking-wider text-gray-400 md:text-sm">
                    ORDER #{displayNumber}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                  {order.customer_name ? (
                    <p className="mt-1 text-xs text-gray-300">Customer: {order.customer_name}</p>
                  ) : null}
                </div>

                <div className="text-right">
                  <p className="text-base font-semibold md:text-lg">RM {Number(order.total || 0).toFixed(2)}</p>
                  <p className="text-xs capitalize text-gray-400">
                    {order.payment_method} • {order.status}
                  </p>
                  <a
                    href={`/api/orders/receipt/${order.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block rounded border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:border-gray-500 hover:text-white"
                  >
                    Print
                  </a>
                </div>
              </div>

              <details className="mt-3 rounded-lg border border-gray-800 bg-black/30">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm text-gray-300">
                  View items ({itemCount})
                </summary>

                <div className="space-y-2 border-t border-gray-800 px-3 py-3 text-sm">
                  {order.order_items?.map((item, i) => {
                    const baseName = item.product_name_snapshot || "Item";
                    const variantName = item.variant_id
                      ? variantNameById.get(item.variant_id) || ""
                      : "";
                    const addonNames = (item.order_item_addons || [])
                      .map(addon => addon.addon_name)
                      .filter((addon): addon is string => Boolean(addon));
                    const lowerBase = baseName.toLowerCase();
                    const hasVariantInBase =
                      !!variantName &&
                      lowerBase.includes(`(${variantName.toLowerCase()})`);
                    const missingAddons = addonNames.filter(
                      addon => !lowerBase.includes(addon.toLowerCase())
                    );
                    const fullName =
                      `${baseName}${variantName && !hasVariantInBase ? ` (${variantName})` : ""}` +
                      `${missingAddons.length ? ` + ${missingAddons.join(", ")}` : ""}`;
                    const calculatedTotal =
                      item.line_total ?? Number(item.price || 0) * Number(item.qty || 0);

                    return (
                      <div key={i} className="rounded-md border border-gray-800 bg-[#101010] px-2 py-1.5">
                        <div className="flex items-start justify-between gap-3 text-gray-300">
                          <span>
                            {fullName} x{item.qty}
                          </span>
                          <span>RM {Number(calculatedTotal).toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            </div>
          );
        })}

        {orders?.length === 0 && <p className="text-gray-500">No orders found.</p>}
      </div>
    </div>
  );
}
