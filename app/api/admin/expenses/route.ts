import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ExpenseRow = {
  id: string;
  expense_date: string;
  amount: number;
  category: string;
  description: string;
  vendor_name: string | null;
  payment_method: string;
  invoice_number: string | null;
  invoice_url: string | null;
  invoice_file_name: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type PaidOutSummaryRow = {
  amount: number | null;
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

const ALLOWED_CATEGORIES = new Set([
  "inventory",
  "equipment",
  "utilities",
  "rent",
  "salary",
  "maintenance",
  "marketing",
  "other",
]);

const ALLOWED_PAYMENT_METHODS = new Set([
  "cash_drawer",
  "bank_transfer",
  "card",
  "online",
  "other",
]);

function isMissingTable(message: string | null | undefined, table: string) {
  const m = String(message || "").toLowerCase();
  return m.includes(table) && (m.includes("does not exist") || m.includes("schema cache"));
}

function parseMonthRange(monthInput?: string | null) {
  const now = new Date();
  const fallbackMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const month = String(monthInput || fallbackMonth);

  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error("Invalid month format. Use YYYY-MM");

  const year = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error("Invalid month format. Use YYYY-MM");
  }

  const start = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, m, 1, 0, 0, 0));

  return {
    month: `${year}-${String(m).padStart(2, "0")}`,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    const category = (searchParams.get("category") || "all").toLowerCase();
    const paymentMethod = (searchParams.get("payment_method") || "all").toLowerCase();
    const { month, startIso, endIso } = parseMonthRange(searchParams.get("month"));

    const supabase = createSupabaseAdminClient();
    let query = supabase
      .from("expenses")
      .select(
        "id,expense_date,amount,category,description,vendor_name,payment_method,invoice_number,invoice_url,invoice_file_name,notes,created_by,created_at,updated_at"
      )
      .gte("expense_date", startIso.slice(0, 10))
      .lt("expense_date", endIso.slice(0, 10))
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000);

    if (category !== "all") query = query.eq("category", category);
    if (paymentMethod !== "all") query = query.eq("payment_method", paymentMethod);

    const { data, error } = await query;
    if (error) {
      if (isMissingTable(error.message, "expenses")) {
        return NextResponse.json({ error: "Run sql/expenses.sql first in Supabase." }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = ((data || []) as ExpenseRow[]).map(row => ({
      ...row,
      amount: Number(row.amount || 0),
    }));

    const filtered = rows.filter(row => {
      if (!q) return true;
      return (
        row.description.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q) ||
        String(row.vendor_name || "").toLowerCase().includes(q) ||
        String(row.invoice_number || "").toLowerCase().includes(q) ||
        String(row.notes || "").toLowerCase().includes(q)
      );
    });

    const userIds = Array.from(
      new Set(
        filtered
          .map(row => row.created_by)
          .filter((id): id is string => Boolean(id))
      )
    );
    const userMap = new Map<string, { name: string; email: string | null }>();

    if (userIds.length > 0) {
      const result = (await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      })) as ListUsersResponse;
      for (const user of result.data?.users || []) {
        if (!userIds.includes(user.id)) continue;
        userMap.set(user.id, {
          name: user.user_metadata?.full_name || user.email || user.id.slice(0, 8),
          email: user.email || null,
        });
      }
    }

    const monthExpenseTotal = filtered.reduce((sum, row) => sum + Number(row.amount || 0), 0);

    let monthPaidOutTotal = 0;
    const { data: paidOutData, error: paidOutError } = await supabase
      .from("paid_outs")
      .select("amount")
      .gte("created_at", startIso)
      .lt("created_at", endIso);

    if (!paidOutError) {
      monthPaidOutTotal = ((paidOutData || []) as PaidOutSummaryRow[]).reduce(
        (sum, row) => sum + Number(row.amount || 0),
        0
      );
    } else if (!isMissingTable(paidOutError.message, "paid_outs")) {
      return NextResponse.json({ error: paidOutError.message }, { status: 500 });
    }

    const summary = {
      month,
      total_records: filtered.length,
      month_expenses_total: monthExpenseTotal,
      month_paid_out_total: monthPaidOutTotal,
      month_total_outflow: monthExpenseTotal + monthPaidOutTotal,
      by_category: filtered.reduce<Record<string, number>>((acc, row) => {
        acc[row.category] = (acc[row.category] || 0) + Number(row.amount || 0);
        return acc;
      }, {}),
    };

    return NextResponse.json({
      summary,
      expenses: filtered.map(row => ({
        ...row,
        created_by_name: row.created_by ? userMap.get(row.created_by)?.name || row.created_by.slice(0, 8) : null,
        created_by_email: row.created_by ? userMap.get(row.created_by)?.email || null : null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load expenses";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as {
      expense_date?: string;
      amount?: number;
      category?: string;
      description?: string;
      vendor_name?: string;
      payment_method?: string;
      invoice_number?: string;
      invoice_url?: string;
      invoice_file_name?: string;
      notes?: string;
    };

    const expenseDate = String(body.expense_date || "").trim();
    const amount = Number(body.amount || 0);
    const category = String(body.category || "other").trim().toLowerCase();
    const description = String(body.description || "").trim();
    const paymentMethod = String(body.payment_method || "bank_transfer").trim().toLowerCase();
    const invoiceUrl = String(body.invoice_url || "").trim();

    if (!expenseDate || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      return NextResponse.json({ error: "Invalid expense date" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Amount must be more than 0" }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json({ error: "Description is required" }, { status: 400 });
    }
    if (!ALLOWED_CATEGORIES.has(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
      return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    }
    if (invoiceUrl && !/^https?:\/\//i.test(invoiceUrl)) {
      return NextResponse.json({ error: "Invoice URL must start with http:// or https://" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("expenses")
      .insert({
        expense_date: expenseDate,
        amount,
        category,
        description,
        vendor_name: String(body.vendor_name || "").trim() || null,
        payment_method: paymentMethod,
        invoice_number: String(body.invoice_number || "").trim() || null,
        invoice_url: invoiceUrl || null,
        invoice_file_name: String(body.invoice_file_name || "").trim() || null,
        notes: String(body.notes || "").trim() || null,
        created_by: auth.user.id,
      })
      .select("id")
      .single();

    if (error) {
      if (isMissingTable(error.message, "expenses")) {
        return NextResponse.json({ error: "Run sql/expenses.sql first in Supabase." }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, expense_id: data.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create expense";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
