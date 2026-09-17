"use client";

// Loyalty / Rewards (design README §8) — the member home of the QR ordering app.
// Balance + tier, daily check-in, voucher wallet, redeem tiers, referral share,
// recent orders and account (sign out). Everything reads the public loyalty
// APIs keyed on the customer's phone; OTP-gated actions silently refresh the
// Google-backed session once before bouncing to /signin.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOrder, rm, localPhone } from "../order-provider";
import { MissionList } from "@/components/order/MissionCards";

type Tier = { points: number; amount: number; label: string };
type Activity = { id: string; receipt_number: string | null; short_number?: string; status: string | null; total: number | null; created_at: string };
type Voucher = { code: string; reward_label: string | null; reward_amount: number; expires_at: string | null; min_spend?: number | null };
type Wallet = {
  points: number;
  expiring: number;
  tier: string | null;
  spend12m: number;
  referral: string | null;
  vouchers: Voucher[];
  orders: Activity[];
};

const THRESHOLD = 300;
const STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Awaiting payment",
  pending: "In queue",
  preparing: "Being prepared",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};
const ACTIVE = new Set(["awaiting_payment", "pending", "preparing", "ready"]);

function shortNo(o: Activity) {
  if (o.short_number) return o.short_number;
  const m = String(o.receipt_number || "").match(/-(\d+)$/);
  return m ? m[1].padStart(3, "0") : (o.receipt_number || o.id.slice(0, 6));
}

