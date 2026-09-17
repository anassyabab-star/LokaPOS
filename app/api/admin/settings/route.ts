import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { clearKdsCache } from "@/lib/kds";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("store_settings").select("*").eq("id", "main").maybeSingle();
  return NextResponse.json(data ?? { id: "main", payment_methods: { fpx: true, cash: true, card: false } });
}

export async function PATCH(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Pay-at-counter settings: validate before the blind upsert.
  if (Object.prototype.hasOwnProperty.call(body, "dine_in_tables")) {
    if (!Array.isArray(body.dine_in_tables)) {
      return NextResponse.json({ error: "dine_in_tables mesti senarai" }, { status: 400 });
    }
    const cleaned = Array.from(
      new Set(
        (body.dine_in_tables as unknown[])
          .map(t => String(t ?? "").trim().replace(/[^\w-]/g, "").slice(0, 10))
          .filter(Boolean)
      )
    ).slice(0, 200);
    body.dine_in_tables = cleaned;
  }
  if (Object.prototype.hasOwnProperty.call(body, "unpaid_order_expiry_minutes")) {
    const n = Math.floor(Number(body.unpaid_order_expiry_minutes));
    if (!Number.isFinite(n) || n < 0 || n > 1440) {
      return NextResponse.json({ error: "unpaid_order_expiry_minutes mesti 0–1440" }, { status: 400 });
    }
    body.unpaid_order_expiry_minutes = n;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("store_settings")
    .upsert({ id: "main", ...body, updated_at: new Date().toISOString() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Reflect a KDS toggle change immediately on this instance (cross-instance lag
  // is bounded by the 30s cache TTL).
  if (Object.prototype.hasOwnProperty.call(body, "kds_enabled")) clearKdsCache();
  return NextResponse.json(data);
}
