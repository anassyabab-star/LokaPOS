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
