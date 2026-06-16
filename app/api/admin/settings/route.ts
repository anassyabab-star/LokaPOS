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
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

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
