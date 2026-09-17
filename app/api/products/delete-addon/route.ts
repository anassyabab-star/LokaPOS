import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin-api-auth";

const supabase = createSupabaseAdminClient();

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "Addon id required" }, { status: 400 });
  }

  const { error } = await supabase.from("product_addons").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
