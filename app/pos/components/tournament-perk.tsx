"use client";

import { useEffect, useState } from "react";
import { usePos } from "../pos-context";

type Perk = { tournament_id: string; tournament_name: string; percent: number; category_names: string[] };
type TeamRow = {
  team_id: string; team_name: string; short_name: string | null; team_number: number | null; tournament_id: string;
  players: { id: string; ign: string; is_captain: boolean }[];
};

// "🎮 Pemain Tournament" — only shows on a tournament day with the player perk
// on. The cashier finds the team (or the player's IGN), taps the player, and
// the perk (e.g. 20% off drinks) is taken off this sale. Ask to see the
// player's MLBB profile if unsure — the IGN should match.
export default function TournamentPerk() {
  const s = usePos();
  const [perks, setPerks] = useState<Perk[] | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/pos/tournament-perk", { cache: "no-store" })
      .then(r => r.json())
      .then(d => { if (live) { setPerks(d.perks || []); setTeams(d.teams || []); } })
      .catch(() => { if (live) setPerks([]); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/pos/tournament-perk?q=${encodeURIComponent(q)}`, { cache: "no-store" })
        .then(r => r.json())
        .then(d => setTeams(d.teams || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  if (!perks || perks.length === 0) return null;
  const perkFor = (tid: string) => perks.find(p => p.tournament_id === tid) || perks[0];
  const first = perks[0];
  const label = `${first.percent}% ${first.category_names.join(" / ")}`;

  if (s.tournamentPerk) {
    return (
      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
        <span className="min-w-0 text-xs font-medium text-violet-900">
          🎮 {s.tournamentPerk.team_name}{s.tournamentPerk.player_ign ? ` · ${s.tournamentPerk.player_ign}` : ""} — {s.tournamentPerk.percent}% {s.tournamentPerk.category_names.join("/")}
          {s.perkDiscount > 0 ? `: -RM${s.perkDiscount.toFixed(2)}` : " (tiada item layak dalam cart)"}
        </span>
        <button onClick={() => s.setTournamentPerk(null)} className="shrink-0 text-xs font-semibold text-red-600">Buang</button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      {!open ? (
        <button onClick={() => setOpen(true)} className="w-full rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-left text-sm font-semibold text-violet-900">
          🎮 Pemain Tournament — {label}
        </button>
      ) : (
        <div className="rounded-lg border border-violet-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-violet-900">Cari team / IGN pemain</span>
            <button onClick={() => { setOpen(false); setQ(""); }} className="text-xs text-gray-500">Tutup</button>
          </div>
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Nama team atau IGN"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20"
          />
          <p className="mt-1.5 text-[11px] text-gray-500">Minta pemain tunjuk profil MLBB — IGN mesti sama.</p>
          <div className="mt-2 max-h-60 space-y-2 overflow-y-auto">
            {loading && teams.length === 0 && <p className="py-2 text-center text-xs text-gray-400">Mencari…</p>}
            {!loading && teams.length === 0 && <p className="py-2 text-center text-xs text-gray-400">Tiada team diluluskan yang sepadan.</p>}
            {teams.map(t => {
              const perk = perkFor(t.tournament_id);
              return (
                <div key={t.team_id} className="rounded-lg bg-gray-50 p-2">
                  <div className="text-xs font-bold text-gray-900">
                    {t.team_number ? `#${t.team_number} ` : ""}{t.team_name}{t.short_name ? ` [${t.short_name}]` : ""}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {t.players.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          s.setTournamentPerk({
                            team_id: t.team_id, team_name: t.team_name, player_id: p.id, player_ign: p.ign,
                            percent: perk.percent, category_names: perk.category_names,
                          });
                          setOpen(false); setQ("");
                        }}
                        className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-900 active:scale-95"
                      >
                        {p.ign}{p.is_captain ? " 👑" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
