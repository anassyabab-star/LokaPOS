import { redirect } from "next/navigation";
import Link from "next/link";
import LoginForm from "@/app/login/login-form";
import { getCurrentSessionUser, resolveCurrentUserRole } from "@/lib/auth";

export default async function StaffLoginPage() {
  const user = await getCurrentSessionUser();

  if (user) {
    const fallback =
      (user.app_metadata?.role as string | undefined) ||
      (user.user_metadata?.role as string | undefined) ||
      null;
    const role = await resolveCurrentUserRole(user.id, fallback);
    if (role === "admin") redirect("/dashboard");
    if (role === "cashier") redirect("/pos");
    if (role === "customer") redirect("/customer");
  }

  return (
    <main className="min-h-screen bg-black text-gray-200">
      <div className="h-20 border-b border-gray-800 bg-black" />
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center justify-center px-4 py-8">
        <section className="w-full rounded-xl border border-gray-800 bg-[#111] p-6 shadow-soft md:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Loka POS</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Staff Sign In</h1>
          <p className="mt-1 text-sm text-gray-400">
            Log masuk untuk mula ambil pesanan. Signup staff perlu approval admin.
          </p>
          <LoginForm audience="staff" />
          <p className="mt-4 text-center text-xs text-gray-500">
            Customer portal:{" "}
            <Link href="/login" className="text-[#d1a28d] hover:underline">
              /login
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
