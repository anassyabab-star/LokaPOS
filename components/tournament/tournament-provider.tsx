"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PublicBundle, Team } from "@/lib/tournament/types";

// ============================================================================
// One live copy of the tournament for every participant screen.
//
// Data comes from /api/public/tournaments/[slug] (personal data stripped),
// polled every 5s while the screen is visible. That endpoint is cached on the
// CDN for 5s, so the database is read at most once per 5s however many phones
// are watching. (Supabase Realtime was dropped on 2026-10-07: the project's
// 1 GB instance was swapping and Realtime's always-on WAL reading was the
// cost we could remove.)
// ============================================================================

type Ctx = {
  slug: string;
  data: PublicBundle | null;
  error: string | null;
  loading: boolean;
  teams: Map<string, Team>;
  myTeamId: string | null;
  setMyTeamId: (id: string | null) => void;
  refresh: () => Promise<void>;
  live: boolean;
};

const TournamentContext = createContext<Ctx | null>(null);

export function useTournament() {
  const ctx = useContext(TournamentContext);
  if (!ctx) throw new Error("useTournament outside TournamentProvider");
  return ctx;
}

const POLL_MS = 5_000;

const teamKey = (slug: string) => `loka_tournament_team:${slug}`;

export function TournamentProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const [data, setData] = useState<PublicBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [myTeamId, setMyTeamIdState] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/tournaments/${encodeURIComponent(slug)}`, { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "Couldn't load the tournament"); return; }
      setData(d as PublicBundle);
      setError(null);
      setLive(true);
    } catch {
      setError("No connection");
      setLive(false);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    try { setMyTeamIdState(localStorage.getItem(teamKey(slug))); } catch { /* private mode */ }
    void refresh();
    // Never polls a tab nobody is looking at; catches up when it's shown.
    const poll = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", onVisible); };
  }, [slug, refresh]);

  const setMyTeamId = useCallback((id: string | null) => {
    setMyTeamIdState(id);
    try {
      if (id) localStorage.setItem(teamKey(slug), id);
      else localStorage.removeItem(teamKey(slug));
    } catch { /* ignore */ }
  }, [slug]);

  const teams = useMemo(() => new Map((data?.teams || []).map(t => [t.id, t])), [data]);
  // A saved team that's no longer in the list (withdrawn) shouldn't stick.
  const effectiveMyTeam = myTeamId && teams.has(myTeamId) ? myTeamId : null;

  const value = useMemo<Ctx>(
    () => ({ slug, data, error, loading, teams, myTeamId: effectiveMyTeam, setMyTeamId, refresh, live }),
    [slug, data, error, loading, teams, effectiveMyTeam, setMyTeamId, refresh, live]
  );
  return <TournamentContext.Provider value={value}>{children}</TournamentContext.Provider>;
}
