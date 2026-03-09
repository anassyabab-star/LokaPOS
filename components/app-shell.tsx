import Link from "next/link";
import { ReactNode } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/products", label: "Products" },
  { href: "/orders", label: "Orders" },
];

type AppShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export default function AppShell({ title, subtitle, children }: AppShellProps) {
  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-6xl gap-4 px-4 pb-24 pt-4 md:px-6 md:pb-8 md:pt-6">
        <aside className="hidden w-56 shrink-0 rounded-xl border border-pos-line bg-pos-card p-4 shadow-soft md:block">
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-pos-soft">BrewPOS</p>
          <nav className="space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-pos-soft transition hover:bg-pos-accent-soft hover:text-pos-accent"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/login"
            className="mt-8 block rounded-lg border border-pos-line px-3 py-2 text-sm text-pos-soft transition hover:border-pos-accent hover:text-pos-accent"
          >
            Sign out
          </Link>
        </aside>

        <main className="w-full">
          <header className="mb-4 rounded-xl border border-pos-line bg-pos-card p-4 shadow-soft md:p-5">
            <h1 className="text-xl font-semibold md:text-2xl">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-pos-soft">{subtitle}</p> : null}
          </header>
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 border-t border-pos-line bg-pos-card p-2 shadow-soft md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-center text-sm font-medium text-pos-soft transition hover:bg-pos-accent-soft hover:text-pos-accent"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
