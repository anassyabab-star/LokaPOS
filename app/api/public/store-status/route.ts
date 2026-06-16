import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_LOYALTY_CONFIG, getLoyaltyConfig } from "@/lib/loyalty";
import { isKdsEnabled } from "@/lib/kds";

export const revalidate = 0;

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const [{ data: shift }, { data: settings }, loyalty_config, kds_enabled] = await Promise.all([
      supabase.from("pos_shifts").select("id").eq("register_id", "main").eq("status", "open").limit(1).maybeSingle(),
      supabase.from("store_settings").select("payment_methods").eq("id", "main").maybeSingle(),
      getLoyaltyConfig(),
      isKdsEnabled(),
    ]);

    const payment_methods = (settings?.payment_methods as Record<string, boolean>) ?? { fpx: true, cash: true, card: false };
    return NextResponse.json({ is_open: Boolean(shift), payment_methods, loyalty_config, kds_enabled });
  } catch {
    return NextResponse.json({
      is_open: false,
      payment_methods: { fpx: true, cash: true, card: false },
      loyalty_config: DEFAULT_LOYALTY_CONFIG,
      kds_enabled: false,
    });
  }
}
