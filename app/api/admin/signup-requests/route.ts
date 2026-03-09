import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "all";

  try {
    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from("signup_requests")
      .select(
        "id, email, full_name, requested_role, status, requested_at, reviewed_at, reviewed_by, review_note"
      )
      .order("requested_at", { ascending: false })
      .limit(300);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data || [];

    const { data: allRows, error: allRowsError } = await supabase
      .from("signup_requests")
      .select("status");

    if (allRowsError) {
      return NextResponse.json({ error: allRowsError.message }, { status: 500 });
    }

    const counts = (allRows || []).reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === "pending") acc.pending += 1;
        if (row.status === "approved") acc.approved += 1;
        if (row.status === "rejected") acc.rejected += 1;
        return acc;
      },
      { total: 0, pending: 0, approved: 0, rejected: 0 }
    );

    return NextResponse.json({ requests: rows, counts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load signup requests";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
