import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isMissingRelationError } from "@/lib/customer-api";

export const LOYALTY_REDEEM_RM_PER_POINT = 0.05; // 100 pts = RM5
export const LOYALTY_REDEEM_MIN_POINTS = 100;
export const LOYALTY_REDEEM_MAX_RATIO = 0.3; // max 30% per order

export type CustomerOrderRequestItem = {
  product_id: string;
  variant_id?: string | null;
  addon_ids?: string[];
  sugar_level?: string | null;
  qty: number;
};

export type CalculatedOrderItem = {
  product_id: string;
  product_name_snapshot: string;
  variant_id: string | null;
  variant_name: string | null;
  sugar_level: string | null;
  qty: number;
  unit_price: number;
  line_total: number;
  addon_snapshots: Array<{ id: string; name: string; price: number }>;
};

type ProductRow = {
  id: string;
  name: string;
  price: number | null;
  stock: number | null;
  is_active: boolean | null;
};

type VariantRow = {
  id: string;
  product_id: string;
  name: string;
  price_adjustment: number | null;
};

type AddonRow = {
  id: string;
  product_id: string;
  name: string;
  price: number | null;
};

type OrderItemRow = {
  id: string;
  product_name_snapshot: string | null;
  variant_id: string | null;
  sugar_level: string | null;
  price: number | null;
  qty: number | null;
  line_total: number | null;
};

type ItemAddonRow = {
  order_item_id?: string | null;
  order_item?: string | null;
  order_items_id?: string | null;
  addon_id?: string | null;
  addon_name_snapshot?: string | null;
  addon_name?: string | null;
  name?: string | null;
};

type VariantNameRow = {
  id: string;
  name: string;
};

export function normalizeSugarLevel(value: string | null | undefined) {
  const key = String(value || "normal").trim().toLowerCase();
  if (key === "normal" || key === "less" || key === "half" || key === "none") return key;
  return "normal";
}

export function formatSugarLevel(value: string | null | undefined) {
  const key = String(value || "").toLowerCase();
  if (!key || key === "normal") return "Normal";
  if (key === "less") return "Less";
  if (key === "half") return "Half";
  if (key === "none") return "No Sugar";
  return key;
}

export async function generateOrderNumber() {
  const supabase = createSupabaseAdminClient();
  const today = new Date();
  const dateKey = today.toISOString().slice(0, 10);
  const datePart = today.toLocaleDateString("en-GB").split("/").join("");

  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("date_key", dateKey);

  if (error) throw new Error(error.message);

  const orderNumber = (count || 0) + 1;
  const formattedNumber = String(orderNumber).padStart(3, "0");
  return {
    dateKey,
    orderNumber: `${datePart}-${formattedNumber}`,
  };
}

