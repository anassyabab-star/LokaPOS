import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type LoyaltyRow = {
  id: string;
  order_id: string | null;
  entry_type: "earn" | "redeem" | "adjust";
  points_change: number;
  note: string | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  receipt_number: string | null;
};

function isMissingRelationError(message: string | null | undefined) {
  const m = String(message || "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache");
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const customerId = String(id || "").trim();
  if (!customerId) {
    return NextResponse.json({ error: "Customer id is required" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("loyalty_ledger")
      .select("id,order_id,entry_type,points_change,note,created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      if (isMissingRelationError(error.message)) {
        return NextResponse.json({ history: [] });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data || []) as LoyaltyRow[];
    const orderIds = Array.from(
      new Set(rows.map(row => row.order_id).filter((v): v is string => Boolean(v)))
    );

    const receiptByOrder = new Map<string, string>();
    if (orderIds.length > 0) {
      const { data: orderRows, error: orderError } = await supabase
        .from("orders")
        .select("id,receipt_number")
        .in("id", orderIds);

      if (orderError) {
        return NextResponse.json({ error: orderError.message }, { status: 500 });
      }

      for (const row of (orderRows || []) as OrderRow[]) {
        receiptByOrder.set(row.id, row.receipt_number || row.id.slice(0, 8));
      }
    }

    return NextResponse.json({
      history: rows.map(row => ({
        id: row.id,
        entry_type: row.entry_type,
        points_change: Number(row.points_change || 0),
        note: row.note,
        created_at: row.created_at,
        order_id: row.order_id,
        receipt_number: row.order_id ? receiptByOrder.get(row.order_id) || null : null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load loyalty history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
