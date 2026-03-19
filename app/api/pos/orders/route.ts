import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";

type ItemAddonRow = {
  order_item_id?: string | null;
  order_item?: string | null;
  order_items_id?: string | null;
  addon_name_snapshot?: string | null;
  addon_name?: string | null;
  name?: string | null;
  addon_id?: string | null;
};

function pickAddonItemId(row: ItemAddonRow) {
  return String(row.order_item_id || row.order_item || row.order_items_id || "").trim();
}
function pickAddonName(row: ItemAddonRow) {
  return String(row.addon_name_snapshot || row.addon_name || row.name || "").trim();
}
function formatSugarLevel(value: string | null | undefined) {
  const key = String(value || "").toLowerCase();
  if (!key || key === "null") return null;
  if (key === "normal") return "Normal Sugar";
  if (key === "less") return "Less Sugar";
  if (key === "half") return "Half Sugar";
  if (key === "none") return "No Sugar";
  return key;
}

export async function GET(req: Request) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("order_id");

  if (!orderId) {
    return NextResponse.json({ error: "order_id required" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    // Fetch order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, receipt_number, created_at, customer_name, payment_method, subtotal, discount_value, total, status")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    // Fetch items — try with sugar_level first, fallback without it
    let items: Array<{ id: string; product_name_snapshot: string | null; variant_id: string | null; sugar_level: string | null; price: number | null; qty: number | null; line_total: number | null }> = [];

    const { data: itemRows, error: itemsError } = await supabase
      .from("order_items")
      .select("id, product_name_snapshot, variant_id, sugar_level, price, qty, line_total")
      .eq("order_id", orderId);

    if (itemsError) {
      // sugar_level column might not exist — retry without it
      const { data: fallbackRows, error: fallbackError } = await supabase
        .from("order_items")
        .select("id, product_name_snapshot, variant_id, price, qty, line_total")
        .eq("order_id", orderId);

      if (fallbackError) return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      items = (fallbackRows || []).map((r: { id: string; product_name_snapshot: string | null; variant_id: string | null; price: number | null; qty: number | null; line_total: number | null }) => ({ ...r, sugar_level: null }));
    } else {
      items = (itemRows || []) as typeof items;
    }

    // Fetch variant names
    const variantIds = Array.from(new Set(items.map((i: { variant_id: string | null }) => i.variant_id).filter(Boolean))) as string[];
    const variantNameById = new Map<string, string>();
    if (variantIds.length > 0) {
      try {
        const { data: variants } = await supabase.from("product_variants").select("id, name").in("id", variantIds);
        for (const v of variants || []) variantNameById.set(v.id, v.name);
      } catch {
        // product_variants table might not exist — skip
      }
    }

    // Fetch addons (wrapped in try-catch — table might not exist)
    const itemIds = items.map((i: { id: string }) => i.id);
    let addonRows: ItemAddonRow[] = [];
    if (itemIds.length > 0) {
      try {
        const { data: rows, error: err } = await supabase.from("order_item_addons").select("*").in("order_item_id", itemIds);
        if (err) {
          const { data: fb } = await supabase.from("order_item_addons").select("*").in("order_item", itemIds);
          addonRows = (fb || []) as ItemAddonRow[];
        } else {
          addonRows = (rows || []) as ItemAddonRow[];
        }
      } catch {
        // order_item_addons table might not exist — skip addons silently
        addonRows = [];
      }
    }

    // Resolve missing addon names (skip if no addons)
    const missingIds = Array.from(new Set(addonRows.filter(r => !pickAddonName(r)).map(r => String(r.addon_id || "").trim()).filter(Boolean)));
    const addonNameById = new Map<string, string>();
    if (missingIds.length > 0) {
      try {
        const { data: names } = await supabase.from("product_addons").select("id, name").in("id", missingIds);
        for (const n of names || []) addonNameById.set(String(n.id), String(n.name || ""));
      } catch {
        // skip
      }
    }

    const addonsByItemId = new Map<string, string[]>();
    for (const row of addonRows) {
      const id = pickAddonItemId(row);
      if (!id) continue;
      const list = addonsByItemId.get(id) || [];
      const name = pickAddonName(row) || addonNameById.get(String(row.addon_id || "").trim()) || "";
      if (name) list.push(name);
      addonsByItemId.set(id, list);
    }

    const enrichedItems = items.map((item: { id: string; product_name_snapshot: string | null; variant_id: string | null; sugar_level: string | null; price: number | null; qty: number | null; line_total: number | null }) => {
      const variantName = item.variant_id ? variantNameById.get(item.variant_id) || null : null;
      const addons = addonsByItemId.get(item.id) || [];
      return {
        name: item.product_name_snapshot || "Item",
        variant_name: variantName,
        addon_names: addons,
        sugar_level: formatSugarLevel(item.sugar_level),
        price: Number(item.price || 0),
        qty: Number(item.qty || 0),
        line_total: Number(item.line_total || 0),
      };
    });

    return NextResponse.json({
      order: {
        id: order.id,
        receipt_number: order.receipt_number,
        created_at: order.created_at,
        customer_name: order.customer_name,
        payment_method: order.payment_method,
        subtotal: Number(order.subtotal || 0),
        discount_value: Number(order.discount_value || 0),
        total: Number(order.total || 0),
        status: order.status,
      },
      items: enrichedItems,
    });
  } catch (error) {
    console.error("POS order detail error:", error);
    const message = error instanceof Error ? error.message : "Failed to load order detail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
