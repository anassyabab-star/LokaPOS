import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type PurchaseOrderItemRow = {
  id: string;
  product_id: string;
  qty_ordered: number;
  qty_received: number;
  unit_cost: number;
  line_total: number;
  products:
    | {
        id: string;
        name: string;
        stock: number;
      }
    | Array<{
        id: string;
        name: string;
        stock: number;
      }>
    | null;
};

type PurchaseOrderRow = {
  id: string;
  po_number: string;
  supplier_id: string;
  status: "draft" | "ordered" | "partial" | "received" | "cancelled";
  ordered_at: string;
  expected_at: string | null;
  note: string | null;
  subtotal: number;
  created_at: string;
  updated_at: string;
  suppliers:
    | {
        id: string;
        name: string;
      }
    | Array<{
        id: string;
        name: string;
      }>
    | null;
  purchase_order_items: PurchaseOrderItemRow[] | null;
};

function pickSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] || null) : value;
}

function generatePoNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const random = String(Math.floor(100 + Math.random() * 900));
  return `PO-${y}${m}${d}-${random}`;
}

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const status = (searchParams.get("status") || "all").toLowerCase();
  const supplierId = (searchParams.get("supplier_id") || "").trim();
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  try {
    const supabase = createSupabaseAdminClient();
    let query = supabase
      .from("purchase_orders")
      .select(
        "id,po_number,supplier_id,status,ordered_at,expected_at,note,subtotal,created_at,updated_at,suppliers(id,name),purchase_order_items(id,product_id,qty_ordered,qty_received,unit_cost,line_total,products(id,name,stock))"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (status !== "all") query = query.eq("status", status);
    if (supplierId) query = query.eq("supplier_id", supplierId);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = ((data || []) as PurchaseOrderRow[]).map(row => {
      const supplier = pickSingle(row.suppliers);
      const items = (row.purchase_order_items || []).map(item => {
        const product = pickSingle(item.products);
        return {
          id: item.id,
          product_id: item.product_id,
          qty_ordered: Number(item.qty_ordered || 0),
          qty_received: Number(item.qty_received || 0),
          unit_cost: Number(item.unit_cost || 0),
          line_total: Number(item.line_total || 0),
          product: product
            ? {
                id: product.id,
                name: product.name,
                stock: Number(product.stock || 0),
              }
            : null,
        };
      });

      return {
        id: row.id,
        po_number: row.po_number,
        supplier_id: row.supplier_id,
        supplier_name: supplier?.name || "Unknown supplier",
        status: row.status,
        ordered_at: row.ordered_at,
        expected_at: row.expected_at,
        note: row.note,
        subtotal: Number(row.subtotal || 0),
        created_at: row.created_at,
        updated_at: row.updated_at,
        items,
      };
    });

    const filtered = rows.filter(row => {
      if (!q) return true;
      return (
        row.po_number.toLowerCase().includes(q) ||
        row.supplier_name.toLowerCase().includes(q) ||
        String(row.note || "").toLowerCase().includes(q)
      );
    });

    const summary = rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === "ordered") acc.ordered += 1;
        if (row.status === "partial") acc.partial += 1;
        if (row.status === "received") acc.received += 1;
        if (row.status === "cancelled") acc.cancelled += 1;
        acc.subtotal += Number(row.subtotal || 0);
        return acc;
      },
      { total: 0, ordered: 0, partial: 0, received: 0, cancelled: 0, subtotal: 0 }
    );

    return NextResponse.json({ purchase_orders: filtered, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load purchase orders";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as {
      supplier_id?: string;
      expected_at?: string | null;
      note?: string | null;
      items?: Array<{
        product_id: string;
        qty_ordered: number;
        unit_cost: number;
      }>;
    };

    const supplierId = String(body.supplier_id || "").trim();
    const items = Array.isArray(body.items) ? body.items : [];

    if (!supplierId) {
      return NextResponse.json({ error: "Supplier is required" }, { status: 400 });
    }
    if (items.length === 0) {
      return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
    }

    const normalizedItems = items.map(item => ({
      product_id: String(item.product_id || "").trim(),
      qty_ordered: Math.floor(Number(item.qty_ordered || 0)),
      unit_cost: Number(item.unit_cost || 0),
    }));

    const invalid = normalizedItems.find(
      item => !item.product_id || item.qty_ordered <= 0 || item.unit_cost < 0
    );
    if (invalid) {
      return NextResponse.json(
        { error: "Each PO item needs product, qty > 0, and unit cost >= 0" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    let createdPo: { id: string; po_number: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const poNumber = generatePoNumber();
      const { data, error } = await supabase
        .from("purchase_orders")
        .insert({
          po_number: poNumber,
          supplier_id: supplierId,
          status: "ordered",
          ordered_at: new Date().toISOString(),
          expected_at: body.expected_at || null,
          note: body.note || null,
          subtotal: 0,
          created_by: auth.user.id,
        })
        .select("id,po_number")
        .single();

      if (!error && data) {
        createdPo = data;
        break;
      }

      if (!error) continue;
      const duplicateNumber = error.message.toLowerCase().includes("duplicate");
      if (!duplicateNumber) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (!createdPo) {
      return NextResponse.json(
        { error: "Failed to generate PO number. Please retry." },
        { status: 500 }
      );
    }

    const subtotal = normalizedItems.reduce(
      (sum, item) => sum + item.qty_ordered * item.unit_cost,
      0
    );

    const { error: itemsError } = await supabase.from("purchase_order_items").insert(
      normalizedItems.map(item => ({
        po_id: createdPo!.id,
        product_id: item.product_id,
        qty_ordered: item.qty_ordered,
        qty_received: 0,
        unit_cost: item.unit_cost,
        line_total: Number((item.qty_ordered * item.unit_cost).toFixed(2)),
      }))
    );

    if (itemsError) {
      await supabase.from("purchase_orders").delete().eq("id", createdPo.id);
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    const { error: subtotalError } = await supabase
      .from("purchase_orders")
      .update({ subtotal: Number(subtotal.toFixed(2)) })
      .eq("id", createdPo.id);

    if (subtotalError) {
      return NextResponse.json({ error: subtotalError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      purchase_order: {
        id: createdPo.id,
        po_number: createdPo.po_number,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create purchase order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