export default function RewardsPage() {
  const router = useRouter();
  const { contact, clearSession, member } = useOrder();
  // Prefer the phone the server confirmed for this session. contact.phone is
  // a localStorage leftover that can be a number the customer typed as a guest
  // long ago — with that stale value the whole page (balance, vouchers,
  // challenges) silently reports on the wrong account, or on none.
  const phone = member?.phone || contact.phone;
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [showAllTiers, setShowAllTiers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [status, track] = await Promise.all([
        fetch("/api/public/store-status", { cache: "no-store" }).then(r => r.json()).catch(() => null),
        phone
          ? fetch(`/api/public/orders/track?phone=${encodeURIComponent(phone)}`, { cache: "no-store" }).then(r => r.json()).catch(() => null)
          : Promise.resolve(null),
      ]);
      setTiers((status?.loyalty_config?.voucherTiers || []) as Tier[]);
      if (track && !track.error) {
        setWallet({
          points: typeof track.loyalty_points === "number" ? track.loyalty_points : 0,
          expiring: Number(track.expiring_points_30d || 0),
          tier: track.tier || null,
          spend12m: Number(track.spend_12m || 0),
          referral: track.referral_code || null,
          vouchers: Array.isArray(track.vouchers) ? track.vouchers : [],
          orders: Array.isArray(track.orders) ? track.orders : [],
        });
      } else {
        setWallet(null);
      }
    } finally {
      setLoading(false);
    }
  }, [phone]);

  useEffect(() => { void load(); }, [load]);

  const signedIn = phone.length > 0 && wallet !== null;
  const points = wallet?.points ?? 0;
  const pct = Math.min(100, Math.round((points / THRESHOLD) * 100));

  // POST to an OTP-gated endpoint. On 401/403, refresh the Google-backed phone
  // session once (/api/public/me re-mints the cookie) and retry before giving up.
  async function gated(url: string, body: Record<string, unknown>) {
    const send = () =>
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let res = await send();
    if (res.status === 401 || res.status === 403) {
      await fetch("/api/public/me", { cache: "no-store" }).catch(() => {});
      res = await send();
    }
    return res;
  }

  function needsSignIn(res: Response, d: { code?: string } | null) {
    return res.status === 401 || res.status === 403 || d?.code === "OTP_REQUIRED" || d?.code === "OTP_PHONE_MISMATCH";
  }

  async function checkIn() {
    if (!phone) { router.push("/signin?next=/rewards"); return; }
    setBusy("checkin"); setMsg(null);
    try {
      const res = await gated("/api/public/checkin", { phone });
      const d = await res.json().catch(() => ({}));
      if (needsSignIn(res, d)) { router.push("/signin?next=/rewards"); return; }
      if (!res.ok) { setMsg(d.error || "Couldn't check in"); return; }
      setMsg(d.already_checked_in ? "Already checked in today — see you tomorrow! ☀️" : `Checked in! +${d.points_earned} pt 🎉`);
      void load();
    } catch {
      setMsg("No connection.");
    } finally {
      setBusy(null);
    }
  }

  async function redeem(tier: Tier) {
    if (!phone) { router.push("/signin?next=/rewards"); return; }
    setBusy(`redeem:${tier.points}`); setMsg(null);
    try {
      const res = await gated("/api/public/redeem", { phone, points: tier.points });
      const d = await res.json().catch(() => ({}));
      if (needsSignIn(res, d)) { router.push("/signin?next=/rewards"); return; }
      if (!res.ok) { setMsg(d.error || "Couldn't redeem"); return; }
      setMsg(`Voucher created: ${d.code} (${tier.label}) 🎉 Show it at the counter.`);
      void load();
    } catch {
      setMsg("No connection.");
    } finally {
      setBusy(null);
    }
  }

  async function shareReferral() {
    const code = wallet?.referral;
    if (!code) return;
    const link = `${window.location.origin}/menu?ref=${encodeURIComponent(code)}`;
    const text = `Try Loka Coffee ☕ Use my code ${code} on your first order and we both get bonus points: ${link}`;
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* user cancelled */ }
  }

  function signOut() {
    clearSession();
    window.location.href = "/auth/logout?next=/menu";
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-cream">
      <div className="safe-top flex flex-none items-center gap-3.5 px-5 pb-3.5 pt-5">
        <button onClick={() => router.push("/menu")} className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border border-hairline bg-card text-[18px] text-espresso active:scale-95" aria-label="Back">←</button>
        <h1 className="font-display text-[20px] font-semibold tracking-[-.01em] text-espresso">Loka Rewards</h1>
      </div>

      <div className="no-scrollbar flex-1 space-y-3.5 overflow-auto px-5 pb-8">
        {/* balance / promo */}
        {signedIn ? (
          <div className="rounded-[18px] bg-espresso p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-sans text-[12px] font-semibold uppercase tracking-label text-muted-3">Your balance</div>
                <div className="mt-1 font-display text-[44px] font-semibold leading-none text-melon">{points}</div>
              </div>
              {wallet?.tier && (
                <span className="rounded-full border border-melon/30 bg-melon/[0.16] px-3 py-1 font-sans text-[11px] font-semibold tracking-[.06em] text-melon-soft">
                  {wallet.tier.toUpperCase()}
                </span>
              )}
            </div>
            <div className="mt-3 flex justify-between font-sans text-[11px] text-[#C9A88F]">
              <span>{Math.max(0, THRESHOLD - points)} pts to a free pour</span>
              <span>{points} / {THRESHOLD}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-cream/15"><div className="h-full rounded-full bg-melon transition-all duration-500" style={{ width: `${pct}%` }} /></div>
            {wallet && wallet.expiring > 0 && (
              <div className="mt-3 font-sans text-[11px] text-melon-soft">⏳ {wallet.expiring} pts expire within 30 days</div>
            )}
          </div>
        ) : (
          <div className="rounded-[18px] bg-espresso p-5">
            <div className="font-display text-[18px] font-semibold text-cream">Start earning today</div>
            <p className="mt-1.5 font-sans text-[13px] text-[#C9A88F]">1 point per RM 1 spent. Redeem for free pours &amp; discounts.</p>
            <Link href="/signin?next=/rewards" className="mt-4 inline-block rounded-[14px] bg-melon px-5 py-2.5 font-sans text-[14px] font-semibold text-espresso active:scale-[.98]">Sign in / Sign up</Link>
          </div>
        )}

        {msg && <div className="rounded-[12px] border border-hairline bg-card px-4 py-3 font-sans text-[13px] text-espresso shadow-card">{msg}</div>}

        {/* daily check-in */}
        {signedIn && (
          <div className="flex items-center gap-3 rounded-[16px] border border-hairline bg-card p-4 shadow-card">
            <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-cream-2 text-[18px]">📅</div>
            <div className="flex-1">
              <div className="font-sans text-[14px] font-semibold text-espresso">Daily check-in</div>
              <div className="font-sans text-[12px] text-muted">Free point every day you drop by</div>
            </div>
            <button onClick={() => void checkIn()} disabled={busy === "checkin"} className="rounded-[12px] bg-maroon px-4 py-2.5 font-sans text-[13px] font-semibold text-cream transition active:scale-95 disabled:opacity-60">
              {busy === "checkin" ? "…" : "Check in"}
            </button>
          </div>
        )}

        {/* voucher wallet */}
        {signedIn && wallet && wallet.vouchers.length > 0 && (
          <div>
            <div className="mb-2 px-1 font-sans text-[12px] font-semibold uppercase tracking-label text-muted-2">Ready to use</div>
            <div className="space-y-2">
              {wallet.vouchers.map(v => (
                <div key={v.code} className="flex items-center gap-3 rounded-[14px] border border-leaf/40 bg-leaf/5 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-[16px] font-semibold tracking-[0.08em] text-espresso">{v.code}</div>
                    <div className="font-sans text-[12px] text-muted">
                      {v.reward_label || `RM ${Number(v.reward_amount || 0).toFixed(2)} off`}
                      {Number(v.min_spend || 0) > 0 ? ` · min spend RM${Number(v.min_spend).toFixed(0)}` : ""}
                      {v.expires_at ? ` · valid until ${new Date(v.expires_at).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}` : ""}
                    </div>
                  </div>
                  <span className="rounded-full bg-leaf px-2.5 py-1 font-sans text-[10px] font-bold uppercase tracking-wide text-cream">Show at counter</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <MissionList phone={phone} />

        {/* redeem — one tier, not four.
            Listing every tier meant a member with 97 points opened this screen
            to four greyed-out rows reading 97/100, 97/500, 97/1000, 97/2000:
            a list of things they cannot have. Show what they can do now, or
            the single nearest target, and keep the rest behind a toggle. */}
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
            <span className="font-sans text-[12px] font-semibold uppercase tracking-label text-muted">Redeem</span>
            {tiers.length > 1 && (
              <button
                onClick={() => setShowAllTiers(v => !v)}
                className="font-sans text-[12px] font-semibold text-maroon active:opacity-60"
              >
                {showAllTiers ? "Show less" : "See all"}
              </button>
            )}
          </div>

          {tiers.length === 0 && !loading ? (
            <p className="px-1 font-sans text-[13px] text-muted">No rewards available yet.</p>
          ) : (
            (() => {
              const affordable = tiers.filter(t => signedIn && points >= t.points);
              const next = tiers.filter(t => t.points > points).sort((a, b) => a.points - b.points)[0];
              // Best value they can take right now; otherwise the nearest one.
              const best = affordable.length > 0 ? affordable[affordable.length - 1] : null;
              const shown = showAllTiers ? tiers : best ? [best] : [];

              return (
                <div className="space-y-2.5">
                  {shown.map(t => {
                    const can = signedIn && points >= t.points;
                    const working = busy === `redeem:${t.points}`;
                    return (
                      <div key={t.points} className="flex items-center gap-3 rounded-[16px] border border-hairline bg-card p-4 shadow-card">
                        <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-cream-2 text-[18px]">🎁</div>
                        <div className="min-w-0 flex-1">
                          <div className="font-sans text-[14px] font-semibold text-espresso">{t.label} off</div>
                          <div className="font-sans text-[12px] text-muted">{t.points} pts</div>
                        </div>
                        <button
                          onClick={() => can && redeem(t)}
                          disabled={!can || working}
                          className={`min-h-[44px] rounded-[12px] px-4 font-sans text-[13px] font-semibold transition active:scale-95 ${can ? "bg-maroon text-cream" : "cursor-default bg-cream-2 text-muted"}`}
                        >
                          {working ? "…" : can ? "Redeem" : `${points}/${t.points}`}
                        </button>
                      </div>
                    );
                  })}

                  {/* Nothing affordable yet: one target with a bar, like checkout. */}
                  {!showAllTiers && !best && next && (
                    <div className="rounded-[16px] border border-hairline bg-card p-4 shadow-card">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-sans text-[14px] font-semibold text-espresso">{next.label} off</span>
                        <span className="font-display text-[13px] font-semibold text-leaf">{points}/{next.points}</span>
                      </div>
                      <div className="mt-2 h-[6px] w-full overflow-hidden rounded-full bg-hairline">
                        <div
                          className="h-full rounded-full bg-leaf"
                          style={{ width: `${Math.max(Math.min(100, (points / next.points) * 100), points > 0 ? 6 : 0)}%` }}
                        />
                      </div>
                      <p className="mt-1.5 font-sans text-[12px] text-muted">
                        {next.points - points} more {next.points - points === 1 ? "point" : "points"} to unlock this
                      </p>
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </div>

        {/* referral */}
        {signedIn && wallet?.referral && (
          <div className="rounded-[18px] bg-maroon p-5 text-cream">
            <div className="font-sans text-[12px] font-semibold uppercase tracking-label text-cream/70">Invite a friend</div>
            <div className="mt-1 font-display text-[26px] font-semibold tracking-[0.12em]">{wallet.referral}</div>
            <p className="mt-1.5 font-sans text-[12px] text-cream/80">Share your code — you both get bonus points on their first order.</p>
            <button onClick={() => void shareReferral()} className="mt-3 rounded-[12px] bg-cream px-4 py-2.5 font-sans text-[13px] font-semibold text-maroon active:scale-95">
              {copied ? "Copied ✓" : "Share code"}
            </button>
          </div>
        )}

        {/* recent orders */}
        {signedIn && wallet && wallet.orders.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="font-sans text-[12px] font-semibold uppercase tracking-label text-muted-2">Recent orders</div>
              <Link href="/orders" className="font-sans text-[12px] font-semibold text-maroon">All orders →</Link>
            </div>
            <div className="space-y-2">
              {wallet.orders.slice(0, 3).map(o => {
                const st = String(o.status || "").toLowerCase();
                const active = ACTIVE.has(st);
                return (
                  <Link key={o.id} href={`/order/${o.id}`} className="flex items-center gap-3 rounded-[14px] border border-hairline bg-card px-4 py-3 shadow-card active:scale-[.99]">
                    <div className="flex-1 min-w-0">
                      <div className="font-sans text-[14px] font-semibold text-espresso">Order #{shortNo(o)}</div>
                      <div className="font-sans text-[12px] text-muted">{STATUS_LABEL[st] || st || "—"} · {rm(Number(o.total || 0))}</div>
                    </div>
                    {active && <span className="rounded-[10px] bg-maroon px-3 py-1.5 font-sans text-[12px] font-semibold text-cream">Track</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* account */}
        {signedIn && (
          <div className="flex items-center gap-3 rounded-[16px] border border-hairline bg-card p-4 shadow-card">
            <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-cream-2 text-[18px]">👤</div>
            <div className="flex-1 min-w-0">
              <div className="truncate font-sans text-[14px] font-semibold text-espresso">{member?.name || contact.name || "Loka member"}</div>
              <div className="font-sans text-[12px] text-muted">+60 {localPhone(phone)}</div>
            </div>
            <button onClick={signOut} className="rounded-[12px] border border-hairline px-3.5 py-2 font-sans text-[12px] font-semibold text-muted active:bg-cream-2">Sign out</button>
          </div>
        )}

        {loading && <p className="px-1 font-sans text-[13px] text-muted">Loading…</p>}
      </div>
    </div>
  );
}
