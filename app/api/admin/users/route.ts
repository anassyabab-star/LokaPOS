import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AuthUser = {
  id: string;
  email?: string | null;
  created_at?: string;
  last_sign_in_at?: string | null;
  user_metadata?: {
    full_name?: string;
    role?: string;
  } | null;
  app_metadata?: {
    role?: string;
  } | null;
};

type ListUsersResponse = {
  data?: {
    users?: AuthUser[];
  };
  error?: {
    message?: string;
  } | null;
};

type ProfileRow = {
  id: string;
  role: string | null;
};

function normalizeRole(value: string | null | undefined) {
  const role = String(value || "").toLowerCase();
  if (role === "admin" || role === "cashier" || role === "customer") return role;
  return "unknown";
}

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const q = String(searchParams.get("q") || "").trim().toLowerCase();
  const roleFilter = String(searchParams.get("role") || "all").toLowerCase();

  try {
    const supabase = createSupabaseAdminClient();
    const users: AuthUser[] = [];
    let page = 1;
    const perPage = 200;

    while (page <= 10) {
      const result = (await supabase.auth.admin.listUsers({ page, perPage })) as ListUsersResponse;
      if (result.error?.message) {
        return NextResponse.json({ error: result.error.message }, { status: 500 });
      }

      const batch = result.data?.users || [];
      users.push(...batch);
      if (batch.length < perPage) break;
      page += 1;
    }

    const userIds = users.map(user => user.id);
    const profileRoleMap = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id,role")
        .in("id", userIds);

      if (profilesError) {
        return NextResponse.json({ error: profilesError.message }, { status: 500 });
      }

      for (const row of (profiles || []) as ProfileRow[]) {
        profileRoleMap.set(row.id, normalizeRole(row.role));
      }
    }

    const mapped = users
      .map(user => {
        const fullName = user.user_metadata?.full_name || "";
        const email = user.email || "";
        const role = normalizeRole(
          profileRoleMap.get(user.id) || user.app_metadata?.role || user.user_metadata?.role
        );

        return {
          id: user.id,
          email,
          full_name: fullName,
          role,
          created_at: user.created_at || null,
          last_sign_in_at: user.last_sign_in_at || null,
        };
      })
      .filter(user => {
        const matchRole = roleFilter === "all" || user.role === roleFilter;
        const matchQuery =
          !q ||
          user.email.toLowerCase().includes(q) ||
          user.full_name.toLowerCase().includes(q) ||
          user.role.toLowerCase().includes(q);
        return matchRole && matchQuery;
      })
      .sort((a, b) => {
        const aTime = new Date(a.created_at || 0).getTime();
        const bTime = new Date(b.created_at || 0).getTime();
        return bTime - aTime;
      });

    const counts = mapped.reduce(
      (acc, user) => {
        acc.total += 1;
        if (user.role === "admin") acc.admin += 1;
        if (user.role === "cashier") acc.cashier += 1;
        if (user.role === "customer") acc.customer += 1;
        if (user.role === "unknown") acc.unknown += 1;
        return acc;
      },
      { total: 0, admin: 0, cashier: 0, customer: 0, unknown: 0 }
    );

    return NextResponse.json({ users: mapped, counts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load active users";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
