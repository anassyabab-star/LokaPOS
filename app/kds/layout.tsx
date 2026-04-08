import { requireRole } from "@/lib/auth";

export default async function KdsLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["admin", "cashier"], { loginPath: "/staff/login" });
  return children;
}
