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

    if (action === "approve") {
      let userId: string | null = null;
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || undefined;

      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
        requestRow.email,
        {
          data: {
            full_name: requestRow.full_name,
            role: requestRow.requested_role,
          },
          redirectTo: siteUrl ? `${siteUrl}/login` : undefined,
        }
      );

      if (inviteError) {
        const errMsg = inviteError.message || "";
        if (!errMsg.toLowerCase().includes("already")) {
          return NextResponse.json({ error: errMsg }, { status: 400 });
        }
      } else {
        userId = inviteData.user?.id || null;
      }

      if (!userId) {
        userId = await findUserIdByEmail(requestRow.email);
      }

      if (userId) {
        await supabase.from("profiles").upsert(
          [
            {
              id: userId,
              full_name: requestRow.full_name,
              role: requestRow.requested_role,
            },
          ],
          { onConflict: "id" }
        );

        await supabase.auth.admin.updateUserById(userId, {
          user_metadata: {
            full_name: requestRow.full_name,
            role: requestRow.requested_role,
          },
          app_metadata: {
            role: requestRow.requested_role,
          },
        });
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

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
