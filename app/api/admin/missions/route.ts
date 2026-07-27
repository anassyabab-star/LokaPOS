import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const FIELDS =
  "id,code,name,description,active,type,threshold,window_days,weekday,qualifying_min_spend,reward_points,reward_free_product_id,reward_free_category_id,reward_free_label,reward_voucher_expiry_days,repeatable,created_at";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const supabase = createSupabaseAdminClient();
  const { data: missions, error } = await supabase
    .from("mission_definitions")
    .select(FIELDS)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Per-mission progress counts (small N → a couple of head counts each).
  const withCounts = await Promise.all(
    (missions || []).map(async m => {
      const [{ count: inProgress }, { count: completed }] = await Promise.all([
        supabase.from("mission_progress").select("id", { count: "exact", head: true })
          .eq("mission_id", m.id).eq("status", "in_progress"),
        supabase.from("mission_progress").select("id", { count: "exact", head: true })
          .eq("mission_id", m.id).eq("status", "completed"),
      ]);
      return { ...m, in_progress: inProgress || 0, completed: completed || 0 };
    })
  );

  return NextResponse.json({ missions: withCounts });
}

function parseBody(body: Record<string, unknown>) {
  const type = body.type === "count_on_weekday_in_window" ? "count_on_weekday_in_window" : "count_in_window";
  return {
    code: String(body.code || "").trim(),
    name: String(body.name || "").trim(),
    description: body.description != null ? String(body.description).trim() : null,
    active: body.active !== false,
    type,
    threshold: Math.max(1, Math.floor(Number(body.threshold) || 1)),
    window_days: Math.max(1, Math.floor(Number(body.window_days) || 8)),
    weekday: type === "count_on_weekday_in_window" && body.weekday != null ? Math.max(0, Math.min(6, Math.floor(Number(body.weekday)))) : null,
    qualifying_min_spend: Math.max(0, Number(body.qualifying_min_spend) || 0),
    reward_points: Math.max(0, Math.floor(Number(body.reward_points) || 0)),
    reward_free_label: body.reward_free_label != null ? String(body.reward_free_label).trim() || null : null,
    reward_free_product_id: body.reward_free_product_id ? String(body.reward_free_product_id) : null,
    reward_free_category_id: body.reward_free_category_id ? String(body.reward_free_category_id) : null,
    reward_voucher_expiry_days: Math.max(1, Math.floor(Number(body.reward_voucher_expiry_days) || 30)),
    repeatable: body.repeatable !== false,
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const row = parseBody(body);
  if (!row.code) return NextResponse.json({ error: "Kod diperlukan" }, { status: 400 });
  if (!row.name) return NextResponse.json({ error: "Nama diperlukan" }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("mission_definitions")
    .insert([row])
    .select(FIELDS)
    .single();
  if (error) {
    const msg = String(error.message).toLowerCase().includes("unique") ? "Kod mission sudah wujud." : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ success: true, mission: data });
}
