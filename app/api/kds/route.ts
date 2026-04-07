import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";

type OrderItemRow = {
  id: string;
  product_name_snapshot: string | null;
  variant_id: string | null;
  sugar_level: string | null;
  price: number | null;
  qty: number | null;
  line_total: number | null;
};

type AddonRow = {
  order_item_id?: string | null;
  order_item?: string | null;
  order_items_id?: string | null;
  addon_name_snapshot?: string | null;
  addon_name?: string | null;
  name?: string | null;
};

function pickAddonItemId(row: AddonRow) {
  return String(row.order_item_id || row.order_item || row.order_items_id || "").trim();
}
function pickAddonName(row: AddonRow) {
  return String(row.addon_name_snapshot || row.addon_name || row.name || "").trim();
}

function formatSugar(value: string | null | undefined) {
  const key = String(value || "").toLowerCase();
  if (!key || key === "null") return null;
  if (key === "normal") return "Normal";
  if (key === "less") return "Kurang Manis";
  if (key === "half") return "Separuh";
  if (key === "none") return "Kosong";
  return key;
}

export async function GET() {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const supabase = createSupabaseAdminClient();

  // Use open shift's opened_at date as date_key so overnight shifts
  // still show orders after midnight (same logic as orders GET route).
  let dateKey: string;
  const { data: openShift } = await supabase
    .from("pos_shifts")
    .select("opened_at")
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openShift?.opened_at) {
    dateKey = new Date(openShift.opened_at).toISOString().slice(0, 10);
  } else {
    dateKey = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" });
  }

  // Fetch active orders (pending, preparing, ready) for today
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id, receipt_number, customer_name, total, status, order_source, payment_status, created_at")
    .in("status", ["pending", "preparing", "ready"])
    .eq("date_key", dateKey)
    .order("created_at", { ascending: true });

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ orders: [] });
  }

  // Fetch all items for these orders in one query
  const orderIds = orders.map(o => o.id);
  const { data: allItems } = await supabase
    .from("order_items")
    .select("id, order_id, product_name_snapshot, variant_id, sugar_level, price, qty, line_total")
    .in("order_id", orderIds);

  // Fetch variant names
  const variantIds = [...new Set((allItems || []).map(i => i.variant_id).filter(Boolean))] as string[];
  const variantMap = new Map<string, string>();
  if (variantIds.length > 0) {
    const { data: variants } = await supabase
      .from("product_variants")
      .select("id, name")
      .in("id", variantIds);
    for (const v of variants || []) {
      variantMap.set(v.id, v.name);
    }
  }

  // Fetch addons for all items
  const itemIds = (allItems || []).map(i => i.id);
  const addonsByItemId = new Map<string, string[]>();
  if (itemIds.length > 0) {
    try {
      const { data: addons } = await supabase
        .from("order_item_addons")
        .select("order_item_id, order_item, order_items_id, addon_name_snapshot, addon_name, name")
        .in("order_item_id", itemIds);

      for (const row of (addons || []) as AddonRow[]) {
        const itemId = pickAddonItemId(row);
        const addonName = pickAddonName(row);
        if (!itemId || !addonName) continue;
        const existing = addonsByItemId.get(itemId) || [];
        existing.push(addonName);
        addonsByItemId.set(itemId, existing);
      }
    } catch {
      // addon table might not exist — ignore
    }
  }

  // Build response: orders with nested items
  const result = orders.map(order => {
    const items = (allItems || [])
      .filter(i => i.order_id === order.id)
      .map(item => ({
        id: item.id,
        name: item.product_name_snapshot || "—",
        variant: item.variant_id ? (variantMap.get(item.variant_id) || null) : null,
        sugar: formatSugar(item.sugar_level),
        addons: addonsByItemId.get(item.id) || [],
        qty: Number(item.qty || 1),
        price: Number(item.price || 0),
      }));

    const elapsed = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000);

    return {
      id: order.id,
      receipt_number: order.receipt_number,
      customer_name: order.customer_name || "Walk-in",
      status: order.status,
      order_source: order.order_source,
      payment_status: order.payment_status,
      created_at: order.created_at,
      elapsed_seconds: elapsed,
      items,
    };
  });

  return NextResponse.json({ orders: result });
}
