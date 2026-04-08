import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";
import { sendMurpatiText, normalizeWhatsappNumber } from "@/app/api/admin/campaigns/murpati";

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

type PaidOutRow = {
  amount: number | null;
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
    .eq("payment_status", "paid")
    .gte("created_at", openedAt);

  if (error) throw error;
  return ((data || []) as OrderCashRow[]).reduce((sum, row) => sum + Number(row.total || 0), 0);
}

function isMissingPaidOutTable(message: string | null | undefined) {
  const m = String(message || "").toLowerCase();
  return m.includes("paid_outs") && (m.includes("does not exist") || m.includes("schema cache"));
}

async function getPaidOutForShift(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  shiftId: string
) {
  const { data, error } = await supabase
    .from("paid_outs")
    .select("amount")
    .eq("shift_id", shiftId);

  if (error) {
    if (isMissingPaidOutTable(error.message)) return { total: 0, missingTable: true };
    throw error;
  }

  const total = ((data || []) as PaidOutRow[]).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return { total, missingTable: false };
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
        paid_out_total: 0,
        expected_cash_live: 0,
        register_id: registerId,
      });
    }

    const cashSales = await getCashSalesSince(supabase, shift.opened_at);
    const paidOutResult = await getPaidOutForShift(supabase, shift.id);
    const expectedCashLive = Number(shift.opening_cash || 0) + cashSales - paidOutResult.total;

    return NextResponse.json({
      shift,
      cash_sales: cashSales,
      paid_out_total: paidOutResult.total,
      expected_cash_live: expectedCashLive,
      register_id: registerId,
      paid_out_schema_ready: !paidOutResult.missingTable,
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
        paid_out_total: 0,
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
      const paidOutResult = await getPaidOutForShift(supabase, currentOpen.id);
      const expectedCash = Number(currentOpen.opening_cash || 0) + cashSales - paidOutResult.total;
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

      // ━━━ Send daily summary WhatsApp to admin ━━━
      try {
        const shiftDate = new Date(currentOpen.opened_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" });

        // Get today's orders
        const { data: todayOrders } = await supabase
          .from("orders")
          .select("total, payment_method, status")
          .eq("date_key", shiftDate)
          .in("status", ["completed", "preparing", "ready"]);

        const orders = todayOrders || [];
        const totalSales = orders.reduce((s, o) => s + Number(o.total || 0), 0);
        const orderCount = orders.length;
        const cashOrders = orders.filter(o => o.payment_method === "cash");
        const cashTotal = cashOrders.reduce((s, o) => s + Number(o.total || 0), 0);
        const nonCashTotal = totalSales - cashTotal;

        // Get today's expenses
        const { data: todayExpenses } = await supabase
          .from("expenses")
          .select("amount")
          .eq("expense_date", shiftDate);
        const expensesTotal = (todayExpenses || []).reduce((s, e) => s + Number(e.amount || 0), 0);

        // Get today's paid outs
        const { data: todayPaidOuts } = await supabase
          .from("paid_outs")
          .select("amount")
          .eq("shift_id", currentOpen.id);
        const paidOutTotal = (todayPaidOuts || []).reduce((s, p) => s + Number(p.amount || 0), 0);

        const netSales = totalSales - expensesTotal - paidOutTotal;

        const summary = `📊 *LOKA POS — Ringkasan Harian*
📅 ${shiftDate}

💰 *Jualan*
• Jumlah Order: ${orderCount}
• Gross Sales: RM ${totalSales.toFixed(2)}
• Cash: RM ${cashTotal.toFixed(2)}
• Non-Cash: RM ${nonCashTotal.toFixed(2)}

📤 *Perbelanjaan*
• Expenses: RM ${expensesTotal.toFixed(2)}
• Paid Out: RM ${paidOutTotal.toFixed(2)}

📈 *Net Sales: RM ${netSales.toFixed(2)}*

💵 *Shift*
• Opening Cash: RM ${Number(currentOpen.opening_cash || 0).toFixed(2)}
• Expected Cash: RM ${expectedCash.toFixed(2)}
• Counted Cash: RM ${countedCash.toFixed(2)}
• Over/Short: RM ${overShort.toFixed(2)}

_Auto-generated on shift close_`;

        // Send to admin phone (from env or profiles)
        const adminPhone = process.env.ADMIN_WHATSAPP_PHONE || "";
        if (adminPhone) {
          await sendMurpatiText({ to: adminPhone, message: summary });
        }
      } catch (summaryErr) {
        console.error("Daily summary WhatsApp failed:", summaryErr);
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
