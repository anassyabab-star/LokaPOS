import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Action = "approve" | "reject";

type ListUsersResponse = {
  data?: {
    users?: Array<{ id: string; email?: string | null }>;
  };
  error?: { message?: string } | null;
};

async function findUserIdByEmail(email: string) {
  const supabase = createSupabaseAdminClient();
  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const result = (await supabase.auth.admin.listUsers({
      page,
      perPage,
    })) as ListUsersResponse;
    const users = result.data?.users || [];
    const found = users.find(u => (u.email || "").toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "") as Action;
  const reviewNote = String(body?.review_note || "").trim();

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    const { data: requestRow, error: fetchError } = await supabase
      .from("signup_requests")
      .select("id, email, full_name, requested_role, status")
      .eq("id", id)
      .single();

    if (fetchError || !requestRow) {
      return NextResponse.json({ error: "Signup request not found" }, { status: 404 });
    }

    if (requestRow.status !== "pending") {
      return NextResponse.json(
        { error: `Request already ${requestRow.status}` },
        { status: 409 }
      );
    }

    let tempPassword: string | null = null;

    if (action === "approve") {
      let userId: string | null = await findUserIdByEmail(requestRow.email);

      if (!userId) {
        // User belum wujud — create terus dengan temp password (tiada email diperlukan)
        const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        tempPassword = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

        const { data: created, error: createError } = await supabase.auth.admin.createUser({
          email: requestRow.email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: requestRow.full_name },
          app_metadata: { role: requestRow.requested_role },
        });

        if (createError) {
          return NextResponse.json({ error: createError.message }, { status: 400 });
        }
        userId = created.user?.id || null;
      } else {
        // User dah wujud — update role sahaja
        await supabase.auth.admin.updateUserById(userId, {
          app_metadata: { role: requestRow.requested_role },
        });
      }

      if (userId) {
        await supabase.from("profiles").upsert(
          [{ id: userId, full_name: requestRow.full_name, role: requestRow.requested_role }],
          { onConflict: "id" }
        );
      }
    }

    const { error: updateError } = await supabase
      .from("signup_requests")
      .update({
        status: action === "approve" ? "approved" : "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: auth.user.id,
        review_note: reviewNote || null,
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, temp_password: tempPassword });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