export async function calculateCustomerOrderItems(items: CustomerOrderRequestItem[]) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("At least one item is required");
  }

  const supabase = createSupabaseAdminClient();
  const productIds = Array.from(
    new Set(items.map(item => String(item.product_id || "").trim()).filter(Boolean))
  );
  if (productIds.length === 0) {
    throw new Error("Invalid items payload");
  }

  const { data: productsData, error: productsError } = await supabase
    .from("products")
    .select("id,name,price,stock,is_active")
    .in("id", productIds);
  if (productsError) throw new Error(productsError.message);

  const productById = new Map<string, ProductRow>();
  for (const row of (productsData || []) as ProductRow[]) {
    productById.set(row.id, row);
  }

  const variantIds = Array.from(
    new Set(items.map(item => String(item.variant_id || "").trim()).filter(Boolean))
  );
  const addonIds = Array.from(
    new Set(items.flatMap(item => (Array.isArray(item.addon_ids) ? item.addon_ids : [])))
  ).filter(Boolean);

  const variantById = new Map<string, VariantRow>();
  if (variantIds.length > 0) {
    const { data: variantsData, error: variantsError } = await supabase
      .from("product_variants")
      .select("id,product_id,name,price_adjustment")
      .in("id", variantIds);
    if (variantsError) throw new Error(variantsError.message);
    for (const row of (variantsData || []) as VariantRow[]) {
      variantById.set(row.id, row);
    }
  }

  const addonById = new Map<string, AddonRow>();
  if (addonIds.length > 0) {
    const { data: addonsData, error: addonsError } = await supabase
      .from("product_addons")
      .select("id,product_id,name,price")
      .in("id", addonIds);
    if (addonsError) throw new Error(addonsError.message);
    for (const row of (addonsData || []) as AddonRow[]) {
      addonById.set(row.id, row);
    }
  }

  const qtyByProductId = new Map<string, number>();
  const calculatedItems: CalculatedOrderItem[] = [];
  let subtotal = 0;

  for (const rawItem of items) {
    const productId = String(rawItem.product_id || "").trim();
    const qtyNum = Number(rawItem.qty || 0);
    const qty = Number.isFinite(qtyNum) ? Math.floor(qtyNum) : 0;
    if (qty <= 0) {
      throw new Error("Invalid qty in order item");
    }
    const product = productById.get(productId);
    if (!product) throw new Error("Product not found");
    if (product.is_active === false) throw new Error(`${product.name} is not available`);

    const currentQty = qtyByProductId.get(productId) || 0;
    qtyByProductId.set(productId, currentQty + qty);

    let unitPrice = Number(product.price || 0);
    let variantId: string | null = null;
    let variantName: string | null = null;

    const requestedVariantId = String(rawItem.variant_id || "").trim();
    if (requestedVariantId) {
      const variant = variantById.get(requestedVariantId);
      if (!variant || variant.product_id !== productId) {
        throw new Error(`Invalid variant for ${product.name}`);
      }
      variantId = variant.id;
      variantName = variant.name;
      unitPrice += Number(variant.price_adjustment || 0);
    }

    const addonSnapshots: Array<{ id: string; name: string; price: number }> = [];
    const requestedAddonIds = Array.isArray(rawItem.addon_ids) ? rawItem.addon_ids : [];
    for (const requestedAddonId of requestedAddonIds) {
      const addonId = String(requestedAddonId || "").trim();
      if (!addonId) continue;
      const addon = addonById.get(addonId);
      if (!addon || addon.product_id !== productId) {
        throw new Error(`Invalid addon for ${product.name}`);
      }
      const addonPrice = Number(addon.price || 0);
      unitPrice += addonPrice;
      addonSnapshots.push({ id: addon.id, name: addon.name, price: addonPrice });
    }

    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;

    calculatedItems.push({
      product_id: productId,
      product_name_snapshot: product.name,
      variant_id: variantId,
      variant_name: variantName,
      sugar_level: normalizeSugarLevel(rawItem.sugar_level),
      qty,
      unit_price: unitPrice,
      line_total: lineTotal,
      addon_snapshots: addonSnapshots,
    });
  }

  // Stock check after aggregation to avoid false pass on duplicate same product lines
  for (const [productId, requestedQty] of qtyByProductId.entries()) {
    const product = productById.get(productId);
    if (!product) continue;
    const stock = Number(product.stock || 0);
    if (stock < requestedQty) {
      throw new Error(`Stock not enough for ${product.name}`);
    }
  }

  return { items: calculatedItems, subtotal, requestedQtyByProductId: qtyByProductId };
}

export async function getLoyaltyPoints1y(customerId: string) {
  const supabase = createSupabaseAdminClient();
  const cutoffIso = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("loyalty_ledger")
    .select("points_change")
    .eq("customer_id", customerId)
    .gte("created_at", cutoffIso)
    .limit(5000);

  if (error) {
    if (isMissingRelationError(error.message)) return 0;
    throw new Error(error.message);
  }

  return (data || []).reduce((sum, row) => sum + Number(row.points_change || 0), 0);
}

export function calculateRedeem(
  requestedRedeemPoints: number,
  availablePoints: number,
  subtotal: number
) {
  const points = Math.max(0, Math.floor(Number(requestedRedeemPoints || 0)));
  if (points <= 0 || availablePoints <= 0) {
    return { redeem_points: 0, redeem_amount: 0 };
  }

  const maxAmountByRatio = subtotal * LOYALTY_REDEEM_MAX_RATIO;
  const maxPointsByRatio = Math.floor(maxAmountByRatio / LOYALTY_REDEEM_RM_PER_POINT);
  let appliedPoints = Math.min(points, availablePoints, maxPointsByRatio);
  if (appliedPoints < LOYALTY_REDEEM_MIN_POINTS) {
    appliedPoints = 0;
  }
  const redeemAmount = appliedPoints * LOYALTY_REDEEM_RM_PER_POINT;
  return { redeem_points: appliedPoints, redeem_amount: redeemAmount };
}

export async function insertOrderItemAddonsWithFallback(
  orderItemId: string,
  addonSnapshots: Array<{ id: string; name: string; price: number }>
) {
  if (!addonSnapshots.length) return;
  const supabase = createSupabaseAdminClient();

  const payloadVariants = [
    addonSnapshots.map(addon => ({
      order_item_id: orderItemId,
      addon_id: addon.id,
      addon_name_snapshot: addon.name,
      addon_price_snapshot: addon.price,
    })),
    addonSnapshots.map(addon => ({
      order_item_id: orderItemId,
      addon_id: addon.id,
    })),
    addonSnapshots.map(addon => ({
      order_item: orderItemId,
      addon_id: addon.id,
      addon_name_snapshot: addon.name,
      addon_price_snapshot: addon.price,
    })),
    addonSnapshots.map(addon => ({
      order_item: orderItemId,
      addon_id: addon.id,
    })),
    addonSnapshots.map(addon => ({
      order_items_id: orderItemId,
      addon_id: addon.id,
    })),
  ];

  for (const payload of payloadVariants) {
    const { error } = await supabase.from("order_item_addons").insert(payload);
    if (!error) return;
    if (!isMissingRelationError(error.message)) {
      throw new Error(error.message);
    }
  }
}

