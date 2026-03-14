import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SignupRole = "cashier" | "admin" | "customer";
type ListUsersResponse = {
  data?: {
    users?: Array<{ id: string; email?: string | null }>;
  };
};

async function isExistingAuthUser(email: string) {
  const adminSupabase = createSupabaseAdminClient();
  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const result = (await adminSupabase.auth.admin.listUsers({
      page,
      perPage,
    })) as ListUsersResponse;
    const users = result.data?.users || [];
    if (users.some(user => (user.email || "").toLowerCase() === email.toLowerCase())) {
      return true;
    }
    if (users.length < perPage) break;
    page += 1;
  }

  return false;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const email = String(body?.email || "").trim().toLowerCase();
    const fullName = String(body?.full_name || "").trim();
    const role = String(body?.role || "cashier") as SignupRole;
    const password = String(body?.password || "");

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (!fullName) {
      return NextResponse.json({ error: "Full name is required" }, { status: 400 });
    }

    if (role !== "cashier" && role !== "admin" && role !== "customer") {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const adminSupabase = createSupabaseAdminClient();

    if (role === "customer") {
      if (password.length < 8) {
        return NextResponse.json(
          { error: "Password must be at least 8 characters" },
          { status: 400 }
        );
      }

      if (await isExistingAuthUser(email)) {
        return NextResponse.json(
          { error: "Email already registered. Please sign in." },
          { status: 409 }
        );
      }

      const { data: createdUser, error: createError } = await adminSupabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role: "customer",
        },
        app_metadata: {
          role: "customer",
        },
      });

      if (createError || !createdUser?.user?.id) {
        return NextResponse.json(
          { error: createError?.message || "Failed to create customer account" },
          { status: 400 }
        );
      }

      const userId = createdUser.user.id;

      const { error: profileError } = await adminSupabase.from("profiles").upsert(
        [
          {
            id: userId,
            full_name: fullName,
            role: "customer",
          },
        ],
        { onConflict: "id" }
      );

      if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 500 });
      }

      const { error: customerError } = await adminSupabase.from("customers").insert([
        {
          name: fullName,
          email,
          consent_whatsapp: false,
          consent_email: false,
          total_orders: 0,
          total_spend: 0,
          consent_source: "customer_app",
        },
      ]);

      if (customerError) {
        const msg = String(customerError.message || "").toLowerCase();
        if (!msg.includes("duplicate key") && !msg.includes("unique")) {
          return NextResponse.json({ error: customerError.message }, { status: 500 });
        }
      }

      const nowIso = new Date().toISOString();
      // Keep audit trail, but do not block customer signup if table is unavailable.
      const { error: signupAuditError } = await adminSupabase.from("signup_requests").insert([
        {
          email,
          full_name: fullName,
          requested_role: "customer",
          status: "approved",
          requested_at: nowIso,
          reviewed_at: nowIso,
          review_note: "Auto-approved customer signup",
        },
      ]);

      if (
        signupAuditError &&
        !String(signupAuditError.message || "").toLowerCase().includes("does not exist")
      ) {
        // Non-fatal for customer onboarding.
        console.warn("customer signup audit insert failed:", signupAuditError.message);
      }

      return NextResponse.json({
        success: true,
        message: "Customer account created. Please sign in.",
      });
    }

    const { data: existingPending, error: pendingError } = await adminSupabase
      .from("signup_requests")
      .select("id")
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (pendingError) {
      return NextResponse.json(
        { error: pendingError.message },
        { status: 500 }
      );
    }

    if (existingPending) {
      return NextResponse.json(
        { error: "Signup request already submitted. Please wait for admin approval." },
        { status: 409 }
      );
    }

    if (await isExistingAuthUser(email)) {
      return NextResponse.json(
        { error: "Email already registered. Please sign in." },
        { status: 409 }
      );
    }

    const { error: insertError } = await adminSupabase.from("signup_requests").insert([
      {
        email,
        full_name: fullName,
        requested_role: role,
        status: "pending",
      },
    ]);

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message || "Failed to create signup request" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Signup request submitted. Wait for admin approval.",
    });
  } catch {
    return NextResponse.json({ error: "Server error during signup" }, { status: 500 });
  }
}
