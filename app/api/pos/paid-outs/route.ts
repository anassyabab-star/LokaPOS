import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";

type ShiftRow = {
  id: string;
  register_id: string;
  opened_at: string;
  opening_cash: number;
  status: "open" | "closed";
};

type CashOrderRow = {
  total: number | null;
};

type PaidOutRow = {
  id: string;
  shift_id: string;
  register_id: string;
  amount: number;
  staff_name: string;
  reason: string;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_url: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
};

const DEFAULT_REGISTER_ID = "main";

function isMissingPaidOutTable(message: string | null | undefined) {
  const m = String(message || "").toLowerCase();
  return m.includes("paid_outs") && (m.includes("does not exist") || m.includes("schema cache"));
}

function isMissingPaidOutStaffNameColumn(message: string | null | undefined) {
  const m = String(message || "").toLowerCase();
  return m.includes("staff_name") && (m.includes("does not exist") || m.includes("schema cache"));
}

async function getOpenShift(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  registerId: string
) {
  const { data, error } = await supabase
    .from("pos_shifts")
    .select("id,register_id,opened_at,opening_cash,status")
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
  return ((data || []) as CashOrderRow[]).reduce((sum, row) => sum + Number(row.total || 0), 0);
}

async function getPaidOutTotal(
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

  const total = ((data || []) as Array<{ amount: number | null }>).reduce(
    (sum, row) => sum + Number(row.amount || 0),
    0
  );
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
        paid_out_total: 0,
        paid_outs: [],
      });
    }

    const { data, error } = await supabase
      .from("paid_outs")
      .select(
        "id,shift_id,register_id,amount,staff_name,reason,vendor_name,invoice_number,invoice_url,notes,created_by,created_at"
      )
      .eq("shift_id", shift.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      if (isMissingPaidOutTable(error.message) || isMissingPaidOutStaffNameColumn(error.message)) {
        return NextResponse.json(
          { error: "Run sql/paid_outs.sql first in Supabase." },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data || []) as PaidOutRow[];
    const paidOutTotal = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

    return NextResponse.json({
      shift,
      paid_out_total: paidOutTotal,
      paid_outs: rows.map(row => ({ ...row, amount: Number(row.amount || 0) })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load paid outs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const registerId = String(body?.register_id || DEFAULT_REGISTER_ID);
  const amount = Number(body?.amount || 0);
  const staffName = String(body?.staff_name || "").trim();
  const reason = String(body?.reason || "").trim();
  const vendorName = String(body?.vendor_name || "").trim() || null;
  const invoiceNumber = String(body?.invoice_number || "").trim() || null;
  const invoiceUrl = String(body?.invoice_url || "").trim() || null;
  const notes = String(body?.notes || "").trim() || null;

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Amount must be more than 0" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "Reason is required" }, { status: 400 });
  }
  if (!staffName) {
    return NextResponse.json({ error: "Staff name is required" }, { status: 400 });
  }

  if (invoiceUrl && !/^https?:\/\//i.test(invoiceUrl)) {
    return NextResponse.json({ error: "Invoice URL must start with http:// or https://" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const shift = await getOpenShift(supabase, registerId);
    if (!shift) {
      return NextResponse.json({ error: "Open shift required before paid out" }, { status: 409 });
    }

    const cashSales = await getCashSalesSince(supabase, shift.opened_at);
    const paidOutResult = await getPaidOutTotal(supabase, shift.id);

    if (paidOutResult.missingTable) {
      return NextResponse.json(
        { error: "Run sql/paid_outs.sql first in Supabase." },
        { status: 400 }
      );
    }

    const cashAvailable = Number(shift.opening_cash || 0) + cashSales - paidOutResult.total;
    if (amount > cashAvailable) {
      return NextResponse.json(
        { error: `Not enough cash in drawer. Available RM ${cashAvailable.toFixed(2)}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("paid_outs")
      .insert({
        shift_id: shift.id,
        register_id: registerId,
        amount,
        staff_name: staffName,
        reason,
        vendor_name: vendorName,
        invoice_number: invoiceNumber,
        invoice_url: invoiceUrl,
        notes,
        created_by: auth.user.id,
      })
      .select(
        "id,shift_id,register_id,amount,staff_name,reason,vendor_name,invoice_number,invoice_url,notes,created_by,created_at"
      )
      .single();

    if (error) {
      if (isMissingPaidOutTable(error.message) || isMissingPaidOutStaffNameColumn(error.message)) {
        return NextResponse.json(
          { error: "Run sql/paid_outs.sql first in Supabase." },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const nextPaidOutTotal = paidOutResult.total + amount;
    const expectedCashLive = Number(shift.opening_cash || 0) + cashSales - nextPaidOutTotal;

    return NextResponse.json({
      success: true,
      paid_out: { ...data, amount: Number(data.amount || 0) },
      paid_out_total: nextPaidOutTotal,
      expected_cash_live: expectedCashLive,
      cash_sales: cashSales,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create paid out";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
