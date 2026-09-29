import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function DELETE(_req: Request, context: { params: Promise<{ id: string; annId: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id, annId } = await context.params;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("tournament_announcements").delete().eq("id", annId).eq("tournament_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
