import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_LOYALTY_CONFIG, getLoyaltyConfig } from "@/lib/loyalty";
import { isKdsEnabled } from "@/lib/kds";
import { DEFAULT_UNPAID_EXPIRY_MINUTES } from "@/lib/order-expiry";
import { orderNotificationsEnabled } from "@/lib/whatsapp";

export const revalidate = 0;

const DEFAULT_PAYMENT_METHODS = { fpx: true, cash: true, card: false };

type SettingsRow = {
  payment_methods?: Record<string, boolean> | null;
  dine_in_tables?: unknown;
  unpaid_order_expiry_minutes?: number | null;
};

async function loadSettings(supabase: ReturnType<typeof createSupabaseAdminClient>): Promise<SettingsRow | null> {
  // Tolerant of a DB that hasn't run the pay-at-counter migration yet.
  const full = await supabase
    .from("store_settings")
    .select("payment_methods, dine_in_tables, unpaid_order_expiry_minutes")
    .eq("id", "main")
    .maybeSingle();
  if (!full.error) return (full.data as SettingsRow | null) || null;

  const base = await supabase.from("store_settings").select("payment_methods").eq("id", "main").maybeSingle();
  return (base.data as SettingsRow | null) || null;
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const [{ data: shift }, settings, loyalty_config, kds_enabled] = await Promise.all([
      supabase.from("pos_shifts").select("id").eq("register_id", "main").eq("status", "open").limit(1).maybeSingle(),
      loadSettings(supabase),
      getLoyaltyConfig(),
      isKdsEnabled(),
    ]);

    const payment_methods = (settings?.payment_methods as Record<string, boolean>) ?? DEFAULT_PAYMENT_METHODS;
    const dine_in_tables = Array.isArray(settings?.dine_in_tables)
      ? (settings!.dine_in_tables as unknown[]).map(t => String(t ?? "").trim()).filter(Boolean)
      : [];
    const unpaid_order_expiry_minutes = Number.isFinite(Number(settings?.unpaid_order_expiry_minutes))
      ? Number(settings?.unpaid_order_expiry_minutes)
      : DEFAULT_UNPAID_EXPIRY_MINUTES;

    return NextResponse.json({
      is_open: Boolean(shift),
      payment_methods,
      loyalty_config,
      kds_enabled,
      dine_in_tables,
      unpaid_order_expiry_minutes,
      whatsapp_order_notifications: orderNotificationsEnabled(),
    });
  } catch {
    return NextResponse.json({
      is_open: false,
      payment_methods: DEFAULT_PAYMENT_METHODS,
      loyalty_config: DEFAULT_LOYALTY_CONFIG,
      kds_enabled: false,
      dine_in_tables: [],
      unpaid_order_expiry_minutes: DEFAULT_UNPAID_EXPIRY_MINUTES,
    });
  }
}
