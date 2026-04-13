import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  const fullName = String(body?.full_name || "").trim();
  const role = body?.role === "admin" ? "admin" : "cashier";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Email tidak valid" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  try {
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName || email.split("@")[0],
        role,
      },
    });

    if (error) {
      // Supabase returns 422 if user already exists
      if (error.message?.toLowerCase().includes("already been registered") ||
          error.message?.toLowerCase().includes("already exists")) {
        return NextResponse.json({ error: "Email ini sudah berdaftar." }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, user_id: data.user?.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal hantar jemputan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
