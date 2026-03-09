import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ShiftRow = {
  id: string;
  register_id: string;
  opened_by: string;
  opened_at: string;
  opening_cash: number | string | null;
  opening_note: string | null;
  status: "open" | "closed";
  closed_by: string | null;
  closed_at: string | null;
  counted_cash: number | string | null;
  expected_cash: number | string | null;
  over_short: number | string | null;
  closing_note: string | null;
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

function toNum(value: number | string | null | undefined) {
  return Number(value || 0);
}

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "all";
  const shortOnly = searchParams.get("short_only") === "1";
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  try {
    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from("pos_shifts")
      .select(
        "id, register_id, opened_by, opened_at, opening_cash, opening_note, status, closed_by, closed_at, counted_cash, expected_cash, over_short, closing_note"
      )
      .order("opened_at", { ascending: false })
      .limit(300);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    if (shortOnly) {
      query = query.lt("over_short", 0);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data || []) as ShiftRow[];

    // Build lightweight user map so admin can see who opened/closed each shift.
    const result = (await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })) as ListUsersResponse;
    const users = result.data?.users || [];
    const userMap = new Map(
      users.map(user => [
        user.id,
        {
          name: user.user_metadata?.full_name || user.email || user.id.slice(0, 8),
          email: user.email || null,
        },
      ])
    );

    const mapped = rows.map(row => {
      const opened = userMap.get(row.opened_by);
      const closed = row.closed_by ? userMap.get(row.closed_by) : undefined;
      return {
        ...row,
        opening_cash: toNum(row.opening_cash),
        counted_cash: row.counted_cash == null ? null : toNum(row.counted_cash),
        expected_cash: row.expected_cash == null ? null : toNum(row.expected_cash),
        over_short: row.over_short == null ? null : toNum(row.over_short),
        opened_by_name: opened?.name || row.opened_by.slice(0, 8),
        opened_by_email: opened?.email || null,
        closed_by_name: closed?.name || null,
        closed_by_email: closed?.email || null,
      };
    });

    const filtered = q
      ? mapped.filter(
          row =>
            row.register_id.toLowerCase().includes(q) ||
            row.opened_by_name.toLowerCase().includes(q) ||
            String(row.opened_by_email || "").toLowerCase().includes(q) ||
            String(row.closed_by_name || "").toLowerCase().includes(q)
        )
      : mapped;

    const summary = mapped.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === "open") acc.open += 1;
        if (row.status === "closed") acc.closed += 1;
        if ((row.over_short || 0) < 0) {
          acc.short_count += 1;
          acc.short_total += Math.abs(Number(row.over_short || 0));
        }
        return acc;
      },
      { total: 0, open: 0, closed: 0, short_count: 0, short_total: 0 }
    );

    return NextResponse.json({
      shifts: filtered,
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load shifts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
