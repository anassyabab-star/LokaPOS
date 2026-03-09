import { NextResponse } from "next/server";
import { getCurrentSessionUser, resolveCurrentUserRole } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentSessionUser();

  if (!user) {
    return NextResponse.json({ role: null }, { status: 401 });
  }

  const fallback =
    (user.app_metadata?.role as string | undefined) ||
    (user.user_metadata?.role as string | undefined) ||
    null;

  const role = await resolveCurrentUserRole(user.id, fallback);

  return NextResponse.json({ role });
}
