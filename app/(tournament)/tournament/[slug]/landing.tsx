"use client";

import Link from "next/link";
import { countdownParts, formatWhen, useNow } from "@/components/tournament/ui";
import { rmLabel, voucherSpecLabel, type PublicBundle, type Prize } from "@/lib/tournament/types";

// ============================================================================
// The registration pitch — what the shared link shows while entries are open:
// slots left, the deadline ticking down, prizes, the captain's voucher,
// how it works, and FAQ. A sticky button keeps "Register" in reach.
// ============================================================================

const MEDALS = ["🥇", "🥈", "🥉"];

export function PrizesCard({ prizes, compact }: { prizes: Prize[]; compact?: boolean }) {
  if (!prizes.length) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-amber-400/30 bg-gradient-to-b from-amber-400/[0.12] to-transparent">
      <div className="px-4 pt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-300/80">🏆 Prizes</div>
      <div className={`grid gap-2 p-4 ${compact ? "" : "sm:grid-cols-3"}`}>
        {prizes.map((p, i) => (
          <div key={i} className={`flex items-center gap-3 rounded-xl bg-black/25 px-3.5 ${i === 0 && !compact ? "py-4" : "py-3"}`}>
            <span className={i === 0 && !compact ? "text-3xl" : "text-2xl"}>{MEDALS[i] || "🎖️"}</span>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/50">{p.title}</div>
              <div className={`font-display font-bold text-white ${i === 0 && !compact ? "text-xl" : "text-[15px]"}`}>{p.value || "TBA"}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group border-t border-white/5 first:border-t-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 text-[14px] font-semibold text-white/90">
        {q}
        <span className="text-white/40 transition group-open:rotate-45">+</span>
      </summary>
      <div className="pb-4 text-[13px] leading-relaxed text-white/60">{children}</div>
    </details>
  );
}

export function RegistrationLanding({ data, base }: { data: PublicBundle; base: string }) {
  const t = data.tournament;
  const now = useNow();
  const { taken, max } = data.registration;
  const left = Math.max(0, max - taken);
  const full = left === 0;
  const pct = Math.min(100, Math.round((taken / Math.max(1, max)) * 100));
  const deadline = t.registration_deadline ? countdownParts(t.registration_deadline, now) : null;
  const fee = Number(t.entry_fee || 0);
  const vc = t.voucher_config || {};
  const perks = [
    vc.discount?.enabled && { big: voucherSpecLabel(vc.discount), small: `your next Loka order${vc.discount.min_spend ? ` (min ${rmLabel(vc.discount.min_spend)})` : ""} · valid ${vc.discount.validity_days || 30} days` },
    vc.event_day?.enabled && { big: voucherSpecLabel(vc.event_day), small: "everything you order on tournament day" },
  ].filter(Boolean) as { big: string; small: string }[];

  return (
    <div className="space-y-5">
      {/* slots + deadline + CTA */}
      <section className="rounded-2xl border border-red-500/40 bg-red-500/[0.08] p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-red-300">{full ? "Registration full" : "Registration open"}</div>
            <div className="mt-1 font-display text-3xl font-bold leading-none">
              {full ? "All slots taken" : <>{left} <span className="text-lg font-semibold text-white/60">slot{left === 1 ? "" : "s"} left</span></>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-white/45">Entry / team</div>
            <div className="font-display text-xl font-bold">{fee > 0 ? rmLabel(fee) : "FREE"}</div>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <div className={`h-full rounded-full ${pct >= 75 ? "bg-red-500" : "bg-red-400"}`} style={{ width: `${Math.max(4, pct)}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-white/45">
          <span>{taken} / {max} teams</span>
          {pct >= 75 && !full && <span className="font-semibold text-red-300">Filling fast 🔥</span>}
        </div>

        {deadline && (
          <div className="mt-4 rounded-xl bg-black/30 px-4 py-3 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Registration closes in</div>
            <div className="mt-0.5 font-display text-2xl font-bold tabular-nums">{deadline.text}</div>
            <div className="text-[11px] text-white/40">{formatWhen(t.registration_deadline)}</div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          {full ? (
            <span className="rounded-xl bg-white/10 py-3 text-center text-sm font-bold text-white/50">Full — follow Loka for the next one</span>
          ) : (
            <Link href={`${base}/register`} className="rounded-xl bg-red-600 py-3 text-center text-[15px] font-bold shadow-lg shadow-red-900/40 active:scale-[.98]">
              Register your team →
            </Link>
          )}
          <Link href={`${base}/my`} className="rounded-xl border border-white/15 px-4 py-3 text-center text-sm font-semibold text-white/80">My entry</Link>
        </div>
      </section>

      <PrizesCard prizes={t.prizes || []} />

      {perks.length > 0 && (
        <section className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.07] p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300/90">☕ Captain gets</div>
          <div className="mt-3 space-y-3">
            {perks.map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 text-xl">🎟️</div>
                <div>
                  <div className="font-display text-xl font-bold text-emerald-100">{p.big}</div>
                  <div className="text-[12px] text-white/55">{p.small}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-white/40">Straight into the captain&apos;s Loka account once the team is approved.</p>
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">How it works</div>
        <ol className="mt-3 space-y-3">
          {[
            ["Register", `Captain signs in and adds ${t.min_players}${t.max_players > t.min_players ? `–${t.max_players}` : ""} players — just IGN and MLBB User ID.`],
            ...(fee > 0 ? [["Pay", `Transfer ${rmLabel(fee)} and upload the receipt.`]] : []),
            ["Get approved", "We check it and confirm your slot on WhatsApp."],
            ["Play", `Show up at ${t.venue || "Loka"}${t.start_at ? ` on ${formatWhen(t.start_at, { dateOnly: true })}` : ""} and follow your matches live here.`],
          ].map(([title, body], i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-600 text-[13px] font-bold">{i + 1}</span>
              <div>
                <div className="text-[14px] font-semibold">{title}</div>
                <div className="text-[13px] text-white/55">{body}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-2">
        <div className="pt-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">FAQ</div>
        <Faq q="How many players per team?">
          {t.min_players} players{t.max_players > t.min_players ? `, plus up to ${t.max_players - t.min_players} substitute${t.max_players - t.min_players > 1 ? "s" : ""}` : ""}. Each player can only be in one team.
        </Faq>
        <Faq q="What do I need for each player?">
          Just their IGN and MLBB User ID (tap the profile picture in MLBB — it&apos;s the first number, e.g. ID: 123456789). Only the captain signs in with a phone number.
        </Faq>
        {fee > 0 && (
          <Faq q="How do I pay?">
            After registering you&apos;ll see the bank details{t.payment_qr_url ? " and a DuitNow QR" : ""}. Transfer {rmLabel(fee)} using your team name as the reference, then upload the receipt from the same page.
          </Faq>
        )}
        <Faq q="When does the voucher arrive?">
          As soon as your team is approved — usually shortly after we check the receipt. You&apos;ll get a WhatsApp message.
          {vc.event_day?.enabled ? " The tournament-day voucher only works on the day itself." : ""}
        </Faq>
        <Faq q="Can we change a player later?">Yes — message Loka and we&apos;ll update it for you before the tournament.</Faq>
        <Faq q="What if our registration is rejected?">You&apos;ll see the reason on your entry page and can upload a new receipt there.</Faq>
      </section>

    </div>
  );
}

/**
 * Keeps Register in reach while scrolling the pitch; sits above the bottom nav.
 * Render it OUTSIDE any animated (transformed) wrapper — a transform turns
 * `position: fixed` into "fixed to that element", pinning it to the page end.
 */
export function StickyRegister({ data, base }: { data: PublicBundle; base: string }) {
  const t = data.tournament;
  if (t.status !== "registration_open" || data.registration.taken >= data.registration.max) return null;
  const fee = Number(t.entry_fee || 0);
  return (
    <div className="pointer-events-none fixed inset-x-0 z-30 mx-auto max-w-lg px-4" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}>
      <Link href={`${base}/register`} className="pointer-events-auto block rounded-2xl bg-red-600 py-3.5 text-center font-bold shadow-2xl shadow-black/60 active:scale-[.98]">
        Register your team{fee > 0 ? ` · ${rmLabel(fee)}` : ""}
      </Link>
    </div>
  );
}
