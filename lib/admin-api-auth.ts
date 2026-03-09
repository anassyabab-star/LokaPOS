import { NextResponse } from "next/server";
import { getCurrentSessionUser, resolveCurrentUserRole } from "@/lib/auth";

export async function requireAdminApi() {
  const user = await getCurrentSessionUser();
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const fallback =
    (user.app_metadata?.role as string | undefined) ||
    (user.user_metadata?.role as string | undefined) ||
    null;

  const role = await resolveCurrentUserRole(user.id, fallback);
  if (role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    user,
  };
}
