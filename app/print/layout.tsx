import { requireRole } from "@/lib/auth";

// Printable sheets (table QR codes, …). Admin only; no dashboard chrome so the
// page prints clean.
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["admin"], { loginPath: "/staff/login" });
  return (
    <div style={{ colorScheme: "light" }} className="min-h-screen bg-white text-gray-900">
      {children}
    </div>
  );
}
