"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useTournament } from "@/components/tournament/tournament-provider";
import { TeamLogo } from "@/components/tournament/ui";

const NAV = [
  { href: "", label: "Home", d: "M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" },
  { href: "/matches", label: "Matches", d: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" },
  { href: "/standings", label: "Standings", d: "M18 20V10M12 20V4M6 20v-6" },
  { href: "/bracket", label: "Bracket", d: "M4 4h5v6H4zM4 14h5v6H4zM9 7h4v10H9M13 12h7" },
  { href: "/teams", label: "Teams", d: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" },
];

export function TournamentShell({ children }: { children: ReactNode }) {
  const { slug, data, error, loading, refresh } = useTournament();
  const pathname = usePathname();
  const base = `/tournament/${slug}`;
  const sub = pathname.slice(base.length) || "";
  // Registration screens are forms — no bottom nav competing with the submit button.
  const bare = sub.startsWith("/register") || sub.startsWith("/my");

  if (loading && !data) {
    return (
      <div className="space-y-4 p-4 pt-8">
        <div className="h-40 animate-pulse rounded-3xl bg-white/5" />
        <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
        <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="text-5xl">⚠️</div>
        <p className="text-white/70">{error || "Tournament not found"}</p>
        <button onClick={() => void refresh()} className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold">Retry</button>
      </div>
    );
  }

  return (
    <div className={bare ? "" : "pb-24"}>
      {children}
      {!bare && (
        <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg border-t border-white/10 bg-[#0A0C11]/95 backdrop-blur safe-bottom">
          <div className="grid grid-cols-5">
            {NAV.map(item => {
              const active = item.href === "" ? sub === "" : sub.startsWith(item.href);
              return (
                <Link key={item.href} href={`${base}${item.href}`} className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold ${active ? "text-red-400" : "text-white/45"}`}>
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={item.d} /></svg>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, back }: { title: string; subtitle?: string; back?: string }) {
  return (
    <header className="sticky z-30 border-b border-white/5 bg-[#0A0C11]/90 px-4 pb-3 pt-4 backdrop-blur" style={{ top: "env(safe-area-inset-top, 0px)" }}>
      <div className="flex items-center gap-3">
        {back && (
          <Link href={back} className="-ml-1 flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-white/70" aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-bold">{title}</h1>
          {subtitle && <p className="truncate text-[12px] text-white/45">{subtitle}</p>}
        </div>
      </div>
    </header>
  );
}

/** Bottom sheet to choose "My Team" — remembered on this phone. */
export function TeamPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, myTeamId, setMyTeamId } = useTournament();
  const [q, setQ] = useState("");
  if (!open || !data) return null;
  const list = data.teams.filter(t => t.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 animate-fadeIn" onClick={onClose}>
      <div className="max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#12151C] p-5 pb-8 animate-sheetUp safe-bottom" onClick={e => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <h2 className="font-display text-lg font-bold">Select your team</h2>
        <p className="mb-3 text-[12px] text-white/45">Saved on this phone so it opens straight to your matches.</p>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search team"
          className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none focus:border-red-500"
        />
        <div className="space-y-2">
          {list.map(t => (
            <button
              key={t.id}
              onClick={() => { setMyTeamId(t.id); onClose(); }}
              className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${t.id === myTeamId ? "border-red-500/60 bg-red-500/10" : "border-white/10 bg-white/[0.03]"}`}
            >
              <TeamLogo team={t} size={36} />
              <span className="flex-1 truncate font-semibold">{t.name}</span>
              {t.group_name && <span className="text-[11px] text-white/40">Group {t.group_name}</span>}
            </button>
          ))}
          {list.length === 0 && <p className="py-6 text-center text-sm text-white/40">No teams yet</p>}
        </div>
        {myTeamId && (
          <button onClick={() => { setMyTeamId(null); onClose(); }} className="mt-4 w-full rounded-xl border border-white/10 py-2.5 text-sm text-white/60">
            Clear my team
          </button>
        )}
      </div>
    </div>
  );
}
