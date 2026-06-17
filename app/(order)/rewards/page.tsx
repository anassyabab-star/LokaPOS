"use client";

// Loyalty / Rewards (design README §8). Reads the real loyalty balance, redeem
// tiers and recent activity for the guest's phone via the existing public APIs
// (/api/public/orders/track + /api/public/store-status). Redeeming is OTP-gated
// (handled by the sign-in step); here we surface the prompt when required.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOrder, rm } from "../order-provider";

type Tier = { points: number; amount: number; label: string };
type Activity = { id: string; receipt_number: string | null; status: string | null; total: number | null; created_at: string };

const THRESHOLD = 300;

export default function RewardsPage() {
  const router = useRouter();
  const { contact } = useOrder();
  const phone = contact.phone;
  const [points, setPoints] = useState<number | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [orders, setOrders] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const tasks: Promise<unknown>[] = [
      fetch("/api/public/store-status").then(r => r.json()).then(d => {
        if (live) setTiers((d?.loyalty_config?.voucherTiers || []) as Tier[]);
      }).catch(() => {}),
    ];
    if (phone) {
      tasks.push(
        fetch(`/api/public/orders/track?phone=${encodeURIComponent(phone)}`, { cache: "no-store" })
          .then(r => r.json())
          .then(d => {
            if (!live) return;
            setPoints(typeof d.loyalty_points === "number" ? d.loyalty_points : 0);
            setOrders(d.orders || []);
          })
          .catch(() => {})
      );
    }
    Promise.all(tasks).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [phone]);

  const signedIn = phone.length > 0 && points !== null;
  const pct = Math.min(100, Math.round(((points || 0) / THRESHOLD) * 100));

  async function redeem(tier: Tier) {
    if (!phone) { router.push("/signin"); return; }
    setMsg(null);
    try {
      const res = await fetch("/api/public/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, points: tier.points }),
      });
      const d = await res.json();
      if (res.status === 401 || d?.code === "OTP_REQUIRED" || d?.code === "OTP_PHONE_MISMATCH") {
        router.push("/signin?next=/rewards");
        return;
      }
      if (!res.ok) { setMsg(d.error || "Gagal tebus"); return; }
      setMsg(`Voucher dijana: ${d.code} (${tier.label}) 🎉`);
      setPoints(p => (p == null ? p : Math.max(0, p - tier.points)));
    } catch {
      setMsg("Tiada sambungan.");
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-cream">
      <div className="safe-top flex flex-none items-center gap-3.5 px-5 pb-3.5 pt-5">
        <button onClick={() => router.back()} className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border border-hairline bg-card text-[18px] text-espresso active:scale-95" aria-label="Back">←</button>
        <h1 className="font-display text-[20px] font-semibold tracking-[-.01em] text-espresso">Loka Rewards</h1>
      </div>

      <div className="no-scrollbar flex-1 space-y-3.5 overflow-auto px-5 pb-6">
        {/* balance / promo */}
        {signedIn ? (
          <div className="rounded-[18px] bg-espresso p-5">
            <div className="font-sans text-[12px] font-semibold uppercase tracking-label text-muted-3">Your balance</div>
            <div className="mt-1 font-display text-[44px] font-semibold leading-none text-melon">{points}</div>
            <div className="mt-3 flex justify-between font-sans text-[11px] text-[#C9A88F]"><span>{Math.max(0, THRESHOLD - (points || 0))} pts to a free pour</span><span>{points} / {THRESHOLD}</span></div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-cream/15"><div className="h-full rounded-full bg-melon transition-all duration-500" style={{ width: `${pct}%` }} /></div>
          </div>
        ) : (
          <div className="rounded-[18px] bg-espresso p-5">
            <div className="font-display text-[18px] font-semibold text-cream">Start earning today</div>
            <p className="mt-1.5 font-sans text-[13px] text-[#C9A88F]">1 point per RM 1 spent. Redeem for free pours &amp; discounts.</p>
            <Link href="/signin" className="mt-4 inline-block rounded-[14px] bg-melon px-5 py-2.5 font-sans text-[14px] font-semibold text-espresso active:scale-[.98]">Sign in / Sign up</Link>
          </div>
        )}

        {msg && <div className="rounded-[12px] border border-hairline bg-card px-4 py-3 font-sans text-[13px] text-espresso shadow-card">{msg}</div>}

        {/* redeem */}
        <div>
          <div className="mb-2 px-1 font-sans text-[12px] font-semibold uppercase tracking-label text-muted-2">Redeem</div>
          <div className="space-y-2.5">
            {(tiers.length ? tiers : []).map(t => {
              const affordable = signedIn && (points || 0) >= t.points;
              return (
                <div key={t.points} className="flex items-center gap-3 rounded-[16px] border border-hairline bg-card p-4 shadow-card">
                  <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-cream-2 text-[18px]">🎁</div>
                  <div className="flex-1">
                    <div className="font-sans text-[14px] font-semibold text-espresso">{t.label} off</div>
                    <div className="font-sans text-[12px] text-muted">{t.points} pts</div>
                  </div>
                  <button
                    onClick={() => affordable && redeem(t)}
                    disabled={!affordable}
                    className={`rounded-[12px] px-4 py-2.5 font-sans text-[13px] font-semibold transition active:scale-95 ${affordable ? "bg-maroon text-cream" : "cursor-default bg-cream-2 text-muted-2"}`}
                  >
                    {affordable ? "Redeem" : signedIn ? `${points}/${t.points}` : "Redeem"}
                  </button>
                </div>
              );
            })}
            {tiers.length === 0 && <p className="px-1 font-sans text-[13px] text-muted">Tiada ganjaran tersedia.</p>}
          </div>
        </div>

        {/* recent */}
        {signedIn && orders.length > 0 && (
          <div>
            <div className="mb-2 px-1 font-sans text-[12px] font-semibold uppercase tracking-label text-muted-2">Recent</div>
            <div className="space-y-2">
              {orders.slice(0, 6).map(o => {
                const active = ["pending", "preparing", "ready"].includes((o.status || "").toLowerCase());
                return (
                  <div key={o.id} className="flex items-center gap-3 rounded-[14px] border border-hairline bg-card px-4 py-3 shadow-card">
                    <div className="flex-1 min-w-0">
                      <div className="font-sans text-[14px] font-semibold text-espresso">Order {o.receipt_number || o.id.slice(0, 6)}</div>
                      <div className="font-sans text-[12px] text-muted">{active ? "In progress" : (o.status || "done")} · {rm(Number(o.total || 0))}</div>
                    </div>
                    {active && <Link href={`/order/${o.id}`} className="rounded-[10px] bg-maroon px-3 py-1.5 font-sans text-[12px] font-semibold text-cream active:scale-95">Track</Link>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {loading && <p className="px-1 font-sans text-[13px] text-muted">Memuatkan…</p>}
      </div>
    </div>
  );
}
