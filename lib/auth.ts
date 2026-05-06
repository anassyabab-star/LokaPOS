import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppRole = "admin" | "cashier" | "customer";

type RequireRoleOptions = {
  loginPath?: string;
};

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

  if (fallbackRole) return fallbackRole as AppRole;
  return "cashier" as AppRole;
}

export async function requireRole(allowedRoles: AppRole[], options?: RequireRoleOptions) {
  const loginPath = options?.loginPath || "/login";
  const user = await getCurrentSessionUser();

  if (!user) {
    redirect(loginPath);
  }

  const fallback =
    (user.app_metadata?.role as string | undefined) ||
    (user.user_metadata?.role as string | undefined) ||
    null;

  const role = await resolveCurrentUserRole(user.id, fallback);

  if (!allowedRoles.includes(role)) {
    if (role === "cashier") redirect("/pos");
    if (role === "admin") redirect("/dashboard");
    if (role === "customer") redirect("/customer");
    redirect(loginPath);
  }

  return { user, role };
}
