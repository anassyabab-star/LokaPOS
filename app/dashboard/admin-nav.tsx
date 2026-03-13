"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/dashboard/products", label: "Products" },
  { href: "/dashboard/categories", label: "Categories" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/shifts", label: "Shifts" },
  { href: "/dashboard/paid-outs", label: "Paid Outs" },
  { href: "/dashboard/expenses", label: "Expenses" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/campaigns", label: "Campaigns" },
  { href: "/dashboard/users", label: "Users" },
  { href: "/pos", label: "POS System" },
];

const MOBILE_PRIMARY_ITEMS = [
  { href: "/pos", label: "POS System", exact: false },
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/dashboard/orders", label: "Orders", exact: false },
  { href: "/dashboard/products", label: "Products", exact: false },
];

const MOBILE_MORE_ITEMS = [
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
  const [showMobileMore, setShowMobileMore] = useState(false);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <div className="md:hidden">
        {showMobileMore ? (
          <>
            <button
              type="button"
              onClick={() => setShowMobileMore(false)}
              className="fixed inset-0 z-30 bg-black/40"
              aria-label="Close menu"
            />
            <div className="fixed bottom-16 left-3 right-3 z-40 rounded-xl border border-gray-800 bg-[#111] p-2 shadow-2xl">
              <div className="grid grid-cols-2 gap-2">
                {MOBILE_MORE_ITEMS.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMobileMore(false)}
                    className={[
                      "rounded-md px-3 py-2 text-sm transition",
                      isActive(item.href, item.exact)
                        ? "bg-[#7F1D1D] text-white"
                        : "text-gray-300 hover:text-white hover:bg-[#1b1b1b]",
                    ].join(" ")}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              <div className="mt-2 border-t border-gray-800 pt-2">
                <p className="mb-1 px-2 text-[11px] uppercase tracking-wide text-gray-500">Account</p>
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/pos"
                    onClick={() => setShowMobileMore(false)}
                    className="rounded-md px-3 py-2 text-sm text-gray-300 transition hover:bg-[#1b1b1b] hover:text-white"
                  >
                    Open POS
                  </Link>
                  <a
                    href="/auth/logout?next=/login"
                    className="rounded-md px-3 py-2 text-sm text-red-300 transition hover:bg-[#1b1b1b]"
                  >
                    Sign out
                  </a>
                </div>
              </div>
            </div>
          </>
        ) : null}

        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-800 bg-[#111] px-2 py-2">
          <div className="grid grid-cols-5 gap-2">
            {MOBILE_PRIMARY_ITEMS.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "rounded-md px-2 py-2 text-center text-xs transition",
                  isActive(item.href, item.exact)
                    ? "bg-[#7F1D1D] text-white"
                    : "text-gray-300 hover:text-white hover:bg-[#1b1b1b]",
                ].join(" ")}
              >
                {item.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => setShowMobileMore(prev => !prev)}
              className={`rounded-md px-2 py-2 text-center text-xs transition ${
                showMobileMore
                  ? "bg-[#7F1D1D] text-white"
                  : "text-gray-300 hover:text-white hover:bg-[#1b1b1b]"
              }`}
            >
              More
            </button>
          </div>
        </div>
      </div>

      <nav className="hidden md:flex md:flex-col gap-2 text-sm">
        {NAV_ITEMS.map(item => {
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "whitespace-nowrap rounded-md px-3 py-2 transition",
                isActive(item.href, item.exact)
                  ? "bg-[#7F1D1D] text-white"
                  : "text-gray-300 hover:text-white hover:bg-[#1b1b1b]",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
