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
    // Asked on every /menu load (tournament banner) — a minute's cache is plenty.
    return NextResponse.json(
      { tournaments: data || [] },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch {
    return NextResponse.json({ tournaments: [] });
  }
}
