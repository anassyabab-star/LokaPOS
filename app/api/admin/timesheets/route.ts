import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const supabase = createSupabaseAdminClient();
  const { searchParams } = new URL(req.url);

  const userId = searchParams.get("user_id") || null;
  const dateFrom = searchParams.get("date_from") || null;
  const dateTo = searchParams.get("date_to") || null;

  try {
    // Load part-time staff profiles
    const { data: profiles, error: profileError } = await supabase
      .from("staff_profiles")
      .select("user_id, hourly_rate, employment_type, is_active")
      .eq("employment_type", "parttime");

    if (profileError) throw profileError;

    const profileMap = new Map(
      (profiles || []).map(p => [p.user_id, p])
    );

    // Resolve user names
    const listResult = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const userMap = new Map(
      (listResult.data?.users || []).map(u => [
        u.id,
        { name: u.user_metadata?.full_name || u.email || u.id.slice(0, 8), email: u.email || null },
      ])
    );

    // Query clockins
    let query = supabase
      .from("staff_clockins")
      .select("id, user_id, clock_in_at, clock_out_at, duration_minutes, notes")
      .not("clock_out_at", "is", null) // only completed sessions
      .order("clock_in_at", { ascending: false });

    if (userId) query = query.eq("user_id", userId);
    if (dateFrom) query = query.gte("clock_in_at", `${dateFrom}T00:00:00+08:00`);
    if (dateTo) query = query.lte("clock_in_at", `${dateTo}T23:59:59+08:00`);

    const { data: clockins, error: clockinError } = await query;
    if (clockinError) throw clockinError;

    // Group by user
    const byUser: Record<string, {
      user_id: string;
      name: string;
      email: string | null;
      hourly_rate: number;
      records: Array<{
        id: string;
        clock_in_at: string;
        clock_out_at: string;
        duration_minutes: number;
        notes: string | null;
        hours: number;
        salary: number;
      }>;
      total_minutes: number;
      total_hours: number;
      total_salary: number;
    }> = {};

    for (const row of clockins || []) {
      const profile = profileMap.get(row.user_id);
      const hourlyRate = profile ? Number(profile.hourly_rate) : 0;
      const durationMins = Number(row.duration_minutes || 0);
      const hours = durationMins / 60;
      const salary = hours * hourlyRate;

      if (!byUser[row.user_id]) {
        byUser[row.user_id] = {
          user_id: row.user_id,
          name: userMap.get(row.user_id)?.name ?? "Unknown",
          email: userMap.get(row.user_id)?.email ?? null,
          hourly_rate: hourlyRate,
          records: [],
          total_minutes: 0,
          total_hours: 0,
          total_salary: 0,
        };
      }

      byUser[row.user_id].records.push({
        id: row.id,
        clock_in_at: row.clock_in_at,
        clock_out_at: row.clock_out_at,
        duration_minutes: durationMins,
        notes: row.notes,
        hours: Math.round(hours * 100) / 100,
        salary: Math.round(salary * 100) / 100,
      });

      byUser[row.user_id].total_minutes += durationMins;
    }

    // Calculate totals
    for (const staff of Object.values(byUser)) {
      staff.total_hours = Math.round((staff.total_minutes / 60) * 100) / 100;
      staff.total_salary = Math.round((staff.total_hours * staff.hourly_rate) * 100) / 100;
    }

    const staffList = Object.values(byUser).sort((a, b) => a.name.localeCompare(b.name));
    const grandTotalSalary = staffList.reduce((s, x) => s + x.total_salary, 0);

    return NextResponse.json({ staff: staffList, grand_total_salary: grandTotalSalary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
