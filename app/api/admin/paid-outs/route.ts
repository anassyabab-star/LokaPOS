import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type PaidOutRow = {
  id: string;
  shift_id: string;
  register_id: string;
  amount: number;
  staff_name: string | null;
  reason: string;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_url: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
};

type ShiftRow = {
  id: string;
  opened_at: string;
  closed_at: string | null;
};

type ListUsersResponse = {
  data?: {
    users?: Array<{
      id: string;
      email?: string | null;
      user_metadata?: { full_name?: string | null } | null;
    }>;
  };
};

function isMissingPaidOutTable(message: string | null | undefined) {
  const m = String(message || "").toLowerCase();
  return m.includes("paid_outs") && (m.includes("does not exist") || m.includes("schema cache"));
}

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const registerId = (searchParams.get("register_id") || "all").toLowerCase();
  const dateFrom = searchParams.get("date_from") || "";
  const dateTo = searchParams.get("date_to") || "";

  try {
    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from("paid_outs")
      .select(
        "id,shift_id,register_id,amount,staff_name,reason,vendor_name,invoice_number,invoice_url,notes,created_by,created_at"
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (registerId !== "all") query = query.eq("register_id", registerId);
    if (dateFrom) query = query.gte("created_at", new Date(dateFrom).toISOString());
    if (dateTo) {
      const nextDay = new Date(dateTo);
      nextDay.setDate(nextDay.getDate() + 1);
      query = query.lt("created_at", nextDay.toISOString());
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingPaidOutTable(error.message)) {
        return NextResponse.json(
          { error: "Run sql/paid_outs.sql first in Supabase." },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = ((data || []) as PaidOutRow[]).map(row => ({
      ...row,
      amount: Number(row.amount || 0),
    }));

    const shiftIds = Array.from(new Set(rows.map(row => row.shift_id)));
    const createdByIds = Array.from(new Set(rows.map(row => row.created_by)));

    const shiftMap = new Map<string, ShiftRow>();
    if (shiftIds.length > 0) {
      const { data: shiftsData } = await supabase
        .from("pos_shifts")
        .select("id,opened_at,closed_at")
        .in("id", shiftIds);
      for (const row of (shiftsData || []) as ShiftRow[]) {
        shiftMap.set(row.id, row);
      }
    }

    const userMap = new Map<string, { name: string; email: string | null }>();
    if (createdByIds.length > 0) {
      const result = (await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      })) as ListUsersResponse;
      const users = result.data?.users || [];
      for (const user of users) {
        if (!createdByIds.includes(user.id)) continue;
        userMap.set(user.id, {
          name: user.user_metadata?.full_name || user.email || user.id.slice(0, 8),
          email: user.email || null,
        });
      }
    }

    const filtered = rows.filter(row => {
      if (!q) return true;
      return (
        row.reason.toLowerCase().includes(q) ||
        String(row.staff_name || "").toLowerCase().includes(q) ||
        String(row.vendor_name || "").toLowerCase().includes(q) ||
        String(row.invoice_number || "").toLowerCase().includes(q) ||
        String(row.register_id || "").toLowerCase().includes(q) ||
        String(userMap.get(row.created_by)?.name || "").toLowerCase().includes(q) ||
        String(userMap.get(row.created_by)?.email || "").toLowerCase().includes(q)
      );
    });

    const totalAmount = filtered.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const todayIso = new Date().toISOString().slice(0, 10);
    const todayAmount = filtered
      .filter(row => row.created_at.slice(0, 10) === todayIso)
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const summary = {
      total_records: filtered.length,
      total_amount: totalAmount,
      today_amount: todayAmount,
      registers: Array.from(new Set(filtered.map(row => row.register_id))).length,
    };

    return NextResponse.json({
      paid_outs: filtered.map(row => ({
        ...row,
        shift: shiftMap.get(row.shift_id) || null,
        staff_name: row.staff_name || null,
        created_by_name: userMap.get(row.created_by)?.name || row.created_by.slice(0, 8),
        created_by_email: userMap.get(row.created_by)?.email || null,
      })),
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load paid outs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