function pickAddonItemId(row: ItemAddonRow) {
  return String(row.order_item_id || row.order_item || row.order_items_id || "").trim();
}

function pickAddonName(row: ItemAddonRow) {
  return String(row.addon_name_snapshot || row.addon_name || row.name || "").trim();
}

export function buildOrderItemDisplayName(
  item: OrderItemRow,
  variantNameById: Map<string, string>,
  addonsByItemId: Map<string, string[]>
) {
  const baseName = item.product_name_snapshot || "Item";
  const variantName = item.variant_id ? variantNameById.get(item.variant_id) || "" : "";
  const addonNames = addonsByItemId.get(item.id) || [];
  const lowerBase = baseName.toLowerCase();
  const hasVariantInBase = !!variantName && lowerBase.includes(`(${variantName.toLowerCase()})`);
  const missingAddons = addonNames.filter(addon => !lowerBase.includes(addon.toLowerCase()));
  const sugarText = formatSugarLevel(item.sugar_level);
  return (
    `${baseName}${variantName && !hasVariantInBase ? ` (${variantName})` : ""}` +
    `${missingAddons.length > 0 ? ` + ${missingAddons.join(", ")}` : ""}` +
    `${sugarText ? ` • Sugar: ${sugarText}` : ""}`
  );
}

export async function loadOrderItemsWithDisplay(orderId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: itemRows, error: itemsError } = await supabase
    .from("order_items")
    .select("id,product_name_snapshot,variant_id,sugar_level,price,qty,line_total")
    .eq("order_id", orderId)
    .order("id", { ascending: true });
  if (itemsError) throw new Error(itemsError.message);

  const items = (itemRows || []) as OrderItemRow[];
  const variantIds = Array.from(new Set(items.map(item => item.variant_id).filter(Boolean))) as string[];
  const itemIds = items.map(item => item.id);

  const variantNameById = new Map<string, string>();
  if (variantIds.length > 0) {
    const { data: variantsRows, error: variantsError } = await supabase
      .from("product_variants")
      .select("id,name")
      .in("id", variantIds);
    if (variantsError) throw new Error(variantsError.message);
    for (const row of (variantsRows || []) as VariantNameRow[]) {
      variantNameById.set(row.id, row.name);
    }
  }

  let addonRows: ItemAddonRow[] = [];
  if (itemIds.length > 0) {
    const { data: primaryRows, error: primaryError } = await supabase
      .from("order_item_addons")
      .select("*")
      .in("order_item_id", itemIds);

    if (primaryError) {
      const { data: fallbackRows, error: fallbackError } = await supabase
        .from("order_item_addons")
        .select("*")
        .in("order_item", itemIds);
      if (fallbackError) {
        const { data: thirdRows, error: thirdError } = await supabase
          .from("order_item_addons")
          .select("*")
          .in("order_items_id", itemIds);
        if (thirdError) {
          throw new Error(primaryError.message);
        }
        addonRows = (thirdRows || []) as ItemAddonRow[];
      } else {
        addonRows = (fallbackRows || []) as ItemAddonRow[];
      }
    } else {
      addonRows = (primaryRows || []) as ItemAddonRow[];
    }
  }

  const missingAddonNameIds = Array.from(
    new Set(
      addonRows
        .filter(row => !pickAddonName(row))
        .map(row => String(row.addon_id || "").trim())
        .filter(Boolean)
    )
  );
  const addonNameById = new Map<string, string>();
  if (missingAddonNameIds.length > 0) {
    const { data: addonRowsFromCatalog, error: addonNameError } = await supabase
      .from("product_addons")
      .select("id,name")
      .in("id", missingAddonNameIds);
    if (addonNameError) throw new Error(addonNameError.message);
    for (const row of addonRowsFromCatalog || []) {
      addonNameById.set(String(row.id), String(row.name || ""));
    }
  }

  const addonsByItemId = new Map<string, string[]>();
  for (const row of addonRows) {
    const itemId = pickAddonItemId(row);
    if (!itemId) continue;
    const list = addonsByItemId.get(itemId) || [];
    const fallbackName = addonNameById.get(String(row.addon_id || "").trim()) || "";
    const name = pickAddonName(row) || fallbackName;
    if (name) list.push(name);
    addonsByItemId.set(itemId, list);
  }

  return items.map(item => ({
    id: item.id,
    name: buildOrderItemDisplayName(item, variantNameById, addonsByItemId),
    qty: Number(item.qty || 0),
    unit_price: Number(item.price || 0),
    line_total: Number(item.line_total ?? Number(item.price || 0) * Number(item.qty || 0)),
    variant_id: item.variant_id,
    sugar_level: item.sugar_level,
    addons: addonsByItemId.get(item.id) || [],
  }));
}
