import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const FIELDS =
  "id,code,name,description,active,type,threshold,window_days,weekday,qualifying_min_spend,reward_points,reward_free_product_id,reward_free_category_id,reward_free_label,reward_voucher_expiry_days,repeatable,created_at";

// PATCH — update a mission definition (partial).
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const allow = [
    "name", "description", "active", "type", "threshold", "window_days", "weekday",
    "qualifying_min_spend", "reward_points", "reward_free_label", "reward_free_product_id",
    "reward_free_category_id", "reward_voucher_expiry_days", "repeatable",
  ] as const;
  for (const k of allow) if (k in body) update[k] = body[k];

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("mission_definitions")
    .update(update)
    .eq("id", id)
    .select(FIELDS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, mission: data });
}

// DELETE — remove a mission definition.
export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("mission_definitions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
