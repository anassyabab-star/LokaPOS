"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTournament } from "@/components/tournament/tournament-provider";
import { ROLE_LABEL, type PlayerRole, type RegistrationStatus } from "@/lib/tournament/types";
import { PageHeader } from "../shell";

type MyTeam = {
  id: string;
  name: string;
  registration_status: RegistrationStatus;
  reject_reason: string | null;
  has_payment_proof: boolean;
  payment_ref: string | null;
  players: { id: string; full_name: string | null; ign: string; phone?: string | null; player_role: PlayerRole; is_captain: boolean }[];
};
type Voucher = { code: string; label: string; expires_at: string | null; valid_from?: string | null; min_spend: number };
type Me = { signed_in: boolean; phone?: string; is_captain?: boolean; team: MyTeam | null };

// The participant app is in English; the dashboard's labels are Malay.
const STATUS_TEXT: Record<RegistrationStatus, string> = {
  pending_payment: "Awaiting payment",
  payment_submitted: "Under review",
  approved: "Approved",
  rejected: "Not approved",
  withdrawn: "Withdrawn",
};

const TONE: Record<RegistrationStatus, string> = {
  pending_payment: "bg-amber-500/15 text-amber-300",
  payment_submitted: "bg-sky-500/15 text-sky-300",
  approved: "bg-emerald-500/15 text-emerald-300",
  rejected: "bg-red-500/15 text-red-300",
  withdrawn: "bg-white/10 text-white/50",
};

