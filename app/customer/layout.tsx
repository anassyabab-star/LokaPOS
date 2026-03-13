import { requireRole } from "@/lib/auth";

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["customer", "admin"]);

  return <div className="theme-scope min-h-screen bg-black text-gray-100">{children}</div>;
}
