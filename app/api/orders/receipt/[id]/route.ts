import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";
import { buildReceiptHtml, type ReceiptItemLine } from "@/lib/receipt-print";

type OrderRow = {
  id: string;
  receipt_number: string | null;
  created_at: string;
  customer_name: string | null;
  payment_method: string | null;
  subtotal: number | null;
  discount_value: number | null;
  total: number | null;
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

type VariantRow = {
  id: string;
  name: string;
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

function formatSugarLevel(value: string | null | undefined) {
  const key = String(value || "").toLowerCase();
  if (!key) return "";
  if (key === "normal") return "Normal Sugar";
  if (key === "less") return "Less Sugar";
  if (key === "half") return "Half Sugar";
  if (key === "none") return "No Sugar";
  return key;
}

function toLineName(
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

function pickAddonItemId(row: ItemAddonRow) {
  return String(row.order_item_id || row.order_item || row.order_items_id || "").trim();
}

function pickAddonName(row: ItemAddonRow) {
  return String(row.addon_name_snapshot || row.addon_name || row.name || "").trim();
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

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id,receipt_number,created_at,customer_name,payment_method,subtotal,discount_value,total")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const orderRow = order as OrderRow;
    const { data: itemRows, error: itemsError } = await supabase
      .from("order_items")
      .select("id,product_name_snapshot,variant_id,sugar_level,price,qty,line_total")
      .eq("order_id", orderId);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    const items = (itemRows || []) as OrderItemRow[];
    const variantIds = Array.from(new Set(items.map(item => item.variant_id).filter(Boolean))) as string[];
    const itemIds = items.map(item => item.id);

    const { data: variantsRows, error: variantsError } =
      variantIds.length > 0
        ? await supabase.from("product_variants").select("id,name").in("id", variantIds)
        : { data: [], error: null };
    if (variantsError) {
      return NextResponse.json({ error: variantsError.message }, { status: 500 });
    }

    const variantNameById = new Map<string, string>();
    for (const row of (variantsRows || []) as VariantRow[]) {
      variantNameById.set(row.id, row.name);
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
            return NextResponse.json({ error: primaryError.message }, { status: 500 });
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
      const { data: addonNameRows } = await supabase
        .from("product_addons")
        .select("id,name")
        .in("id", missingAddonNameIds);

      for (const row of addonNameRows || []) {
        addonNameById.set(String(row.id), String(row.name || ""));
      }
    }

    const addonsByItemId = new Map<string, string[]>();
    for (const row of addonRows) {
      const orderItemId = pickAddonItemId(row);
      if (!orderItemId) continue;
      const list = addonsByItemId.get(orderItemId) || [];
      const fallbackName = addonNameById.get(String(row.addon_id || "").trim()) || "";
      const name = pickAddonName(row) || fallbackName;
      if (name) list.push(name);
      addonsByItemId.set(orderItemId, list);
    }

    const receiptItems: ReceiptItemLine[] = items.map(item => {
      const qty = Number(item.qty || 0);
      const unitPrice = Number(item.price || 0);
      const lineTotal = Number(item.line_total ?? unitPrice * qty);
      return {
        name: toLineName(item, variantNameById, addonsByItemId),
        qty,
        unitPrice,
        lineTotal,
      };
    });

    const html = buildReceiptHtml({
      receiptNumber: orderRow.receipt_number || orderRow.id.slice(0, 8),
      createdAt: orderRow.created_at,
      customerName: orderRow.customer_name,
      paymentMethod: orderRow.payment_method,
      subtotal: Number(orderRow.subtotal || 0),
      discount: Number(orderRow.discount_value || 0),
      total: Number(orderRow.total || 0),
      items: receiptItems,
      autoPrint: true,
    });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to print receipt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
