import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const FIELDS =
  "id,code,name,description,active,discount_type,discount_value,max_discount,applies_to,product_id,category_id,min_spend,validity_days,issue_trigger,issue_min_spend,one_active_per_customer,created_at";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const supabase = createSupabaseAdminClient();
  const { data: templates, error } = await supabase
    .from("coupon_templates")
    .select(FIELDS)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Count issued/redeemed vouchers per template code.
  const withCounts = await Promise.all(
    (templates || []).map(async t => {
      const [{ count: issued }, { count: redeemed }] = await Promise.all([
        supabase.from("vouchers").select("id", { count: "exact", head: true })
          .eq("source", "coupon").eq("source_ref", t.code).eq("status", "issued"),
        supabase.from("vouchers").select("id", { count: "exact", head: true })
          .eq("source", "coupon").eq("source_ref", t.code).eq("status", "redeemed"),
      ]);
      return { ...t, issued_count: issued || 0, redeemed_count: redeemed || 0 };
    })
  );

  return NextResponse.json({ coupons: withCounts });
}

function parseBody(body: Record<string, unknown>) {
  const discountType = body.discount_type === "fixed" ? "fixed" : "percent";
  const appliesTo = ["product", "category", "all"].includes(String(body.applies_to)) ? String(body.applies_to) : "all";
  return {
    code: String(body.code || "").trim().toUpperCase(),
    name: String(body.name || "").trim(),
    description: body.description != null ? String(body.description).trim() : null,
    active: body.active !== false,
    discount_type: discountType,
    discount_value: Math.max(0, Number(body.discount_value) || 0),
    max_discount: body.max_discount != null && body.max_discount !== "" ? Math.max(0, Number(body.max_discount)) : null,
    applies_to: appliesTo,
    product_id: appliesTo === "product" && body.product_id ? String(body.product_id) : null,
    category_id: appliesTo === "category" && body.category_id ? String(body.category_id) : null,
    min_spend: Math.max(0, Number(body.min_spend) || 0),
    validity_days: Math.max(1, Math.floor(Number(body.validity_days) || 14)),
    issue_trigger: "on_paid",
    issue_min_spend: Math.max(0, Number(body.issue_min_spend) || 0),
    one_active_per_customer: body.one_active_per_customer !== false,
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const row = parseBody(body);
  if (!row.code) return NextResponse.json({ error: "Kod diperlukan" }, { status: 400 });
  if (!row.name) return NextResponse.json({ error: "Nama diperlukan" }, { status: 400 });
  if (row.discount_value <= 0) return NextResponse.json({ error: "Nilai diskaun tidak sah" }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("coupon_templates")
    .insert([row])
    .select(FIELDS)
    .single();
  if (error) {
    const msg = String(error.message).toLowerCase().includes("unique") ? "Kod coupon sudah wujud." : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ success: true, coupon: data });
}
