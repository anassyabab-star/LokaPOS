import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";

type ShiftRow = {
  id: string;
  register_id: string;
  opened_by: string;
  opened_at: string;
  opening_cash: number;
  opening_note: string | null;
  status: "open" | "closed";
  closed_by: string | null;
  closed_at: string | null;
  counted_cash: number | null;
  expected_cash: number | null;
  over_short: number | null;
  closing_note: string | null;
};

type OrderCashRow = {
  total: number | null;
};

const DEFAULT_REGISTER_ID = "main";

async function getOpenShift(supabase: ReturnType<typeof createSupabaseAdminClient>, registerId: string) {
  const { data, error } = await supabase
    .from("pos_shifts")
    .select(
      "id, register_id, opened_by, opened_at, opening_cash, opening_note, status, closed_by, closed_at, counted_cash, expected_cash, over_short, closing_note"
    )
    .eq("register_id", registerId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as ShiftRow | null) || null;
}

async function getCashSalesSince(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  openedAt: string
) {
  const { data, error } = await supabase
    .from("orders")
    .select("total")
    .eq("status", "completed")
    .eq("payment_method", "cash")
    .gte("created_at", openedAt);

  if (error) throw error;
  return ((data || []) as OrderCashRow[]).reduce((sum, row) => sum + Number(row.total || 0), 0);
}

export async function GET(req: Request) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const registerId = searchParams.get("register_id") || DEFAULT_REGISTER_ID;

  try {
    const supabase = createSupabaseAdminClient();
    const shift = await getOpenShift(supabase, registerId);

    if (!shift) {
      return NextResponse.json({
        shift: null,
        cash_sales: 0,
        expected_cash_live: 0,
        register_id: registerId,
      });
    }

    const cashSales = await getCashSalesSince(supabase, shift.opened_at);
    const expectedCashLive = Number(shift.opening_cash || 0) + cashSales;

    return NextResponse.json({
      shift,
      cash_sales: cashSales,
      expected_cash_live: expectedCashLive,
      register_id: registerId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load shift";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  const registerId = String(body?.register_id || DEFAULT_REGISTER_ID);

  try {
    const supabase = createSupabaseAdminClient();

    if (action === "open") {
      const openingCash = Number(body?.opening_cash || 0);
      const openingNote = String(body?.opening_note || "").trim() || null;

      if (!Number.isFinite(openingCash) || openingCash < 0) {
        return NextResponse.json({ error: "Invalid opening cash amount" }, { status: 400 });
      }

      const currentOpen = await getOpenShift(supabase, registerId);
      if (currentOpen) {
        return NextResponse.json(
          { error: "There is already an open shift for this register." },
          { status: 409 }
        );
      }

      const { data: created, error: createError } = await supabase
        .from("pos_shifts")
        .insert([
          {
            register_id: registerId,
            opened_by: auth.user.id,
            opened_at: new Date().toISOString(),
            opening_cash: openingCash,
            opening_note: openingNote,
            status: "open",
          },
        ])
        .select(
          "id, register_id, opened_by, opened_at, opening_cash, opening_note, status, closed_by, closed_at, counted_cash, expected_cash, over_short, closing_note"
        )
        .single();

      if (createError || !created) {
        return NextResponse.json({ error: createError?.message || "Failed to open shift" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        shift: created as ShiftRow,
        cash_sales: 0,
        expected_cash_live: Number((created as ShiftRow).opening_cash || 0),
      });
    }

    if (action === "close") {
      const countedCash = Number(body?.counted_cash || 0);
      const closingNote = String(body?.closing_note || "").trim() || null;

      if (!Number.isFinite(countedCash) || countedCash < 0) {
        return NextResponse.json({ error: "Invalid counted cash amount" }, { status: 400 });
      }

      const currentOpen = await getOpenShift(supabase, registerId);
      if (!currentOpen) {
        return NextResponse.json({ error: "No open shift found to close." }, { status: 409 });
      }

      const cashSales = await getCashSalesSince(supabase, currentOpen.opened_at);
      const expectedCash = Number(currentOpen.opening_cash || 0) + cashSales;
      const overShort = countedCash - expectedCash;

      const { data: closed, error: closeError } = await supabase
        .from("pos_shifts")
        .update({
          status: "closed",
          closed_by: auth.user.id,
          closed_at: new Date().toISOString(),
          counted_cash: countedCash,
          expected_cash: expectedCash,
          over_short: overShort,
          closing_note: closingNote,
        })
        .eq("id", currentOpen.id)
        .select(
          "id, register_id, opened_by, opened_at, opening_cash, opening_note, status, closed_by, closed_at, counted_cash, expected_cash, over_short, closing_note"
        )
        .single();

      if (closeError || !closed) {
        return NextResponse.json({ error: closeError?.message || "Failed to close shift" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        shift: closed as ShiftRow,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process shift";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
