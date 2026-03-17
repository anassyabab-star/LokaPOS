import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

type OrderItem = {
  product_id: string;
  variant_id: string | null;
  addon_ids: string[];
  sugar_level: string | null;
  qty: number;
};

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "").trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const customerName = String(body.customer_name || "").trim();
    const customerPhone = normalizePhone(String(body.customer_phone || ""));

    if (!customerName) return NextResponse.json({ error: "Nama diperlukan" }, { status: 400 });
    if (!customerPhone) return NextResponse.json({ error: "No telefon diperlukan" }, { status: 400 });

    const items = body.items as OrderItem[];
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Cart kosong" }, { status: 400 });
    }

    const paymentMethod = String(body.payment_method || "fpx").toLowerCase();

    // Lookup or create customer by phone
    let customerId: string | null = null;
    const { data: existing } = await supabase
      .from("customers")
      .select("id, name")
      .eq("phone", customerPhone)
      .maybeSingle();

    if (existing) {
      customerId = existing.id;
    } else {
      const { data: created } = await supabase
        .from("customers")
        .insert([{ name: customerName, phone: customerPhone, consent_whatsapp: true }])
        .select("id")
        .single();
      if (created) customerId = created.id;
    }

    // Calculate order
    const productIds = [...new Set(items.map(i => i.product_id))];
    const { data: products } = await supabase
      .from("products")
      .select("id, price, product_variants(id, price_adjustment), product_addons(id, price)")
      .in("id", productIds);

    const productMap = new Map((products || []).map((p: Record<string, unknown>) => [p.id as string, p]));

    let subtotal = 0;
    const orderItems: Array<{
      product_id: string;
      variant_id: string | null;
      sugar_level: string | null;
      qty: number;
      price: number;
      line_total: number;
      product_name_snapshot: string;
    }> = [];

    for (const item of items) {
      const product = productMap.get(item.product_id) as Record<string, unknown> | undefined;
      if (!product) continue;

      let unitPrice = Number(product.price || 0);

      // Add variant price
      if (item.variant_id) {
        const variants = (product.product_variants as Array<Record<string, unknown>>) || [];
        const v = variants.find((v) => v.id === item.variant_id);
        if (v) unitPrice += Number(v.price_adjustment || 0);
      }

      // Add addon prices
      if (item.addon_ids?.length) {
        const addons = (product.product_addons as Array<Record<string, unknown>>) || [];
        for (const addonId of item.addon_ids) {
          const a = addons.find((a) => a.id === addonId);
          if (a) unitPrice += Number(a.price || 0);
        }
      }

      const lineTotal = unitPrice * item.qty;
      subtotal += lineTotal;

      // Get product name for snapshot
      const { data: prodName } = await supabase.from("products").select("name").eq("id", item.product_id).single();

      orderItems.push({
        product_id: item.product_id,
        variant_id: item.variant_id || null,
        sugar_level: item.sugar_level || null,
        qty: item.qty,
        price: unitPrice,
        line_total: lineTotal,
        product_name_snapshot: (prodName?.name as string) || "Unknown",
      });
    }

    const total = subtotal;

    // Generate order number
    const now = new Date();
    const dateKey = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" });
    const datePart = dateKey.replace(/-/g, "").slice(2);
    const { count } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("date_key", dateKey);
    const seq = String((count || 0) + 1).padStart(3, "0");
    const orderNumber = `${datePart}-${seq}`;

    // Insert order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([{
        receipt_number: orderNumber,
        date_key: dateKey,
        customer_id: customerId,
        customer_name: customerName,
        subtotal,
        discount_type: "none",
        discount_value: 0,
        total,
        payment_method: paymentMethod,
        cash_received: 0,
        balance: 0,
        status: "pending",
        payment_status: "pending",
        order_source: "customer_web",
      }])
      .select("id")
      .single();

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    // Insert order items
    if (order && orderItems.length > 0) {
      await supabase.from("order_items").insert(
        orderItems.map(item => ({
          order_id: order.id,
          product_id: item.product_id,
          variant_id: item.variant_id,
          sugar_level: item.sugar_level,
          qty: item.qty,
          price: item.price,
          line_total: item.line_total,
          product_name_snapshot: item.product_name_snapshot,
        }))
      );

      // Insert addon records
      for (const item of items) {
        if (item.addon_ids?.length) {
          const orderItem = orderItems.find(oi => oi.product_id === item.product_id && oi.variant_id === (item.variant_id || null));
          if (orderItem) {
            const { data: oiRow } = await supabase
              .from("order_items")
              .select("id")
              .eq("order_id", order.id)
              .eq("product_id", item.product_id)
              .limit(1)
              .single();
            if (oiRow) {
              for (const addonId of item.addon_ids) {
                const { data: addon } = await supabase.from("product_addons").select("name, price").eq("id", addonId).single();
                if (addon) {
                  await supabase.from("order_item_addons").insert([{
                    order_item_id: oiRow.id,
                    addon_id: addonId,
                    addon_name_snapshot: addon.name,
                  }]).catch(() => {});
                }
              }
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      order_id: order?.id,
      order_number: orderNumber,
      total,
      payment: { status: "pending" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
