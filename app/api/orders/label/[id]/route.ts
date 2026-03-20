import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";
import { buildAllCupLabelsHtml } from "@/lib/cup-label";

function formatSugarLevel(value: string | null | undefined) {
  const key = String(value || "").toLowerCase();
  if (!key || key === "null") return null;
  if (key === "normal") return "Normal Sugar";
  if (key === "less") return "Less Sugar";
  if (key === "half") return "Half Sugar";
  if (key === "none") return "No Sugar";
  return key;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const orderId = String(id || "").trim();
  if (!orderId) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    // Fetch order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, receipt_number, created_at, customer_name")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    // Fetch items (try with sugar_level, fallback without)
    let items: Array<{
      id: string;
      product_name_snapshot: string | null;
      variant_id: string | null;
      sugar_level: string | null;
      price: number | null;
      qty: number | null;
    }> = [];

    const { data: itemRows, error: itemsError } = await supabase
      .from("order_items")
      .select("id, product_name_snapshot, variant_id, sugar_level, qty")
      .eq("order_id", orderId);

    if (itemsError) {
      const { data: fallbackRows, error: fallbackError } = await supabase
        .from("order_items")
        .select("id, product_name_snapshot, variant_id, qty")
        .eq("order_id", orderId);

      if (fallbackError) return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      items = (fallbackRows || []).map((r: { id: string; product_name_snapshot: string | null; variant_id: string | null; qty: number | null }) => ({
        ...r, sugar_level: null, price: null,
      }));
    } else {
      items = (itemRows || []) as typeof items;
    }

    if (items.length === 0) {
      return NextResponse.json({ error: "No items found for this order" }, { status: 404 });
    }

    // Fetch variant names
    const variantIds = Array.from(new Set(items.map(i => i.variant_id).filter(Boolean))) as string[];
    const variantNameById = new Map<string, string>();
    if (variantIds.length > 0) {
      try {
        const { data: variants } = await supabase.from("product_variants").select("id, name").in("id", variantIds);
        for (const v of variants || []) variantNameById.set(v.id, v.name);
      } catch { /* skip */ }
    }

    // Fetch addons
    const itemIds = items.map(i => i.id);
    const addonsByItemId = new Map<string, string[]>();
    if (itemIds.length > 0) {
      try {
        const { data: addonRows } = await supabase
          .from("order_item_addons")
          .select("order_item_id, addon_name_snapshot, addon_id")
          .in("order_item_id", itemIds);

        // Resolve names
        const missingNameIds = (addonRows || [])
          .filter((r: { addon_name_snapshot?: string | null }) => !r.addon_name_snapshot)
          .map((r: { addon_id?: string | null }) => String(r.addon_id || "").trim())
          .filter(Boolean);

        const addonNameById = new Map<string, string>();
        if (missingNameIds.length > 0) {
          const { data: names } = await supabase.from("product_addons").select("id, name").in("id", missingNameIds);
          for (const n of names || []) addonNameById.set(String(n.id), String(n.name || ""));
        }

        for (const row of addonRows || []) {
          const itemId = String((row as { order_item_id?: string }).order_item_id || "").trim();
          if (!itemId) continue;
          const list = addonsByItemId.get(itemId) || [];
          const name = String((row as { addon_name_snapshot?: string | null }).addon_name_snapshot || "") ||
            addonNameById.get(String((row as { addon_id?: string | null }).addon_id || "").trim()) || "";
          if (name) list.push(name);
          addonsByItemId.set(itemId, list);
        }
      } catch { /* skip addons if table doesn't exist */ }
    }

    // Build label items
    const labelItems = items.map(item => ({
      name: item.product_name_snapshot || "Item",
      variant_name: item.variant_id ? variantNameById.get(item.variant_id) || null : null,
      addon_names: addonsByItemId.get(item.id) || [],
      sugar_level: formatSugarLevel(item.sugar_level),
      qty: Number(item.qty || 1),
    }));

    // Derive site URL from request for QR code
    const requestUrl = new URL(_req.url);
    const siteUrl = `${requestUrl.protocol}//${requestUrl.host}`;

    const html = buildAllCupLabelsHtml({
      receiptNumber: order.receipt_number || orderId.slice(0, 8),
      customerName: order.customer_name,
      createdAt: order.created_at,
      orderId: orderId,
      items: labelItems,
      siteUrl,
      autoPrint: true,
    });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Cup label error:", error);
    const message = error instanceof Error ? error.message : "Failed to generate cup label";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
