"use client";

import { useState } from "react";
import { PLAYER_ROLES, ROLE_LABEL, type PlayerRole } from "@/lib/tournament/types";

export type RosterPlayer = {
  id?: string;
  full_name: string | null;
  ign: string;
  mlbb_user_id: string;
  player_role: PlayerRole;
  is_captain: boolean;
};

const field = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[14px] text-white outline-none placeholder:text-white/25 focus:border-red-500";

// The captain swaps players before the deadline: same fields as registration
// (IGN, User ID, role; full name for the captain only). The captain row
// can't be removed — it's the account the entry belongs to.
export function RosterEditor({ slug, initial, min, max, onSaved, onCancel }: {
  slug: string; initial: RosterPlayer[]; min: number; max: number;
  onSaved: () => Promise<void> | void; onCancel: () => void;
}) {
  const [rows, setRows] = useState<RosterPlayer[]>(() => [...initial].sort((a, b) => Number(b.is_captain) - Number(a.is_captain)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, patch: Partial<RosterPlayer>) => setRows(rs => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  async function save() {
    setError(null);
    for (const [i, r] of rows.entries()) {
      if (!r.ign.trim() || !r.mlbb_user_id.trim()) { setError(`Player ${i + 1}: IGN and MLBB User ID are required.`); return; }
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/public/tournaments/${encodeURIComponent(slug)}/roster`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players: rows }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "Couldn't save the roster"); return; }
      await onSaved();
    } catch {
      setError("No connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.id || `new-${i}`} className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold">{r.is_captain ? "Player 1 · Captain" : `Player ${i + 1}`}</span>
            {!r.is_captain && rows.length > min && (
              <button onClick={() => setRows(rs => rs.filter((_, k) => k !== i))} className="text-[12px] text-white/40">Remove</button>
            )}
          </div>
          {r.is_captain && (
            <input className={field} placeholder="Your full name" value={r.full_name || ""} onChange={e => set(i, { full_name: e.target.value })} />
          )}
          <div className="grid grid-cols-2 gap-2">
            <input className={field} placeholder="IGN" value={r.ign} onChange={e => set(i, { ign: e.target.value })} />
            <input className={field} inputMode="numeric" placeholder="MLBB User ID" value={r.mlbb_user_id} onChange={e => set(i, { mlbb_user_id: e.target.value.replace(/\D/g, "") })} />
          </div>
          <select className={field} value={r.player_role} onChange={e => set(i, { player_role: e.target.value as PlayerRole })}>
            {PLAYER_ROLES.map(role => <option key={role} value={role} className="bg-[#12151C]">{ROLE_LABEL[role]}</option>)}
          </select>
        </div>
      ))}
      {rows.length < max && (
        <button
          onClick={() => setRows(rs => [...rs, { full_name: null, ign: "", mlbb_user_id: "", player_role: "sub", is_captain: false }])}
          className="w-full rounded-2xl border border-dashed border-white/15 py-3 text-sm font-semibold text-white/60"
        >
          + Add player
        </button>
      )}
      {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">⚠️ {error}</div>}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onCancel} disabled={busy} className="rounded-xl border border-white/15 py-3 text-sm font-semibold text-white/70">Cancel</button>
        <button onClick={() => void save()} disabled={busy} className="rounded-xl bg-red-600 py-3 text-sm font-bold disabled:opacity-50">{busy ? "Saving…" : "Save roster"}</button>
      </div>
    </div>
  );
}
