import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const revalidate = 0;

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("pos_shifts")
      .select("id, opened_at")
      .eq("register_id", "main")
      .eq("status", "open")
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ is_open: Boolean(data) });
  } catch {
    return NextResponse.json({ is_open: false });
  }
}
