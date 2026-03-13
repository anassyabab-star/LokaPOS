import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PoItemRow = {
  id: string;
  po_id: string;
  product_id: string;
  qty_ordered: number;
  qty_received: number;
  unit_cost: number;
};

type ReceiveLineInput = {
  po_item_id: string;
  qty_received: number;
  unit_cost?: number;
};

function generateReceiptNumber() {
  const now = new Date();
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const stamp = String(now.getTime()).slice(-4);
  return `GRN-${d}${m}${y}-${stamp}`;
}

export async function POST(req: Request, { params }: RouteContext) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id: poId } = await params;

  try {
    const body = (await req.json()) as {
      note?: string;
      lines?: ReceiveLineInput[];
    };

    const inputLines = Array.isArray(body.lines) ? body.lines : [];
    if (inputLines.length === 0) {
      return NextResponse.json({ error: "At least one receive line is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: poData, error: poError } = await supabase
      .from("purchase_orders")
      .select("id,status")
      .eq("id", poId)
      .single();

    if (poError) {
      return NextResponse.json({ error: poError.message }, { status: 500 });
    }

    if (!poData) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    }

    if (poData.status === "cancelled") {
      return NextResponse.json({ error: "Cannot receive a cancelled PO" }, { status: 400 });
    }

    const { data: poItemsData, error: poItemsError } = await supabase
      .from("purchase_order_items")
      .select("id,po_id,product_id,qty_ordered,qty_received,unit_cost")
      .eq("po_id", poId);

    if (poItemsError) {
      return NextResponse.json({ error: poItemsError.message }, { status: 500 });
    }

    const poItems = (poItemsData || []) as PoItemRow[];
    if (poItems.length === 0) {
      return NextResponse.json({ error: "PO has no items" }, { status: 400 });
    }

    const itemMap = new Map(poItems.map(item => [item.id, item]));
    const lines = inputLines
      .map(line => ({
        po_item_id: String(line.po_item_id || "").trim(),
        qty_received: Math.floor(Number(line.qty_received || 0)),
        unit_cost:
          line.unit_cost == null || Number.isNaN(Number(line.unit_cost))
            ? null
            : Number(line.unit_cost),
      }))
      .filter(line => line.po_item_id && line.qty_received > 0);

    if (lines.length === 0) {
      return NextResponse.json({ error: "No valid receive lines found" }, { status: 400 });
    }

    for (const line of lines) {
      const existing = itemMap.get(line.po_item_id);
      if (!existing) {
        return NextResponse.json(
          { error: `PO item not found: ${line.po_item_id}` },
          { status: 400 }
        );
      }

      const ordered = Number(existing.qty_ordered || 0);
      const received = Number(existing.qty_received || 0);
      const remaining = ordered - received;
      if (line.qty_received > remaining) {
        return NextResponse.json(
          {
            error: `Receive qty exceeds remaining for item ${line.po_item_id}. Remaining: ${remaining}`,
          },
          { status: 400 }
        );
      }

      if (line.unit_cost != null && line.unit_cost < 0) {
        return NextResponse.json(
          { error: "Unit cost cannot be negative" },
          { status: 400 }
        );
      }
    }

    const receiptNumber = generateReceiptNumber();
    const receiptAt = new Date().toISOString();

    for (const line of lines) {
      const existing = itemMap.get(line.po_item_id)!;
      const qtyOrdered = Number(existing.qty_ordered || 0);
      const prevReceived = Number(existing.qty_received || 0);
      const newReceived = prevReceived + line.qty_received;
      const unitCost = line.unit_cost == null ? Number(existing.unit_cost || 0) : line.unit_cost;
      const lineTotal = Number((qtyOrdered * unitCost).toFixed(2));

      const { error: updatePoItemError } = await supabase
        .from("purchase_order_items")
        .update({
          qty_received: newReceived,
          unit_cost: unitCost,
          line_total: lineTotal,
        })
        .eq("id", existing.id);

      if (updatePoItemError) {
        return NextResponse.json({ error: updatePoItemError.message }, { status: 500 });
      }

      const { data: productRow, error: productReadError } = await supabase
        .from("products")
        .select("id,stock")
        .eq("id", existing.product_id)
        .single();

      if (productReadError) {
        return NextResponse.json({ error: productReadError.message }, { status: 500 });
      }

      const nextStock = Number(productRow?.stock || 0) + line.qty_received;
      const { error: productUpdateError } = await supabase
        .from("products")
        .update({ stock: nextStock })
        .eq("id", existing.product_id);

      if (productUpdateError) {
        return NextResponse.json({ error: productUpdateError.message }, { status: 500 });
      }

      const { error: receiptError } = await supabase.from("purchase_receipts").insert({
        receipt_number: receiptNumber,
        po_id: poId,
        po_item_id: existing.id,
        product_id: existing.product_id,
        qty_received: line.qty_received,
        unit_cost: unitCost,
        line_total: Number((line.qty_received * unitCost).toFixed(2)),
        note: String(body.note || "").trim() || null,
        received_by: auth.user.id,
        received_at: receiptAt,
      });

      if (receiptError) {
        return NextResponse.json({ error: receiptError.message }, { status: 500 });
      }
    }

    const { data: latestItemsData, error: latestItemsError } = await supabase
      .from("purchase_order_items")
      .select("qty_ordered,qty_received")
      .eq("po_id", poId);

    if (latestItemsError) {
      return NextResponse.json({ error: latestItemsError.message }, { status: 500 });
    }

    const latestItems = (latestItemsData || []) as Array<{
      qty_ordered: number;
      qty_received: number;
    }>;

    const allReceived = latestItems.every(
      item => Number(item.qty_received || 0) >= Number(item.qty_ordered || 0)
    );
    const anyReceived = latestItems.some(item => Number(item.qty_received || 0) > 0);

    const nextStatus = allReceived ? "received" : anyReceived ? "partial" : "ordered";
    const { error: updatePoError } = await supabase
      .from("purchase_orders")
      .update({ status: nextStatus })
      .eq("id", poId);

    if (updatePoError) {
      return NextResponse.json({ error: updatePoError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      receipt_number: receiptNumber,
      status: nextStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to receive PO items";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
