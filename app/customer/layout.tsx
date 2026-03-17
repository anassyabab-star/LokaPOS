import { requireRole } from "@/lib/auth";

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["customer", "admin"]);

  return <div className="min-h-screen bg-white text-gray-900" style={{ colorScheme: "light" }}>{children}</div>;
}
