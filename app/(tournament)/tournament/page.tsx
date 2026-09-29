"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatWhen } from "@/components/tournament/ui";
import { STATUS_LABEL, type TournamentStatus } from "@/lib/tournament/types";

type Row = { id: string; slug: string; name: string; logo_url: string | null; venue: string | null; status: TournamentStatus; start_at: string | null };

export default function TournamentIndex() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    fetch("/api/public/tournaments", { cache: "no-store" })
      .then(r => r.json())
      .then(d => setRows(d.tournaments || []))
      .catch(() => setRows([]));
  }, []);

  return (
    <div className="px-4 pb-10 pt-8">
      <h1 className="font-display text-2xl font-bold">Loka Tournaments</h1>
      <p className="mt-1 text-sm text-white/45">Mobile Legends at Loka.</p>
      <div className="mt-6 space-y-3">
        {rows === null && <div className="h-24 animate-pulse rounded-2xl bg-white/5" />}
        {rows?.length === 0 && (
          <div className="py-12 text-center">
            <div className="text-5xl">🎮</div>
            <p className="mt-3 text-sm text-white/50">No tournaments right now — follow Loka for the next one.</p>
            <Link href="/menu" className="mt-5 inline-block rounded-xl border border-white/15 px-5 py-2.5 text-sm">Back to Loka</Link>
          </div>
        )}
        {rows?.map(t => (
          <Link key={t.id} href={`/tournament/${t.slug}`} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            {t.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.logo_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-900/60 text-2xl">🎮</div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-lg font-bold">{t.name}</div>
              <div className="text-[12px] text-white/50">{formatWhen(t.start_at)}{t.venue ? ` · ${t.venue}` : ""}</div>
            </div>
            <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase">{STATUS_LABEL[t.status]}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
