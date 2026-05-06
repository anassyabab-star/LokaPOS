import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const revalidate = 0;

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const [{ data: shift }, { data: settings }] = await Promise.all([
      supabase.from("pos_shifts").select("id").eq("register_id", "main").eq("status", "open").limit(1).maybeSingle(),
      supabase.from("store_settings").select("payment_methods").eq("id", "main").maybeSingle(),
    ]);

    const payment_methods = (settings?.payment_methods as Record<string, boolean>) ?? { fpx: true, cash: true, card: false };
    return NextResponse.json({ is_open: Boolean(shift), payment_methods });
  } catch {
    return NextResponse.json({ is_open: false, payment_methods: { fpx: true, cash: true, card: false } });
  }
}
