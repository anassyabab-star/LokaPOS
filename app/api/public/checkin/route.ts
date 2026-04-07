import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const phone = String(body?.phone || "").trim();

  if (!phone || phone.replace(/[^\d]/g, "").length < 8) {
    return NextResponse.json({ error: "No telefon diperlukan" }, { status: 400 });
  }

  const normalizedPhone = phone.replace(/[^\d+]/g, "");
  const supabase = createSupabaseAdminClient();

  // Find customer by phone
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (!customer) {
    return NextResponse.json({ error: "Pelanggan tidak dijumpai. Buat order dulu untuk daftar." }, { status: 404 });
  }

  // Check if already checked in today (MYT)
  const todayMyt = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" });
  const startOfToday = `${todayMyt}T00:00:00+08:00`;
  const endOfToday = `${todayMyt}T23:59:59+08:00`;

  const { data: existingCheckin } = await supabase
    .from("loyalty_ledger")
    .select("id")
    .eq("customer_id", customer.id)
    .eq("entry_type", "checkin")
    .gte("created_at", startOfToday)
    .lte("created_at", endOfToday)
    .maybeSingle();

  if (existingCheckin) {
    return NextResponse.json({ already_checked_in: true, message: "Dah check-in hari ini. Jumpa lagi esok!" });
  }

  // Award 1 point
  const { error: insertError } = await supabase.from("loyalty_ledger").insert([
    {
      customer_id: customer.id,
      entry_type: "checkin",
      points_change: 1,
      note: `Daily check-in ${todayMyt}`,
      created_by: "customer_self",
    },
  ]);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, points_earned: 1 });
}
