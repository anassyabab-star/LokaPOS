"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTournament } from "@/components/tournament/tournament-provider";
import { PLAYER_ROLES, ROLE_LABEL, voucherSpecLabel, type PlayerRole } from "@/lib/tournament/types";
import { PageHeader } from "../shell";

type Row = { full_name: string; ign: string; mlbb_user_id: string; server_id: string; phone: string; player_role: PlayerRole };

const DEFAULT_ROLES: PlayerRole[] = ["exp", "jungler", "mid", "gold", "roamer", "sub"];
const blankRow = (i: number): Row => ({ full_name: "", ign: "", mlbb_user_id: "", server_id: "", phone: "", player_role: DEFAULT_ROLES[i] || "sub" });

const field = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[14px] text-white outline-none placeholder:text-white/25 focus:border-red-500 focus:ring-1 focus:ring-red-500/30";

export default function RegisterPage() {
  const { slug, data } = useTournament();
  const router = useRouter();
  const base = `/tournament/${slug}`;
  const [me, setMe] = useState<{ signed_in: boolean; phone?: string | null } | null>(null);
  const [teamName, setTeamName] = useState("");
  const [shortName, setShortName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = data?.tournament;

  useEffect(() => {
    let live = true;
    (async () => {
      const who = await fetch("/api/public/me", { cache: "no-store" }).then(r => r.json()).catch(() => ({ signed_in: false }));
      if (!live) return;
      if (who?.signed_in && who.phone) {
        // Already registered (as captain or player)? Go to the status page.
        const mine = await fetch(`/api/public/tournaments/${encodeURIComponent(slug)}/me`, { cache: "no-store" }).then(r => r.json()).catch(() => null);
        if (!live) return;
        if (mine?.team) { router.replace(`${base}/my`); return; }
      }
      setMe({ signed_in: !!who?.signed_in && !!who.phone, phone: who?.phone || null });
    })();
    return () => { live = false; };
  }, [slug, base, router]);

  useEffect(() => {
    // Wait for /api/public/me: building the rows first left the captain's
    // (read-only) phone empty for good, so the form could never be submitted.
    if (!t || !me || rows.length) return;
    const first = { ...blankRow(0), phone: me.phone || "" };
    setRows([first, ...Array.from({ length: Math.max(0, t.min_players - 1) }, (_, i) => blankRow(i + 1))]);
  }, [t, me, rows.length]);

  if (!data || !t) return null;

  const closed = t.status !== "registration_open" || (t.registration_deadline && Date.now() > new Date(t.registration_deadline).getTime());
  const set = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const vc = t.voucher_config || {};

  async function submit() {
    setError(null);
    if (teamName.trim().length < 2) { setError("Enter your team name."); return; }
    for (const [i, r] of rows.entries()) {
      if (!r.full_name.trim() || !r.ign.trim() || !r.mlbb_user_id.trim() || !r.server_id.trim() || r.phone.replace(/\D/g, "").length < 9) {
        setError(`Player ${i + 1}: fill in every field.`); return;
      }
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/public/tournaments/${encodeURIComponent(slug)}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team: { name: teamName, short_name: shortName }, players: rows }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 401) { router.push(`/signin?next=${encodeURIComponent(`${base}/register`)}`); return; }
      if (!res.ok) { setError(d.error || "Registration failed"); return; }
      router.replace(`${base}/my?new=1`);
    } catch {
      setError("No connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-10">
      <PageHeader title="Register team" subtitle={t.name} back={base} />

      {closed ? (
        <div className="px-6 py-16 text-center">
          <div className="text-4xl">🔒</div>
          <p className="mt-3 text-white/60">Registration is closed.</p>
          <Link href={`${base}/my`} className="mt-5 inline-block rounded-xl border border-white/15 px-5 py-2.5 text-sm">My registration</Link>
        </div>
      ) : me === null ? (
        <div className="space-y-3 p-4"><div className="h-24 animate-pulse rounded-2xl bg-white/5" /><div className="h-64 animate-pulse rounded-2xl bg-white/5" /></div>
      ) : !me.signed_in ? (
        <div className="px-6 py-14 text-center">
          <div className="text-5xl">📱</div>
          <h2 className="mt-4 font-display text-xl font-bold">Sign in as the captain</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/55">
            Use your own phone number (or Google). You&apos;ll be listed as captain, and it&apos;s where your Loka vouchers go.
          </p>
          <Link href={`/signin?next=${encodeURIComponent(`${base}/register`)}`} className="mt-6 inline-block w-full rounded-2xl bg-red-600 py-3.5 font-bold">
            Sign in to continue
          </Link>
        </div>
      ) : (
        <div className="space-y-5 px-4 pt-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[13px] leading-relaxed text-white/65">
            <div className="font-semibold text-white">How it works</div>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
              <li>Fill in your team ({t.min_players}–{t.max_players} players).</li>
              {Number(t.entry_fee) > 0 && <li>Transfer RM{Number(t.entry_fee).toFixed(2).replace(/\.00$/, "")} and upload the receipt.</li>}
              <li>We check it and approve your team.</li>
              <li>
                Every player gets Loka vouchers
                {vc.discount?.enabled ? ` — ${voucherSpecLabel(vc.discount)}` : ""}
                {vc.event_day?.enabled ? `${vc.discount?.enabled ? " +" : " —"} ${voucherSpecLabel(vc.event_day)} on tournament day` : ""}.
              </li>
            </ol>
          </div>

          <section className="space-y-3">
            <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Team</h2>
            <div className="grid grid-cols-[1fr_96px] gap-2">
              <input className={field} placeholder="Team name" value={teamName} onChange={e => setTeamName(e.target.value)} maxLength={40} />
              <input className={field} placeholder="Tag" value={shortName} onChange={e => setShortName(e.target.value.toUpperCase())} maxLength={6} />
            </div>
          </section>

          {rows.map((r, i) => (
            <section key={i} className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-bold">{i === 0 ? "Player 1 · Captain (you)" : `Player ${i + 1}`}</h3>
                {i >= t.min_players && (
                  <button onClick={() => setRows(rs => rs.filter((_, k) => k !== i))} className="text-[12px] text-white/40">Remove</button>
                )}
              </div>
              <input className={field} placeholder="Full name" value={r.full_name} onChange={e => set(i, { full_name: e.target.value })} />
              <input className={field} placeholder="IGN (in-game name)" value={r.ign} onChange={e => set(i, { ign: e.target.value })} />
              {i === 0 && (
                <p className="px-1 text-[11px] leading-relaxed text-white/40">
                  In MLBB, tap your profile picture — it shows <span className="text-white/70">ID: 123456789 (2012)</span>. The first number is the User ID, the one in brackets is the Server ID.
                </p>
              )}
              <div className="grid grid-cols-[1fr_100px] gap-2">
                <input className={field} inputMode="numeric" placeholder="MLBB User ID" value={r.mlbb_user_id} onChange={e => set(i, { mlbb_user_id: e.target.value.replace(/\D/g, "") })} />
                <input className={field} inputMode="numeric" placeholder="Server ID" value={r.server_id} onChange={e => set(i, { server_id: e.target.value.replace(/\D/g, "") })} />
              </div>
              <input
                className={`${field} ${i === 0 && me?.phone ? "opacity-60" : ""}`}
                inputMode="tel"
                placeholder="Phone (WhatsApp)"
                value={r.phone}
                readOnly={i === 0 && !!me?.phone}
                onChange={e => set(i, { phone: e.target.value })}
              />
              <select className={field} value={r.player_role} onChange={e => set(i, { player_role: e.target.value as PlayerRole })}>
                {PLAYER_ROLES.map(role => <option key={role} value={role} className="bg-[#12151C]">{ROLE_LABEL[role]}</option>)}
              </select>
            </section>
          ))}

          {rows.length < t.max_players && (
            <button onClick={() => setRows(rs => [...rs, blankRow(rs.length)])} className="w-full rounded-2xl border border-dashed border-white/15 py-3 text-sm font-semibold text-white/60">
              + Add substitute
            </button>
          )}

          <p className="px-1 text-[11px] leading-relaxed text-white/35">
            Each player needs their own phone number — vouchers are sent to it. Their numbers are only used for this tournament and their Loka account.
          </p>

          {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">⚠️ {error}</div>}

          <button onClick={() => void submit()} disabled={busy} className="w-full rounded-2xl bg-red-600 py-4 font-bold disabled:opacity-50">
            {busy ? "Submitting…" : Number(t.entry_fee) > 0 ? "Submit & pay" : "Submit registration"}
          </button>
        </div>
      )}
    </div>
  );
}
