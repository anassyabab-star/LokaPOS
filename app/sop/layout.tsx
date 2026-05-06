import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth";

export default async function SopLayout({ children }: { children: ReactNode }) {
  await requireRole(["admin", "cashier"], { loginPath: "/staff/login" });
  return <>{children}</>;
}
