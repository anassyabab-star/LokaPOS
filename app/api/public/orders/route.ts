import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";
import {
  calculateCustomerOrderItems,
  generateOrderNumber,
  insertOrderItemAddonsWithFallback,
} from "@/lib/customer-orders";

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

// ── PUBLIC: Guest order creation (no auth required) ──────────────────────────
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const customerName = String(body.customer_name || "").trim();
  const customerPhone = String(body.customer_phone || "").trim();
  const paymentMethod = String(body.payment_method || "fpx").trim().toLowerCase();

  if (!customerName) return NextResponse.json({ error: "Nama diperlukan" }, { status: 400 });
  if (!customerPhone || customerPhone.replace(/[^\d]/g, "").length < 8) {
    return NextResponse.json({ error: "No telefon tidak sah" }, { status: 400 });
  }
  const requestItems = Array.isArray(body.items) ? body.items : null;
  if (!requestItems || requestItems.length === 0) {
    return NextResponse.json({ error: "Sekurang-kurangnya satu item diperlukan" }, { status: 400 });
  }

  try {
    const parsedItems = (requestItems as Record<string, unknown>[]).map(raw => ({
      product_id: String(raw.product_id || "").trim(),
      variant_id: String(raw.variant_id || "").trim() || null,
      addon_ids: Array.isArray(raw.addon_ids)
        ? (raw.addon_ids as unknown[]).map(v => String(v || "").trim()).filter(Boolean)
        : [],
      sugar_level: String(raw.sugar_level || "").trim() || null,
      qty: Number(raw.qty || 0),
    }));

    const calculated = await calculateCustomerOrderItems(parsedItems);
    const numbering = await generateOrderNumber();
    const supabase = createSupabaseAdminClient();

    // Find or create customer by phone
    const normalizedPhone = customerPhone.replace(/[^\d+]/g, "");
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", normalizedPhone)
      .maybeSingle();

    let customerId: string | null = existingCustomer?.id || null;

    if (!customerId) {
      const { data: newCustomer } = await supabase
        .from("customers")
        .insert([{ name: customerName, phone: normalizedPhone }])
        .select("id")
        .maybeSingle();
      customerId = newCustomer?.id || null;
    }

    const orderBase = {
      receipt_number: numbering.orderNumber,
      date_key: numbering.dateKey,
      customer_name: customerName,
      customer_id: customerId,
      subtotal: calculated.subtotal,
      discount_type: "none",
      discount_value: 0,
      total: calculated.subtotal,
      payment_method: paymentMethod,
      cash_received: 0,
      balance: 0,
      status: "pending",
      payment_status: "pending",
    };

    let orderInsert = await supabase
      .from("orders")
      .insert([{ ...orderBase, order_source: "customer_web" }])
      .select("id")
      .single();

    if (orderInsert.error?.message?.toLowerCase().includes("order_source")) {
      orderInsert = await supabase.from("orders").insert([orderBase]).select("id").single();
    }

    const { data: order, error: orderError } = orderInsert;
    if (orderError || !order) {
      return NextResponse.json({ error: orderError?.message || "Gagal buat order" }, { status: 500 });
    }

    for (const item of calculated.items) {
      let itemInsert = await supabase
        .from("order_items")
        .insert([{
          order_id: order.id,
          product_id: item.product_id,
          product_name_snapshot: item.product_name_snapshot,
          variant_id: item.variant_id,
          sugar_level: item.sugar_level,
          price: item.unit_price,
          qty: item.qty,
          line_total: item.line_total,
        }])
        .select("id")
        .single();

      if (itemInsert.error?.message?.toLowerCase().includes("sugar_level")) {
        itemInsert = await supabase
          .from("order_items")
          .insert([{
            order_id: order.id,
            product_id: item.product_id,
            product_name_snapshot: item.product_name_snapshot,
            variant_id: item.variant_id,
            price: item.unit_price,
            qty: item.qty,
            line_total: item.line_total,
          }])
          .select("id")
          .single();
      }

      if (itemInsert.error) {
        return NextResponse.json({ error: itemInsert.error.message }, { status: 500 });
      }

      if (itemInsert.data && item.addon_snapshots.length > 0) {
        await insertOrderItemAddonsWithFallback(itemInsert.data.id, item.addon_snapshots);
      }
    }

    // Decrement stock
    for (const [productId, requestedQty] of calculated.requestedQtyByProductId.entries()) {
      const { error: rpcError } = await supabase.rpc("decrement_stock", {
        p_product_id: productId,
        p_qty: requestedQty,
      });
      if (rpcError && (rpcError.message?.includes("does not exist") || rpcError.message?.includes("schema cache"))) {
        const { data: product } = await supabase.from("products").select("stock").eq("id", productId).single();
        const updatedStock = Math.max(0, Number(product?.stock || 0) - requestedQty);
        await supabase.from("products").update({ stock: updatedStock }).eq("id", productId);
      }
    }

    return NextResponse.json({
      success: true,
      order_id: order.id,
      order_number: numbering.orderNumber,
      total: calculated.subtotal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal buat order";
    const status = message.toLowerCase().includes("stock")
      ? 400
      : message.toLowerCase().includes("not found") || message.toLowerCase().includes("not available")
      ? 404
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
