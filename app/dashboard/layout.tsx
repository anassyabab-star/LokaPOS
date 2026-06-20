import { requireRole } from "@/lib/auth";
import { SidebarNav, MobileNav, TopbarTitle } from "@/app/dashboard/admin-nav";
import AccountMenu from "@/app/dashboard/account-menu";

const COFFEE_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8h13a3 3 0 0 1 0 6h-1" />
    <path d="M4 8v8a4 4 0 0 0 4 4h5a4 4 0 0 0 4-4V8z" />
    <path d="M7 2v2.5M11 2v2.5M15 2v2.5" />
  </svg>
);

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["admin"], { loginPath: "/staff/login" });

  return (
    <div
      className="theme-scope"
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--page-bg)",
        color: "var(--text)",
        fontFamily: "var(--font-dm-sans), sans-serif",
      }}
    >
      {/* ── Desktop sidebar ── */}
      <aside
        className="hidden md:flex md:flex-col"
        style={{ width: 248, flex: "none", height: "100%", background: "var(--sidebar)", borderRight: "1px solid var(--hairline)" }}
      >
        {/* brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "20px 18px 18px" }}>
          <div style={{ width: 42, height: 42, borderRadius: 13, background: "var(--maroon)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", boxShadow: "0 6px 16px -6px rgba(127,29,29,0.6)" }}>
            {COFFEE_ICON}
          </div>
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15, color: "var(--ink)", whiteSpace: "nowrap" }}>Loka Coffee</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Admin Console</div>
          </div>
        </div>

        <SidebarNav />

        {/* account footer */}
        <div style={{ padding: 12, borderTop: "1px solid var(--hairline)" }}>
          <AccountMenu />
        </div>
      </aside>

      {/* ── Main area ── */}
      <div style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <header style={{ height: 64, flex: "none", background: "var(--topbar)", borderBottom: "1px solid var(--hairline)", display: "flex", alignItems: "center", gap: 14, padding: "0 22px" }}>
          {/* mobile brand */}
          <div className="md:hidden" style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: "var(--maroon)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h13a3 3 0 0 1 0 6h-1" /><path d="M4 8v8a4 4 0 0 0 4 4h5a4 4 0 0 0 4-4V8z" /></svg>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 19, letterSpacing: "-0.01em", color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              <TopbarTitle />
            </h1>
          </div>
          <div className="hidden md:block">
            <AccountMenu />
          </div>
        </header>

        <main style={{ flex: 1, overflowY: "auto", padding: "26px 28px 96px", WebkitOverflowScrolling: "touch" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>{children}</div>
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <MobileNav />
    </div>
  );
}
