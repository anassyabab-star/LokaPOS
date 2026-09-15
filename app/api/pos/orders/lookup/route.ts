import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";
import { isMissingColumnError } from "@/lib/order-status";
import { myDateKey, receiptNumberFor } from "@/lib/order-numbering";
import { shortOrderNumber } from "@/lib/order-flow";

// ============================================================================
// GET /api/pos/orders/lookup?q=…  — cashier looks up the order a customer quotes.
//
//   q = "42" / "#042"          → today's receipt 15092026-042 (also the open shift's day)
//   q = "15092026-042"         → exact receipt number
//   q = uuid                   → order id (from a scanned QR)
//   q = "0123456789"           → customer phone (orders from the last 2 days)
//   anything else              → customer name (today)
//
// Returns { orders: [...] } — awaiting_payment first, then newest first.
// ============================================================================

const FULL_COLS =
  "id, receipt_number, customer_name, customer_id, total, payment_method, payment_status, status, created_at, " +
  "order_source, order_type, table_number, buzzer_number, paid_at";
const BASE_COLS =
  "id, receipt_number, customer_name, customer_id, total, payment_method, payment_status, status, created_at, order_source";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT = 20;

type OrderRow = {
  id: string;
  receipt_number: string | null;
  customer_name: string | null;
  customer_id: string | null;
  total: number | null;
  payment_method: string | null;
  payment_status: string | null;
  status: string | null;
  created_at: string;
  order_source?: string | null;
  order_type?: string | null;
  table_number?: string | null;
  buzzer_number?: string | null;
  paid_at?: string | null;
};

type Client = ReturnType<typeof createSupabaseAdminClient>;
type Builder = ReturnType<ReturnType<Client["from"]>["select"]>;

async function runQuery(supabase: Client, apply: (q: Builder) => Builder): Promise<OrderRow[]> {
  let { data, error } = await apply(supabase.from("orders").select(FULL_COLS) as Builder);
  if (error && isMissingColumnError(error.message)) {
    ({ data, error } = await apply(supabase.from("orders").select(BASE_COLS) as Builder));
  }
  if (error) throw error;
  return ((data || []) as unknown as OrderRow[]);
}

function rank(status: string | null) {
  const s = String(status || "").toLowerCase();
  if (s === "awaiting_payment") return 0;
  if (s === "ready") return 1;
  if (s === "pending" || s === "preparing") return 2;
  if (s === "completed") return 3;
  return 4;
}

export async function GET(req: Request) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const q = String(searchParams.get("q") || "").trim().replace(/^#/, "").trim();
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });

  try {
    const supabase = createSupabaseAdminClient();
    const todayKey = myDateKey();
    let rows: OrderRow[] = [];

    if (UUID_RE.test(q)) {
      rows = await runQuery(supabase, b => b.eq("id", q).limit(1));
    } else if (/^\d{1,4}$/.test(q)) {
      // Short daily number — today, plus the open shift's business day (overnight shifts).
      const keys = new Set<string>([todayKey]);
      const { data: openShift } = await supabase
        .from("pos_shifts")
        .select("opened_at")
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (openShift?.opened_at) keys.add(myDateKey(new Date(openShift.opened_at)));
      const receipts = [...keys].map(k => receiptNumberFor(k, q));
      rows = await runQuery(supabase, b => b.in("receipt_number", receipts).limit(LIMIT));
    } else if (/^\d{8}-\d{1,}$/.test(q)) {
      const [date, seq] = q.split("-");
      const receipt = `${date}-${seq.padStart(3, "0")}`;
      rows = await runQuery(supabase, b => b.eq("receipt_number", receipt).limit(LIMIT));
    } else if (/^\+?\d{8,}$/.test(q)) {
      const phone = q.replace(/[^\d+]/g, "");
      const candidates = new Set<string>([phone]);
      if (phone.startsWith("+")) candidates.add(phone.slice(1));
      else candidates.add(`+${phone}`);
      const { data: customers } = await supabase
        .from("customers")
        .select("id")
        .in("phone", [...candidates]);
      const ids = (customers || []).map(c => String((c as { id: string }).id));
      if (ids.length > 0) {
        const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
        rows = await runQuery(supabase, b =>
          b.in("customer_id", ids).gte("created_at", since).order("created_at", { ascending: false }).limit(LIMIT)
        );
      }
    } else {
      const needle = q.replace(/[%_]/g, "");
      rows = await runQuery(supabase, b =>
        b.ilike("customer_name", `%${needle}%`).eq("date_key", todayKey).order("created_at", { ascending: false }).limit(LIMIT)
      );
    }

    rows.sort((a, b) => {
      const r = rank(a.status) - rank(b.status);
      if (r !== 0) return r;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return NextResponse.json({
      orders: rows.map(o => ({
        ...o,
        order_type: o.order_type ?? null,
        table_number: o.table_number ?? null,
        buzzer_number: o.buzzer_number ?? null,
        paid_at: o.paid_at ?? null,
        short_number: shortOrderNumber(o.receipt_number, o.id),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lookup failed";
    return NextResponse.json({ orders: [], error: message }, { status: 500 });
  }
}
