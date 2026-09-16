import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppRole = "admin" | "cashier" | "customer";

type RequireRoleOptions = {
  loginPath?: string;
};

/**
 * Role hint from the auth user's metadata. ONLY `app_metadata` is trusted:
 * `user_metadata` can be written by the user themselves (signUp options,
 * auth.updateUser), so it must never grant staff access.
 */
export function metadataRole(user: { app_metadata?: Record<string, unknown> | null } | null | undefined): string | null {
  const raw = user?.app_metadata?.role;
  const role = String(raw || "").trim().toLowerCase();
  return role === "admin" || role === "cashier" || role === "customer" ? role : null;
}

export async function getCurrentSessionUser() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    // If Supabase auth endpoint is temporarily unreachable, treat as unauthenticated.
    return null;
  }
}

export async function resolveCurrentUserRole(userId: string, fallbackRole?: string | null) {
  const supabase = await createSupabaseServerClient();

  try {
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (data?.role) return String(data.role) as AppRole;
  } catch {
    // Fallback to metadata role when profiles table is unavailable.
  }

  const fallback = String(fallbackRole || "").trim().toLowerCase();
  if (fallback === "admin" || fallback === "cashier" || fallback === "customer") return fallback;
  // No profile row and no trusted metadata role → the least-privileged role.
  // (Used to default to "cashier", which handed POS/KDS access to any new
  // OAuth signup.)
  return "customer" as AppRole;
}

export async function requireRole(allowedRoles: AppRole[], options?: RequireRoleOptions) {
  const loginPath = options?.loginPath || "/login";
  const user = await getCurrentSessionUser();

  if (!user) {
    redirect(loginPath);
  }

  const role = await resolveCurrentUserRole(user.id, metadataRole(user));

  if (!allowedRoles.includes(role)) {
    if (role === "cashier") redirect("/pos");
    if (role === "admin") redirect("/dashboard");
    if (role === "customer") redirect("/menu");
    redirect(loginPath);
  }

  return { user, role };
}
