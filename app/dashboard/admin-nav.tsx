"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import ThemeToggle from "@/components/theme-toggle";

/* ── SVG Icons ─────────────────────────────────────────── */
function Icon({ d, d2 }: { d: string; d2?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d={d} />
      {d2 && <path d={d2} />}
    </svg>
  );
}

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Overview",
    exact: true,
    icon: (
      <Icon
        d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"
      />
    ),
  },
  {
    href: "/dashboard/products",
    label: "Products",
    icon: (
      <Icon d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    ),
  },
  {
    href: "/dashboard/categories",
    label: "Categories",
    icon: (
      <Icon d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01" />
    ),
  },
  {
    href: "/dashboard/orders",
    label: "Orders",
    icon: (
      <Icon
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"
        d2="M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
      />
    ),
  },
  {
    href: "/dashboard/reports",
    label: "Reports",
    icon: (
      <Icon d="M18 20V10M12 20V4M6 20v-6" />
    ),
  },
  {
    href: "/dashboard/shifts",
    label: "Shifts",
    icon: (
      <Icon d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2" />
    ),
  },
  {
    href: "/dashboard/paid-outs",
    label: "Paid Outs",
    icon: (
      <Icon d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    ),
  },
  {
    href: "/dashboard/expenses",
    label: "Expenses",
    icon: (
      <Icon d="M23 18l-9.5-9.5-5 5L1 6M17 18h6v-6" />
    ),
  },
  {
    href: "/dashboard/customers",
    label: "Customers",
    icon: (
      <Icon
        d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z"
        d2="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
      />
    ),
  },
  {
    href: "/dashboard/campaigns",
    label: "Campaigns",
    icon: (
      <Icon d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6" />
    ),
  },
  {
    href: "/dashboard/users",
    label: "Users",
    icon: (
      <Icon
        d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"
        d2="M12 11a4 4 0 100-8 4 4 0 000 8z"
      />
    ),
  },
  {
    href: "/pos",
    label: "POS System",
    icon: (
      <Icon d="M2 3h20a2 2 0 012 2v12a2 2 0 01-2 2H2a2 2 0 01-2-2V5a2 2 0 012-2zM8 21h8M12 17v4" />
    ),
  },
];

const MOBILE_PRIMARY = [
  { href: "/pos", label: "POS", exact: false },
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/dashboard/orders", label: "Orders", exact: false },
  { href: "/dashboard/products", label: "Products", exact: false },
];

const MOBILE_MORE = [
  { href: "/dashboard/reports", label: "Reports", exact: false },
  { href: "/dashboard/paid-outs", label: "Paid Outs", exact: false },
  { href: "/dashboard/expenses", label: "Expenses", exact: false },
  { href: "/dashboard/categories", label: "Categories", exact: false },
  { href: "/dashboard/customers", label: "Customers", exact: false },
  { href: "/dashboard/shifts", label: "Shifts", exact: false },
  { href: "/dashboard/campaigns", label: "Campaigns", exact: false },
  { href: "/dashboard/users", label: "Users", exact: false },
];

export default function AdminNav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* ── Desktop nav ─────────────────────────────────── */}
      <div className="hidden md:flex md:flex-col" style={{ gap: 2 }}>
        {NAV_ITEMS.map(item => {
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? "var(--d-accent)" : "var(--d-text-2)",
                background: active ? "var(--d-accent-soft)" : "transparent",
                textDecoration: "none",
                transition: "background 0.15s, color 0.15s",
                borderLeft: active
                  ? "2px solid var(--d-accent)"
                  : "2px solid transparent",
              }}
              className="nav-item"
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}

        {/* Theme toggle at bottom of nav */}
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--d-border)" }}>
          <ThemeToggle className="w-full text-left" />
        </div>
      </div>

      {/* ── Mobile: bottom tab bar ───────────────────────── */}
      <div className="md:hidden">
        {/* More overlay */}
        {showMore && (
          <>
            <button
              type="button"
              onClick={() => setShowMore(false)}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 30,
                background: "rgba(0,0,0,0.5)",
                border: "none",
                cursor: "default",
              }}
              aria-label="Close menu"
            />
            <div
              style={{
                position: "fixed",
                bottom: 64,
                left: 12,
                right: 12,
                zIndex: 40,
                background: "var(--d-sidebar)",
                border: "1px solid var(--d-border)",
                borderRadius: 16,
                padding: 12,
                boxShadow: "var(--d-shadow-md)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                }}
              >
                {MOBILE_MORE.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMore(false)}
                    style={{
                      padding: "9px 12px",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: isActive(item.href, item.exact) ? 600 : 400,
                      color: isActive(item.href, item.exact)
                        ? "var(--d-accent)"
                        : "var(--d-text-2)",
                      background: isActive(item.href, item.exact)
                        ? "var(--d-accent-soft)"
                        : "var(--d-surface-hover)",
                      textDecoration: "none",
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: "1px solid var(--d-border)",
                  display: "flex",
                  gap: 6,
                }}
              >
                <ThemeToggle className="flex-1 text-center" />
                <a
                  href="/auth/logout?next=/staff/login"
                  style={{
                    flex: 1,
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--d-error)",
                    textAlign: "center",
                    textDecoration: "none",
                    background: "var(--d-error-soft)",
                  }}
                  onClick={() => setShowMore(false)}
                >
                  Sign out
                </a>
              </div>
            </div>
          </>
        )}

        {/* Fixed bottom bar */}
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 40,
            background: "var(--d-sidebar)",
            borderTop: "1px solid var(--d-border)",
            padding: "8px 8px",
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 4,
          }}
        >
          {MOBILE_PRIMARY.map(item => {
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: "6px 4px",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: active ? 600 : 400,
                  color: active ? "var(--d-accent)" : "var(--d-text-3)",
                  background: active ? "var(--d-accent-soft)" : "transparent",
                  textAlign: "center",
                  textDecoration: "none",
                }}
              >
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setShowMore(p => !p)}
            style={{
              padding: "6px 4px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: showMore ? 600 : 400,
              color: showMore ? "var(--d-accent)" : "var(--d-text-3)",
              background: showMore ? "var(--d-accent-soft)" : "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            More
          </button>
        </div>
      </div>
    </>
  );
}
