import { NextResponse } from "next/server";
import { getCurrentSessionUser, resolveCurrentUserRole, type AppRole } from "@/lib/auth";

type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentSessionUser>>>;

type CustomerApiOptions = {
  allowAdmin?: boolean;
};

export async function requireCustomerApi(options?: CustomerApiOptions) {
  const user = await getCurrentSessionUser();
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED", details: null },
        { status: 401 }
      ),
    };
  }

  const fallback =
    (user.app_metadata?.role as string | undefined) ||
    (user.user_metadata?.role as string | undefined) ||
    null;

  const role = await resolveCurrentUserRole(user.id, fallback);
  const allowAdmin = options?.allowAdmin ?? true;
  const isAllowed = role === "customer" || (allowAdmin && role === "admin");
  if (!isAllowed) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Forbidden", code: "FORBIDDEN", details: null },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true as const,
    user: user as SessionUser,
    role: role as AppRole,
  };
}

