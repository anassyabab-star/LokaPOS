import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const supabase = createSupabaseAdminClient();

  try {
    // Get all staff profiles
    const { data: profiles, error } = await supabase
      .from("staff_profiles")
      .select("user_id, employment_type, hourly_rate, is_active, created_at, updated_at")
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Resolve user names from auth
    const listResult = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const allUsers = listResult.data?.users || [];
    const userMap = new Map(
      allUsers.map(u => [
        u.id,
        {
          name: u.user_metadata?.full_name || u.email || u.id.slice(0, 8),
          email: u.email || null,
        },
      ])
    );

    // Also get all users with cashier role for "add profile" UI
    const cashiers = allUsers.filter(u => {
      const role =
        u.app_metadata?.role || u.user_metadata?.role || null;
      return role === "cashier" || role === "admin";
    });

    const profilesWithNames = (profiles || []).map(p => ({
      ...p,
      name: userMap.get(p.user_id)?.name ?? "Unknown",
      email: userMap.get(p.user_id)?.email ?? null,
    }));

    const staffWithoutProfile = cashiers
      .filter(u => !(profiles || []).find(p => p.user_id === u.id))
      .map(u => ({
        user_id: u.id,
        name: u.user_metadata?.full_name || u.email || u.id.slice(0, 8),
        email: u.email || null,
      }));

    return NextResponse.json({ profiles: profilesWithNames, staffWithoutProfile });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const supabase = createSupabaseAdminClient();
  const body = await req.json().catch(() => ({}));

  const userId = String(body?.user_id || "").trim();
  const hourlyRate = Number(body?.hourly_rate ?? 0);
  const employmentType = body?.employment_type === "fulltime" ? "fulltime" : "parttime";
  const isActive = body?.is_active !== false;

  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });
  if (!Number.isFinite(hourlyRate) || hourlyRate < 0)
    return NextResponse.json({ error: "Invalid hourly_rate" }, { status: 400 });

  try {
    const { data, error } = await supabase
      .from("staff_profiles")
      .upsert(
        [{ user_id: userId, hourly_rate: hourlyRate, employment_type: employmentType, is_active: isActive, updated_at: new Date().toISOString() }],
        { onConflict: "user_id" }
      )
      .select("user_id, hourly_rate, employment_type, is_active")
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, profile: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
