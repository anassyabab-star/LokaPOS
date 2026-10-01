"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PublicBundle, Team } from "@/lib/tournament/types";

// ============================================================================
// One live copy of the tournament for every participant screen.
//
// Data comes from /api/public/tournaments/[slug] (personal data stripped).
// Supabase Realtime on tournament_matches / announcements / tournaments only
// says "something changed" — we refetch the bundle rather than patch rows, so
// the screens can never disagree with the server. A 30s poll covers phones
// where the websocket drops.
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

const teamKey = (slug: string) => `loka_tournament_team:${slug}`;

export function TournamentProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const [data, setData] = useState<PublicBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [myTeamId, setMyTeamIdState] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/tournaments/${encodeURIComponent(slug)}`, { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "Couldn't load the tournament"); return; }
      setData(d as PublicBundle);
      setError(null);
    } catch {
      setError("No connection");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  // Coalesce bursts (a score save touches the match + the next match).
  const soon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void refresh(), 350);
  }, [refresh]);

  useEffect(() => {
    try { setMyTeamIdState(localStorage.getItem(teamKey(slug))); } catch { /* private mode */ }
    void refresh();
    // Realtime pushes changes; this poll is only a safety net, and never runs
    // for a tab nobody is looking at.
    const poll = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", onVisible); };
  }, [slug, refresh]);

  const tournamentId = data?.tournament.id;
  useEffect(() => {
    if (!tournamentId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`tournament:${tournamentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_matches", filter: `tournament_id=eq.${tournamentId}` }, soon)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_announcements", filter: `tournament_id=eq.${tournamentId}` }, soon)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tournaments", filter: `id=eq.${tournamentId}` }, soon)
      .subscribe(status => setLive(status === "SUBSCRIBED"));
    return () => { void supabase.removeChannel(channel); };
  }, [tournamentId, soon]);

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
