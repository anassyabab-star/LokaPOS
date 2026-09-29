import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// POST { title, message, priority } — shows on participants' home screen live.
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = String(body.title || "").trim().slice(0, 120);
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  const priority = ["normal", "important", "urgent"].includes(String(body.priority)) ? body.priority : "normal";

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tournament_announcements")
    .insert([{ tournament_id: id, title, message: String(body.message || "").trim().slice(0, 2000), priority }])
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ announcement: data });
}
