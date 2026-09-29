import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const revalidate = 0;

// GET — published tournaments, newest first (menu banner + /tournament index).
export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("tournaments")
      .select("id,slug,name,description,logo_url,venue,status,start_at,entry_fee,registration_deadline")
      .eq("published", true)
      .neq("status", "draft")
      .order("start_at", { ascending: false, nullsFirst: false })
      .limit(20);
    if (error) return NextResponse.json({ tournaments: [] });
    return NextResponse.json({ tournaments: data || [] });
  } catch {
    return NextResponse.json({ tournaments: [] });
  }
}
