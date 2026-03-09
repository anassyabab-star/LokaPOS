import { requireRole } from "@/lib/auth";

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["admin", "cashier"]);
  return children;
}
