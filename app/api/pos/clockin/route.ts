import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";

const supabase = createSupabaseAdminClient();

export async function GET() {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  try {
    // Get staff profile
    const { data: profile } = await supabase
      .from("staff_profiles")
      .select("hourly_rate, employment_type, is_active")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    // Get open clockin (no clock_out_at)
    const { data: clockin } = await supabase
      .from("staff_clockins")
      .select("id, clock_in_at, notes")
      .eq("user_id", auth.user.id)
      .is("clock_out_at", null)
      .order("clock_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ profile: profile ?? null, clockin: clockin ?? null });
  } catch (err) {
    return NextResponse.json({ error: "Failed to load status" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");

  try {
    if (action === "clockin") {
      // Check if already clocked in
      const { data: existing } = await supabase
        .from("staff_clockins")
        .select("id")
        .eq("user_id", auth.user.id)
        .is("clock_out_at", null)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ error: "Sudah clock in." }, { status: 409 });
      }

      const { data, error } = await supabase
        .from("staff_clockins")
        .insert([{ user_id: auth.user.id, clock_in_at: new Date().toISOString() }])
        .select("id, clock_in_at")
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, clockin: data });
    }

    if (action === "clockout") {
      const { data: open } = await supabase
        .from("staff_clockins")
        .select("id, clock_in_at")
        .eq("user_id", auth.user.id)
        .is("clock_out_at", null)
        .order("clock_in_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!open) {
        return NextResponse.json({ error: "Tiada sesi clock in aktif." }, { status: 409 });
      }

      const clockOutAt = new Date();
      const clockInAt = new Date(open.clock_in_at);
      const durationMinutes = Math.round((clockOutAt.getTime() - clockInAt.getTime()) / 60000);

      const { data, error } = await supabase
        .from("staff_clockins")
        .update({
          clock_out_at: clockOutAt.toISOString(),
          duration_minutes: durationMinutes,
          notes: String(body?.notes || "").trim() || null,
        })
        .eq("id", open.id)
        .select("id, clock_in_at, clock_out_at, duration_minutes")
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, clockin: data });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
