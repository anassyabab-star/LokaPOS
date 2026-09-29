import type { Metadata } from "next";

// Staff screens keep "Loka POS" in the tab; the site default is customer-facing.
export const metadata: Metadata = { title: "Loka POS" };

import { requireRole } from "@/lib/auth";

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["admin", "cashier"], { loginPath: "/staff/login" });
  return children;
}