export default function MyRegistrationPage() {
  const { slug, data, setMyTeamId } = useTournament();
  const base = `/tournament/${slug}`;
  const [me, setMe] = useState<Me | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Once a receipt is in, the payment box folds away behind "Replace receipt".
  const [replacing, setReplacing] = useState(false);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    // /api/public/me first so a Google session re-mints the phone cookie.
    await fetch("/api/public/me", { cache: "no-store" }).catch(() => {});
    const d = await fetch(`/api/public/tournaments/${encodeURIComponent(slug)}/me`, { cache: "no-store" }).then(r => r.json()).catch(() => null);
    setMe(d && !d.error ? d : { signed_in: false, team: null });
    if (d?.team?.registration_status === "approved") {
      setMyTeamId(d.team.id);
      // The voucher lives in the Loka wallet; show it here too so players
      // don't have to know about /rewards. Codes only come back for the
      // signed-in owner of the number.
      const w = await fetch(`/api/public/vouchers?phone=${encodeURIComponent(d.phone)}`, { cache: "no-store" }).then(r => r.json()).catch(() => null);
      const list = (Array.isArray(w?.vouchers) ? w.vouchers : []) as Voucher[];
      setVouchers(list.filter(v => v.label.startsWith(data?.tournament.name || "\u0000") || v.label.startsWith(`Hari ${data?.tournament.name}`)));
    }
  }, [slug, setMyTeamId, data?.tournament.name]);

  useEffect(() => { void load(); }, [load]);

  async function upload() {
    if (!file) { setMsg("Choose the receipt first."); return; }
    setBusy(true); setMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (ref.trim()) form.append("payment_ref", ref.trim());
      const res = await fetch(`/api/public/tournaments/${encodeURIComponent(slug)}/payment-proof`, { method: "POST", body: form });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(d.error || "Upload failed"); return; }
      setFile(null); setRef(""); setReplacing(false);
      await load();
    } catch {
      setMsg("No connection.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;
  const t = data.tournament;
  const team = me?.team;
  const fee = Number(t.entry_fee || 0);
  const canUpload = me?.is_captain && team && ["pending_payment", "payment_submitted", "rejected"].includes(team.registration_status) && fee > 0;

  return (
    <div className="pb-10">
      <PageHeader title="My registration" subtitle={t.name} back={base} />
      <div className="space-y-4 px-4 pt-4">
        {me === null ? (
          <div className="h-40 animate-pulse rounded-2xl bg-white/5" />
        ) : !me.signed_in ? (
          <div className="py-12 text-center">
            <div className="text-5xl">📱</div>
            <p className="mt-3 text-sm text-white/55">Sign in with the number you registered with.</p>
            <Link href={`/signin?next=${encodeURIComponent(`${base}/my`)}`} className="mt-5 inline-block rounded-2xl bg-red-600 px-6 py-3 font-bold">Sign in</Link>
          </div>
        ) : !team ? (
          <div className="py-12 text-center">
            <div className="text-5xl">🎮</div>
            <p className="mt-3 text-sm text-white/55">No registration for {me.phone} in this tournament.</p>
            {t.status === "registration_open" && (
              <Link href={`${base}/register`} className="mt-5 inline-block rounded-2xl bg-red-600 px-6 py-3 font-bold">Register a team</Link>
            )}
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-white/40">Team</div>
                  <div className="truncate font-display text-xl font-bold">{team.name}</div>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${TONE[team.registration_status]}`}>
                  {STATUS_TEXT[team.registration_status]}
                </span>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-white/60">
                {team.registration_status === "pending_payment" && "Almost there — pay the entry fee and upload the receipt below."}
                {team.registration_status === "payment_submitted" && (fee > 0 ? "Receipt received. We'll check it and approve your team soon." : "Received. We'll approve your team soon.")}
                {team.registration_status === "approved" && "You're in! 🎉 Your Loka voucher is waiting in Rewards."}
                {team.registration_status === "rejected" && (team.reject_reason || "Your registration wasn't approved.")}
                {team.registration_status === "withdrawn" && "This registration was withdrawn."}
              </p>
              {team.registration_status === "approved" && vouchers.length > 0 && (
                <div className="mt-4 space-y-2">
                  {vouchers.map(v => (
                    <div key={v.code} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.08] px-3.5 py-3">
                      <div className="min-w-0">
                        <div className="font-display text-lg font-bold tracking-wider text-emerald-100">{v.code}</div>
                        <div className="truncate text-[12px] text-white/55">
                          {v.label.replace(/^.*?:\s*/, "")}
                          {v.min_spend ? ` · min RM${v.min_spend}` : ""}
                          {v.expires_at ? ` · until ${new Date(v.expires_at).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short" })}` : ""}
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] font-semibold text-emerald-300">Show at counter</span>
                    </div>
                  ))}
                </div>
              )}
              {team.registration_status === "approved" && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link href={base} className="rounded-xl bg-red-600 py-2.5 text-center text-sm font-bold">Tournament home</Link>
                  <Link href="/rewards" className="rounded-xl border border-white/15 py-2.5 text-center text-sm font-semibold">My vouchers</Link>
                </div>
              )}
            </div>

            {canUpload && team.has_payment_proof && team.registration_status === "payment_submitted" && !replacing && (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.07] px-4 py-3">
                <span className="text-[13px] font-semibold text-emerald-200">✓ Receipt uploaded{team.payment_ref ? ` · Ref ${team.payment_ref}` : ""}</span>
                <button onClick={() => setReplacing(true)} className="shrink-0 text-[12px] font-semibold text-white/60">Replace</button>
              </div>
            )}

            {canUpload && (!team.has_payment_proof || team.registration_status !== "payment_submitted" || replacing) && (
              <div className="space-y-3 rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-5">
                <div className="font-display text-lg font-bold">
                  {team.has_payment_proof ? "Replace receipt" : `Pay RM${fee.toFixed(2).replace(/\.00$/, "")}`}
                </div>
                {t.payment_instructions && (
                  <div className="relative rounded-xl bg-black/30 p-3.5">
                    <p className="whitespace-pre-line pr-14 text-[13px] leading-relaxed text-white/80">{t.payment_instructions}</p>
                    <button
                      onClick={() => {
                        void navigator.clipboard?.writeText(t.payment_instructions || "").then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
                      }}
                      className="absolute right-2.5 top-2.5 rounded-lg bg-white/10 px-2 py-1 text-[11px] font-semibold"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                )}
                {t.payment_qr_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.payment_qr_url} alt="Payment QR" className="mx-auto w-56 rounded-xl bg-white p-2" />
                )}
                <p className="text-[12px] text-white/50">Use your team name as the transfer reference.</p>
                <input ref={input} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
                <button onClick={() => input.current?.click()} className="w-full rounded-xl border border-dashed border-white/25 py-4 text-sm text-white/70">
                  {file ? `📎 ${file.name}` : "📷 Choose receipt (photo / screenshot / PDF)"}
                </button>
                <input
                  value={ref}
                  onChange={e => setRef(e.target.value)}
                  placeholder="Transaction reference (optional)"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[14px] outline-none focus:border-red-500"
                />
                {msg && <p className="text-sm text-red-300">⚠️ {msg}</p>}
                <button onClick={() => void upload()} disabled={busy || !file} className="w-full rounded-xl bg-red-600 py-3 font-bold disabled:opacity-40">
                  {busy ? "Uploading…" : "Upload receipt"}
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Players</div>
              <div className="divide-y divide-white/5">
                {team.players.map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold">{p.ign}{p.is_captain ? " 👑" : ""}</div>
                      {(p.full_name || p.phone) && <div className="truncate text-[12px] text-white/45">{[p.full_name, p.phone].filter(Boolean).join(" · ")}</div>}
                    </div>
                    <span className="shrink-0 text-[11px] text-white/40">{ROLE_LABEL[p.player_role]}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-white/35">Need to change a player? Message Loka — we&apos;ll update it for you.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
