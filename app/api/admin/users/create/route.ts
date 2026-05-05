import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "").trim();
  const fullName = String(body?.full_name || "").trim();
  const role = ["admin", "cashier"].includes(String(body?.role)) ? String(body.role) : "cashier";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Email tidak valid" }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Password mesti sekurang-kurangnya 6 aksara" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || email.split("@")[0] },
      app_metadata: { role },
    });

    if (error) {
      if (error.message?.toLowerCase().includes("already been registered") ||
          error.message?.toLowerCase().includes("already exists") ||
          error.message?.toLowerCase().includes("already registered")) {
        return NextResponse.json({ error: "Email ini sudah berdaftar." }, { status: 409 });
      }
      throw error;
    }

    if (data.user) {
      await supabase.from("profiles").upsert(
        { id: data.user.id, full_name: fullName || email.split("@")[0], role, status: "active" },
        { onConflict: "id" }
      );
    }

    return NextResponse.json({ success: true, user_id: data.user?.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal cipta akaun";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
