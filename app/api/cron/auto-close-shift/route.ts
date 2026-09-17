import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { getCashSalesSince } from "@/lib/shift-cash";
import { expireStaleUnpaidOrders } from "@/lib/order-expiry";

type ShiftRow = {
  id: string;
  register_id: string;
  opened_by: string;
  opened_at: string;
  opening_cash: number;
  opening_note: string | null;
  status: "open" | "closed";
};

type PaidOutRow = { amount: number | null };

function toNum(v: number | string | null | undefined) {
  return Number(v || 0);
}

export async function GET(req: NextRequest) {
  // Verify Vercel cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Sweep stale unpaid orders here rather than from a cron of its own: the
  // Hobby plan allows only two cron jobs, and this one already runs nightly.
  // During opening hours the POS and KDS list endpoints sweep every minute,
  // so this is the backstop for orders abandoned after the store closes.
  let expired = 0;
  try {
    const sweep = await expireStaleUnpaidOrders({ force: true });
    expired = sweep.expired;
  } catch (error) {
    console.warn("[cron/auto-close-shift] unpaid-order sweep failed:", error);
  }

  const supabase = createSupabaseAdminClient();

  try {
    // Find all currently open shifts
    const { data: openShifts, error: shiftError } = await supabase
      .from("pos_shifts")
      .select("id, register_id, opened_by, opened_at, opening_cash, opening_note, status")
      .eq("status", "open");

    if (shiftError) throw shiftError;
    if (!openShifts || openShifts.length === 0) {
      return NextResponse.json({ message: "No open shifts found", closed: 0, expired });
    }

    const results: Array<{ shift_id: string; ok: boolean; error?: string }> = [];
    const now = new Date().toISOString();

    for (const shift of openShifts as ShiftRow[]) {
      try {
        // Calculate expected cash (every PAID cash order since open — see lib/shift-cash.ts)
        const cashSales = await getCashSalesSince(supabase, shift.opened_at);

        const { data: paidOutRows } = await supabase
          .from("paid_outs")
          .select("amount")
          .eq("shift_id", shift.id);

        const paidOutTotal = ((paidOutRows || []) as PaidOutRow[]).reduce(
          (sum, p) => sum + toNum(p.amount),
          0
        );

        const expectedCash = toNum(shift.opening_cash) + cashSales - paidOutTotal;
        // For auto-close: counted = expected (no over/short)
        const countedCash = expectedCash;

        const { error: updateError } = await supabase
          .from("pos_shifts")
          .update({
            status: "closed",
            closed_by: shift.opened_by, // attribute to opener
            closed_at: now,
            counted_cash: countedCash,
            expected_cash: expectedCash,
            over_short: 0,
            closing_note: "Auto-closed by system",
          })
          .eq("id", shift.id);

        if (updateError) throw updateError;

        // Send WhatsApp summary
        try {
          const shiftDate = new Date(shift.opened_at).toLocaleDateString("sv-SE", {
            timeZone: "Asia/Kuala_Lumpur",
          });

          const { data: todayOrders } = await supabase
            .from("orders")
            .select("total, payment_method, status")
            .eq("date_key", shiftDate)
            .in("status", ["pending", "preparing", "ready", "completed"]).eq("payment_status", "paid");

          const orders = todayOrders || [];
          const totalSales = orders.reduce((s, o) => s + toNum(o.total), 0);
          const cashTotal = orders
            .filter(o => o.payment_method === "cash")
            .reduce((s, o) => s + toNum(o.total), 0);
          const nonCashTotal = totalSales - cashTotal;

          const { data: todayExpenses } = await supabase
            .from("expenses")
            .select("amount")
            .eq("expense_date", shiftDate);
          const expensesTotal = (todayExpenses || []).reduce((s, e) => s + toNum(e.amount), 0);

          const netSales = totalSales - expensesTotal - paidOutTotal;

          const summary = `📊 *LOKA POS — Ringkasan Harian*
📅 ${shiftDate} _(Auto-close)_

💰 *Jualan*
• Jumlah Order: ${orders.length}
• Gross Sales: RM ${totalSales.toFixed(2)}
• Cash: RM ${cashTotal.toFixed(2)}
• Non-Cash: RM ${nonCashTotal.toFixed(2)}

📤 *Perbelanjaan*
• Expenses: RM ${expensesTotal.toFixed(2)}
• Paid Out: RM ${paidOutTotal.toFixed(2)}

📈 *Net Sales: RM ${netSales.toFixed(2)}*

💵 *Shift*
• Opening Cash: RM ${toNum(shift.opening_cash).toFixed(2)}
• Expected Cash: RM ${expectedCash.toFixed(2)}

⚠️ _Shift ditutup secara automatik oleh sistem_`;

          const adminPhone = process.env.ADMIN_WHATSAPP_PHONE || "";
          if (adminPhone) {
            await sendWhatsAppText({ to: adminPhone, message: summary });
          }
        } catch (waErr) {
          console.error("[auto-close] WhatsApp failed:", waErr);
        }

        results.push({ shift_id: shift.id, ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[auto-close] Failed for shift ${shift.id}:`, err);
        results.push({ shift_id: shift.id, ok: false, error: msg });
      }
    }

    const closed = results.filter(r => r.ok).length;
    return NextResponse.json({ message: `Closed ${closed} shift(s)`, results, expired });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[auto-close] Fatal error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
