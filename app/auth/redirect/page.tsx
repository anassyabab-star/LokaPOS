import { redirect } from "next/navigation";
import { getCurrentSessionUser, resolveCurrentUserRole } from "@/lib/auth";

export default async function AuthRedirectPage() {
  const user = await getCurrentSessionUser();

  if (!user) {
    redirect("/login");
  }

  const fallback =
    (user.app_metadata?.role as string | undefined) ||
    (user.user_metadata?.role as string | undefined) ||
    null;
  const role = await resolveCurrentUserRole(user.id, fallback);

  if (role === "admin") redirect("/dashboard");
  if (role === "cashier") redirect("/pos");
  if (role === "customer") redirect("/customer");
  redirect("/login");
}
