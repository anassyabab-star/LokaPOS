import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const FIELDS =
  "id,code,name,description,active,discount_type,discount_value,max_discount,applies_to,product_id,category_id,min_spend,validity_days,issue_trigger,issue_min_spend,one_active_per_customer,created_at";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const allow = [
    "name", "description", "active", "discount_type", "discount_value", "max_discount",
    "applies_to", "product_id", "category_id", "min_spend", "validity_days",
    "issue_min_spend", "one_active_per_customer",
  ] as const;
  for (const k of allow) if (k in body) update[k] = body[k];

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("coupon_templates")
    .update(update)
    .eq("id", id)
    .select(FIELDS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, coupon: data });
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("coupon_templates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
