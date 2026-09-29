"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Row = { slug: string; name: string; status: string };

// A Loka tournament that's taking entries or running right now — shown on the
// menu so regulars find it. Renders nothing otherwise (or before migration).
export function TournamentBanner() {
  const [t, setT] = useState<Row | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/public/tournaments", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (!live) return;
        const rows = (d?.tournaments || []) as Row[];
        setT(rows.find(r => r.status === "ongoing") || rows.find(r => r.status === "registration_open") || null);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  if (!t) return null;
  return (
    <Link
      href={`/tournament/${t.slug}`}
      className="mt-3 flex items-center justify-between gap-3 rounded-[14px] border border-white/10 bg-gradient-to-r from-[#7F1D1D] to-[#B91C1C] px-4 py-3.5"
    >
      <span className="min-w-0">
        <span className="block truncate font-display text-[15px] font-semibold text-cream">🎮 {t.name}</span>
        <span className="block font-sans text-[12px] text-cream/75">
          {t.status === "ongoing" ? "Live now — scores & schedule" : "Register your team · vouchers for every player"}
        </span>
      </span>
      <span className="font-sans text-[13px] font-semibold text-cream">→</span>
    </Link>
  );
}
