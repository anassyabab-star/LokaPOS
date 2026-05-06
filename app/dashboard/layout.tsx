import { requireRole } from "@/lib/auth";
import AdminNav from "@/app/dashboard/admin-nav";
import AccountMenu from "@/app/dashboard/account-menu";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["admin"], { loginPath: "/staff/login" });

  return (
    <div
      className="theme-scope"
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--d-bg)",
        color: "var(--d-text-1)",
      }}
    >
      {/* ── Desktop sidebar ── */}
      <aside
        className="hidden md:flex md:flex-col"
        style={{
          width: 224,
          flexShrink: 0,
          background: "var(--d-sidebar)",
          borderRight: "1px solid var(--d-border)",
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
        }}
      >
        {/* Brand */}
        <div
          style={{
            padding: "20px 16px 18px",
            borderBottom: "1px solid var(--d-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                background: "var(--d-accent)",
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 01-8 0" />
              </svg>
            </div>
            <div>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--d-text-1)",
                  lineHeight: 1.2,
                  letterSpacing: "-0.01em",
                }}
              >
                Loka POS
              </p>
              <p
                style={{
                  fontSize: 11,
                  color: "var(--d-text-3)",
                  marginTop: 2,
                }}
              >
                Admin Console
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "10px 8px" }}>
          <AdminNav />
        </nav>

        {/* Account */}
        <div
          style={{
            padding: "10px 12px",
            borderTop: "1px solid var(--d-border)",
          }}
        >
          <AccountMenu />
        </div>
      </aside>

      {/* ── Main area ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Mobile top bar */}
        <header
          className="md:hidden"
          style={{
            padding: "12px 16px",
            background: "var(--d-sidebar)",
            borderBottom: "1px solid var(--d-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            zIndex: 30,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 30,
                height: 30,
                background: "var(--d-accent)",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 01-8 0" />
              </svg>
            </div>
            <span
              style={{ fontSize: 14, fontWeight: 700, color: "var(--d-text-1)" }}
            >
              Loka POS
            </span>
          </div>
          <AccountMenu />
        </header>

        {/* Page content */}
        <main style={{ flex: 1, paddingBottom: 80 }}>{children}</main>

        {/* Mobile bottom nav */}
        <div className="md:hidden">
          <AdminNav />
        </div>
      </div>
    </div>
  );
}
