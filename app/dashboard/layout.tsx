import { requireRole } from "@/lib/auth";
import AdminNav from "@/app/dashboard/admin-nav";
import AccountMenu from "@/app/dashboard/account-menu";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["admin"]);

  return (
    <div className="theme-scope min-h-screen bg-black text-gray-200 flex flex-col md:flex-row">
      <div className="w-full md:w-56 bg-[#111111] border-b md:border-b-0 md:border-r border-gray-800 p-3 md:p-4">
        <div className="mb-2 md:mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Loka POS</h2>
            <p className="text-xs text-gray-500">Admin Console</p>
          </div>
          <div className="hidden md:block">
            <AccountMenu />
          </div>
        </div>

        <AdminNav />
      </div>

      <div className="flex-1 p-4 pb-20 md:p-6">{children}</div>
    </div>
  );
}
