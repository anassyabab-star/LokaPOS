"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { STATUS_LABEL, type AdminTeam, type Announcement, type Match, type Tournament } from "@/lib/tournament/types";
import { Badge, api } from "../ui";
import { OverviewTab } from "./overview";
import { RegistrationsTab } from "./registrations";
import { TeamsTab } from "./teams";
import { MatchesTab } from "./matches";
import { StandingsTab } from "./standings";
import { AnnouncementsTab } from "./announcements";
import { SettingsTab } from "./settings";

export type AdminBundle = { tournament: Tournament; teams: AdminTeam[]; matches: Match[]; announcements: Announcement[] };
export type TabProps = { bundle: AdminBundle; reload: () => Promise<void> };

const TABS = [
  { key: "overview", label: "Dashboard" },
  { key: "registrations", label: "Pendaftaran" },
  { key: "teams", label: "Teams" },
  { key: "matches", label: "Matches" },
  { key: "standings", label: "Standings & Bracket" },
  { key: "announcements", label: "Pengumuman" },
  { key: "settings", label: "Settings" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function TournamentDetail() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const [bundle, setBundle] = useState<AdminBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tab = (TABS.find(t => t.key === params.get("tab"))?.key || "overview") as TabKey;

  const reload = useCallback(async () => {
    const r = await api<AdminBundle>(`/api/admin/tournaments/${id}`);
    if (!r.ok) { setError(r.data.error || "Gagal muatkan"); return; }
    setBundle(r.data); setError(null);
  }, [id]);

  useEffect(() => { void reload(); }, [reload]);

  if (!bundle) {
    return (
      <div className="py-6">
        {error ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center">
            <div className="text-4xl">⚠️</div>
            <p className="mt-2 text-sm text-gray-500">{error}</p>
            <button onClick={() => void reload()} className="mt-4 rounded-xl bg-[#7F1D1D] px-4 py-2 text-sm font-bold text-white">Cuba lagi</button>
          </div>
        ) : (
          <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />)}</div>
        )}
      </div>
    );
  }

  const t = bundle.tournament;
  const pending = bundle.teams.filter(x => x.registration_status === "payment_submitted").length;
  const props: TabProps = { bundle, reload };

  return (
    <div className="py-6">
      <Link href="/dashboard/tournaments" className="text-xs font-semibold text-gray-400">← Semua tournament</Link>
      <div className="mb-4 mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold text-gray-900">{t.name}</h1>
            <Badge tone={t.status === "ongoing" ? "red" : t.status === "registration_open" ? "green" : "gray"}>{STATUS_LABEL[t.status]}</Badge>
            {!t.published && <Badge tone="amber">Belum publish</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-gray-400">
            pos.lokacafe.my/tournament/{t.slug}
          </p>
        </div>
        <a href={`/tournament/${t.slug}`} target="_blank" rel="noreferrer" className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600">
          Buka app peserta ↗
        </a>
      </div>

      <div className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-gray-100 px-1 no-scrollbar">
        {TABS.map(x => (
          <button
            key={x.key}
            onClick={() => router.replace(`/dashboard/tournaments/${id}?tab=${x.key}`, { scroll: false })}
            className={`relative shrink-0 px-3 py-2.5 text-sm font-semibold ${tab === x.key ? "text-[#7F1D1D]" : "text-gray-400"}`}
          >
            {x.label}
            {x.key === "registrations" && pending > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{pending}</span>
            )}
            {tab === x.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#7F1D1D]" />}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab {...props} />}
      {tab === "registrations" && <RegistrationsTab {...props} />}
      {tab === "teams" && <TeamsTab {...props} />}
      {tab === "matches" && <MatchesTab {...props} />}
      {tab === "standings" && <StandingsTab {...props} />}
      {tab === "announcements" && <AnnouncementsTab {...props} />}
      {tab === "settings" && <SettingsTab {...props} />}
    </div>
  );
}

export default function TournamentDetailPage() {
  return <Suspense fallback={null}><TournamentDetail /></Suspense>;
}
