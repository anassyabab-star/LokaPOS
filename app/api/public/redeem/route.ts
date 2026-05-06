import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const TIERS = [
  { points: 100, reward: "RM1" },
  { points: 300, reward: "RM3" },
  { points: 500, reward: "RM5" },
  { points: 1000, reward: "RM12" },
];

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const rawPhone = String(body?.phone || "").trim();
  const points = Number(body?.points);

  const tier = TIERS.find(t => t.points === points);
  if (!tier) return NextResponse.json({ error: "Tier tidak sah" }, { status: 400 });

  const phone = rawPhone.replace(/[^\d+]/g, "");
  if (!phone || phone.replace(/[^\d]/g, "").length < 8) {
    return NextResponse.json({ error: "No telefon tidak sah" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  if (!customer) {
    return NextResponse.json({ error: "Akaun tidak dijumpai. Buat order dahulu untuk daftar." }, { status: 404 });
  }

  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const { data: ledger } = await supabase
    .from("loyalty_ledger")
    .select("points_change")
    .eq("customer_id", customer.id)
    .gte("created_at", oneYearAgo);

  const currentPoints = (ledger || []).reduce((s: number, r: { points_change: number | null }) => s + Number(r.points_change || 0), 0);

  if (currentPoints < tier.points) {
    return NextResponse.json({ error: `Mata tidak mencukupi (ada: ${Math.max(0, currentPoints)} pts, perlu: ${tier.points} pts)` }, { status: 400 });
  }

  const code = `${Math.random().toString(36).slice(2, 5).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

  const { error } = await supabase.from("loyalty_ledger").insert({
    customer_id: customer.id,
    entry_type: "redeem",
    points_change: -tier.points,
    note: `Tebus ${tier.reward} — Voucher: ${code}`,
    created_by: null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, code, reward: tier.reward, points_spent: tier.points });
}
