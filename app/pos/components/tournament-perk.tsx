"use client";

import { useEffect, useState } from "react";
import { usePos } from "../pos-context";

type Perk = { tournament_id: string; tournament_name: string; percent: number; category_names: string[] };
type TeamRow = {
  team_id: string; team_name: string; short_name: string | null; team_number: number | null; tournament_id: string;
  players: Player[];
};
type Player = { id: string; ign: string; mlbb_user_id: string; is_captain: boolean; uses_today: number };

// "🎮 Pemain Tournament" — only shows on a tournament day with the player perk
// on. The cashier finds the team (or the player's IGN / User ID), taps the
// player, then checks the MLBB User ID on the player's own in-game profile
// before the perk (e.g. 20% off drinks) is taken off this sale.
export default function TournamentPerk() {
  const s = usePos();
  const [perks, setPerks] = useState<Perk[] | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState<{ team: TeamRow; player: Player } | null>(null);

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

  if (checking) {
    const { team, player } = checking;
    const perk = perkFor(team.tournament_id);
    return (
      <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3">
        <div className="text-xs font-semibold text-violet-900">Sahkan pemain</div>
        <p className="mt-1 text-[11px] text-violet-800">Minta pemain buka MLBB → Profile di telefon sendiri. User ID mesti sama:</p>
        <div className="mt-2 rounded-lg bg-white px-3 py-2 text-center">
          <div className="font-mono text-2xl font-bold tracking-wider text-gray-900">{player.mlbb_user_id || "—"}</div>
          <div className="mt-0.5 text-xs text-gray-500">{player.ign}{player.is_captain ? " 👑" : ""} · {team.team_name}</div>
        </div>
        <p className={`mt-2 text-[11px] ${player.uses_today > 0 ? "font-semibold text-amber-700" : "text-gray-500"}`}>
          Dah guna hari ini: {player.uses_today} kali
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button onClick={() => setChecking(null)} className="rounded-lg border border-gray-200 bg-white py-2 text-xs font-semibold text-gray-600">Batal</button>
          <button
            onClick={() => {
              s.setTournamentPerk({
                team_id: team.team_id, team_name: team.team_name, player_id: player.id, player_ign: player.ign,
                percent: perk.percent, category_names: perk.category_names,
              });
              setChecking(null); setOpen(false); setQ("");
            }}
            className="rounded-lg bg-violet-700 py-2 text-xs font-bold text-white"
          >
            ID sama — guna {perk.percent}%
          </button>
        </div>
      </div>
    );
  }

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
            <span className="text-xs font-semibold text-violet-900">Cari team / IGN / User ID</span>
            <button onClick={() => { setOpen(false); setQ(""); }} className="text-xs text-gray-500">Tutup</button>
          </div>
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Nama team, IGN atau User ID"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20"
          />
          <p className="mt-1.5 text-[11px] text-gray-500">Tekan nama pemain, kemudian semak User ID dalam profil MLBB pemain.</p>
          <div className="mt-2 max-h-60 space-y-2 overflow-y-auto">
            {loading && teams.length === 0 && <p className="py-2 text-center text-xs text-gray-400">Mencari…</p>}
            {!loading && teams.length === 0 && <p className="py-2 text-center text-xs text-gray-400">Tiada team diluluskan yang sepadan.</p>}
            {teams.map(t => {
              return (
                <div key={t.team_id} className="rounded-lg bg-gray-50 p-2">
                  <div className="text-xs font-bold text-gray-900">
                    {t.team_number ? `#${t.team_number} ` : ""}{t.team_name}{t.short_name ? ` [${t.short_name}]` : ""}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {t.players.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setChecking({ team: t, player: p })}
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
