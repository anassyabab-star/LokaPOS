"use client";

// Review step (Smart Loyalty Fasa 3). Customer rates the order; submitting marks
// the journey 'reviewed' and (if configured) unlocks a reward voucher.

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useOrder } from "../../../order-provider";

export default function ReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const { lastOrder } = useOrder();
  const knownPhone = lastOrder && lastOrder.orderId === id ? lastOrder.phone : "";

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [phone, setPhone] = useState(knownPhone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ voucher: { code: string; reward_label: string | null } | null } | null>(null);

  async function submit() {
    if (rating < 1) { setError("Sila pilih rating bintang."); return; }
    const canonical = String(phone || "").replace(/[^\d+]/g, "");
    if (canonical.replace(/[^\d]/g, "").length < 8) { setError("No telefon tidak sah."); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/public/orders/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: id, phone: canonical, rating, comment: comment.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || "Gagal hantar review"); return; }
      setDone({ voucher: data.voucher || null });
    } catch {
      setError("Ralat rangkaian.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-espresso px-6 text-center">
        <div className="flex h-16 w-16 animate-pop items-center justify-center rounded-full bg-leaf text-[30px] text-cream">✓</div>
        <h1 className="mt-4 font-display text-[22px] font-semibold text-cream">Terima kasih!</h1>
        <p className="mt-1.5 font-sans text-[13px] text-[#C9A88F]">Review anda telah direkodkan.</p>
        {done.voucher && (
          <div className="mt-5 rounded-[16px] border border-melon/30 bg-melon/10 px-5 py-4">
            <div className="font-sans text-[12px] font-semibold uppercase tracking-label text-melon">Voucher dibuka</div>
            <div className="mt-1 font-display text-[20px] font-semibold text-cream">{done.voucher.code}</div>
            {done.voucher.reward_label && <div className="font-sans text-[13px] text-melon-soft">{done.voucher.reward_label}</div>}
          </div>
        )}
        <Link href="/menu" className="mt-6 rounded-[14px] bg-maroon px-6 py-3 font-sans text-[14px] font-semibold text-cream">Kembali ke menu</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-cream">
      <div className="safe-top flex flex-none items-center gap-3.5 px-5 pb-3.5 pt-5">
        <button onClick={() => router.push(`/order/${id}`)} className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border border-hairline bg-card text-[18px] text-espresso active:scale-95" aria-label="Back">←</button>
        <h1 className="font-display text-[20px] font-semibold tracking-[-.01em] text-espresso">Beri review</h1>
      </div>

      <div className="flex-1 space-y-3.5 px-5 pb-5">
        <div className="rounded-[18px] border border-hairline bg-card p-5 shadow-card text-center">
          <div className="font-sans text-[13px] text-muted">Bagaimana pesanan anda?</div>
          <div className="mt-3 flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setRating(n)} className="text-[34px] leading-none active:scale-90" aria-label={`${n} bintang`}>
                <span className={n <= rating ? "opacity-100" : "opacity-25"}>⭐</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[18px] border border-hairline bg-card p-4 shadow-card">
          <div className="mb-2 font-sans text-[12px] font-semibold uppercase tracking-label text-muted-2">Komen (pilihan)</div>
          <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} placeholder="Kongsi pengalaman anda…" className="w-full resize-none rounded-[12px] border border-hairline bg-cream/40 px-3.5 py-3 font-sans text-[14px] text-espresso outline-none placeholder:text-muted-2 focus:border-maroon" />
        </div>

        {!knownPhone && (
          <div className="rounded-[18px] border border-hairline bg-card p-4 shadow-card">
            <div className="mb-2 font-sans text-[12px] font-semibold uppercase tracking-label text-muted-2">No telefon order</div>
            <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="numeric" placeholder="0123456789" className="w-full rounded-[12px] border border-hairline bg-cream/40 px-3.5 py-3 font-sans text-[14px] text-espresso outline-none placeholder:text-muted-2 focus:border-maroon" />
          </div>
        )}
      </div>

      <div className="safe-bottom flex-none px-5 pb-5 pt-3">
        {error && <p className="mb-2 text-center font-sans text-[12px] text-melon">{error}</p>}
        <button onClick={() => void submit()} disabled={busy} className="w-full rounded-[16px] bg-maroon py-[15px] text-center font-sans text-[15px] font-semibold text-cream active:scale-[.99] disabled:opacity-60">
          {busy ? "Menghantar…" : "Hantar review"}
        </button>
      </div>
    </div>
  );
}
