"use client";

// Order tracker — the customer's single screen after checkout.
//
//   Bayar di kaunter → Dalam barisan → Sedang dibuat → Sedia (Meja / Buzzer) → Selesai
//
// Driven by `orders.status` (what the cashier + Kitchen Display move), with the
// journey columns (`fulfillment_stage`) for pickup confirmation + review.
// Shows the short Order ID + a QR the cashier can scan, and vibrates/chimes
// when the kitchen marks the order ready.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useOrder, rm, normalizeMyPhone, localPhone } from "../../order-provider";
import { readyAlert } from "@/lib/client-beep";

type Track = {
  id: string;
  receipt_number: string | null;
  short_number?: string;
  customer_name?: string | null;
  status: string | null;
  payment_status: string | null;
  payment_method?: string | null;
  total: number | null;
  created_at: string;
  fulfillment_stage?: string | null;
  order_type?: string | null;
  table_number?: string | null;
  buzzer_number?: string | null;
  ready_at?: string | null;
  paid_at?: string | null;
  completed_at?: string | null;
};

const STEPS = [
  { key: "pay", label: "Bayar" },
  { key: "queue", label: "Barisan" },
  { key: "making", label: "Dibuat" },
  { key: "ready", label: "Sedia" },
  { key: "done", label: "Selesai" },
];

function stepIndex(status: string): number {
  switch (status) {
    case "awaiting_payment": return 0;
    case "pending": return 1;
    case "preparing": return 2;
    case "ready": return 3;
    case "completed": return 4;
    default: return -1;
  }
}

function shortFrom(receipt: string | null | undefined, id: string) {
  const m = String(receipt || "").match(/-(\d+)$/);
  if (m) return m[1].padStart(3, "0");
  return (receipt || id).replace(/[^0-9a-z]/gi, "").slice(-3).toUpperCase() || "---";
}

export default function OrderPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = params.id;
  const paymentFailed = search.get("payment") === "failed";
  const { lastOrder, contact, setContact } = useOrder();
  const order = lastOrder && lastOrder.orderId === id ? lastOrder : null;

  // Phone proves ownership to /track. From the snapshot, else the saved
  // contact, else ask (order opened on another device / storage cleared).
  const [phone, setPhone] = useState<string>(order?.phone || contact.phone || "");
  const [phoneInput, setPhoneInput] = useState<string>(localPhone(contact.phone || ""));
  const [track, setTrack] = useState<Track | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [pickupBusy, setPickupBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  const prevStatus = useRef<string | null>(null);

  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => { if (order?.phone && !phone) setPhone(order.phone); }, [order?.phone]);

  // Poll live status.
  useEffect(() => {
    if (!phone) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      try {
        const res = await fetch(`/api/public/orders/track?order_id=${encodeURIComponent(id)}&phone=${encodeURIComponent(phone)}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!live) return;
        if (!res.ok || !data?.order) {
          setTrackError(res.status === 404 ? "Order tidak dijumpai untuk nombor ini." : "Gagal semak status.");
          return;
        }
        const t = data.order as Track;
        setTrackError(null);
        setTrack(t);
        const st = String(t.status || "").toLowerCase();
        if (prevStatus.current && prevStatus.current !== "ready" && st === "ready") readyAlert();
        prevStatus.current = st;
      } catch {
        if (live) setTrackError("Tiada sambungan.");
      } finally {
        if (!live) return;
        const st = String(prevStatus.current || "");
        const done = st === "cancelled" || (st === "completed" && track?.fulfillment_stage === "reviewed");
        if (!done) timer = setTimeout(load, st === "completed" ? 30000 : 10000);
      }
    };

    void load();
    return () => { live = false; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, phone]);

  // Until the first /track response lands, a fresh order is always awaiting payment.
  const status = String(track?.status || (order ? "awaiting_payment" : "")).toLowerCase();
  const stage = String(track?.fulfillment_stage || "received").toLowerCase();
  const idx = stepIndex(status);
  const shortNo = track?.short_number || order?.shortNumber || shortFrom(track?.receipt_number || order?.receipt, id);
  const receipt = track?.receipt_number || order?.receipt || id.slice(0, 8);
  const orderType = track?.order_type || (order?.type === "dine" ? "dine_in" : order?.type === "takeaway" ? "take_away" : null);
  const tableNo = track?.table_number || (orderType === "dine_in" ? order?.table || null : null);
  const buzzerNo = track?.buzzer_number || null;
  const target = tableNo ? `Meja ${tableNo}` : buzzerNo ? `Buzzer ${buzzerNo}` : orderType === "take_away" ? "Take Away" : orderType === "dine_in" ? "Dine In" : "";
  const total = Number(track?.total ?? order?.total ?? 0);
  const paysAtCounter = track ? track.payment_method === "cash" : order?.payment === "counter";

  const qrSrc = useMemo(() => {
    if (!origin) return null;
    const data = `${origin}/pos?order=${id}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=6&data=${encodeURIComponent(data)}`;
  }, [origin, id]);

  async function confirmPickup() {
    if (!phone) return;
    setPickupBusy(true);
    try {
      const res = await fetch("/api/public/orders/pickup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: id, phone }),
      });
      if (res.ok) setTrack(t => (t ? { ...t, fulfillment_stage: "picked_up" } : t));
    } finally {
      setPickupBusy(false);
    }
  }

  function submitPhone() {
    const digits = phoneInput.replace(/\D/g, "");
    if (digits.length < 8) return;
    const canonical = normalizeMyPhone(phoneInput);
    setContact({ name: contact.name, phone: canonical });
    setTrack(null);
    setTrackError(null);
    prevStatus.current = null;
    setPhone(canonical);
  }

  // ── No snapshot and no phone yet: ask for the phone to look the order up.
  if (!order && !phone) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-espresso px-6 text-center">
        <div className="font-display text-[22px] font-semibold text-cream">Semak status order</div>
        <p className="mt-2 font-sans text-[13px] text-[#C9A88F]">Masukkan nombor telefon yang digunakan semasa order.</p>
        <div className="mt-5 flex w-full max-w-[320px] items-center rounded-[12px] border border-cream/20 bg-cream/5 focus-within:border-melon">
          <span className="pl-3.5 pr-2 font-sans text-[14px] text-[#C9A88F]">🇲🇾 +60</span>
          <input value={phoneInput} onChange={e => setPhoneInput(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="12 345 6789" className="w-full bg-transparent py-3 pr-3.5 font-sans text-[15px] text-cream outline-none placeholder:text-muted-3" />
        </div>
        <button onClick={submitPhone} className="mt-3 w-full max-w-[320px] rounded-[14px] bg-maroon py-3.5 font-sans text-[14px] font-semibold text-cream active:scale-[.99]">Semak</button>
        <Link href="/menu" className="mt-6 font-sans text-[13px] font-semibold text-[#C9A88F]">← Back to menu</Link>
      </div>
    );
  }

  const isAwaiting = status === "awaiting_payment";
  const isReady = status === "ready";
  const isCancelled = status === "cancelled";
  const isDone = status === "completed";
  const pickedUp = stage === "picked_up" || stage === "reviewed";
  const reviewed = stage === "reviewed";
  const canPickup = (isReady || isDone) && !pickedUp;
  const canReview = pickedUp && !reviewed;

  const hero = isCancelled
    ? { icon: "✕", tone: "bg-melon", title: "Order dibatalkan", sub: "Order ini tamat tempoh atau dibatalkan. Sila buat order semula." }
    : isAwaiting
      ? paymentFailed
        ? { icon: "🧾", tone: "bg-maroon", title: "Pembayaran online gagal", sub: "Tak mengapa — tunjuk Order ID ini di kaunter untuk bayar." }
        : paysAtCounter
          ? { icon: "🧾", tone: "bg-maroon", title: "Bayar di kaunter", sub: "Tunjuk Order ID ini kepada cashier untuk bayar." }
          : { icon: "⏳", tone: "bg-maroon", title: "Menunggu pembayaran", sub: "Selesaikan bayaran online, atau bayar di kaunter dengan Order ID ini." }
      : isReady
        ? { icon: "🔔", tone: "bg-leaf", title: "Pesanan anda dah siap!", sub: tableNo ? `Kami hantar ke ${target}.` : buzzerNo ? `${target} akan berbunyi — sila ambil di kaunter.` : "Sila ambil di kaunter." }
        : isDone
          ? { icon: "✓", tone: "bg-leaf", title: "Selesai", sub: "Selamat menjamu selera ☕" }
          : status === "preparing"
            ? { icon: "☕", tone: "bg-leaf", title: "Sedang dibuat", sub: "Barista sedang sediakan pesanan anda." }
            : { icon: "✓", tone: "bg-leaf", title: "Bayaran diterima", sub: "Pesanan anda dalam barisan dapur." };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-cream">
      {/* hero (dark) */}
      <div className="safe-top bg-espresso px-6 pb-8 pt-10 text-center">
        <div className={`mx-auto flex h-16 w-16 animate-pop items-center justify-center rounded-full ${hero.tone} text-[30px] text-cream`}>{hero.icon}</div>
        <h1 className="mt-4 font-display text-[24px] font-semibold tracking-[-.01em] text-cream">{hero.title}</h1>
        <p className="mt-1.5 font-sans text-[13px] text-[#C9A88F]">{hero.sub}</p>
      </div>

      {/* ticket */}
      <div className="-mt-4 px-5">
        <div className="rounded-[18px] border border-hairline bg-card p-5 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-sans text-[11px] font-semibold uppercase tracking-label text-muted-2">Order ID</div>
              <div className="font-display text-[44px] font-semibold leading-none text-maroon">#{shortNo}</div>
              <div className="mt-1 font-sans text-[11px] text-muted-2">{receipt}</div>
            </div>
            <div className="text-right">
              <div className="font-sans text-[11px] font-semibold uppercase tracking-label text-muted-2">{tableNo ? "Meja" : buzzerNo ? "Buzzer" : "Jenis"}</div>
              <div className="font-display text-[22px] font-semibold leading-tight text-espresso">
                {tableNo ? tableNo : buzzerNo ? buzzerNo : orderType === "take_away" ? "Take Away" : orderType === "dine_in" ? "Dine In" : "—"}
              </div>
              {(tableNo || buzzerNo) && (
                <div className="mt-0.5 font-sans text-[11px] text-muted">{orderType === "take_away" ? "Take Away" : "Dine In"}</div>
              )}
            </div>
          </div>

          {/* QR for the cashier while unpaid */}
          {isAwaiting && qrSrc && (
            <div className="mt-4 flex flex-col items-center rounded-[14px] bg-cream-2 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrSrc} alt={`QR order ${shortNo}`} width={180} height={180} className="h-[180px] w-[180px] rounded-[10px] bg-white p-2" />
              <div className="mt-2 font-sans text-[12px] font-semibold text-espresso">Cashier scan QR ini, atau sebut #{shortNo}</div>
            </div>
          )}

          {/* step bar */}
          {!isCancelled && (
            <div className="mt-5">
              <div className="flex items-center">
                {STEPS.map((s, i) => {
                  const done = i < idx;
                  const active = i === idx;
                  return (
                    <div key={s.key} className="flex flex-1 items-center last:flex-none">
                      <div className="flex flex-col items-center">
                        <div className={`flex h-7 w-7 items-center justify-center rounded-full font-sans text-[11px] font-bold ${done ? "bg-leaf text-cream" : active ? (isReady ? "animate-pulse bg-maroon text-cream" : "bg-maroon text-cream") : "bg-hairline text-muted-2"}`}>
                          {done ? "✓" : i + 1}
                        </div>
                        <div className={`mt-1 font-sans text-[10px] font-semibold ${active ? "text-maroon" : done ? "text-leaf" : "text-muted-2"}`}>{s.label}</div>
                      </div>
                      {i < STEPS.length - 1 && <div className={`mx-1 mb-4 h-[2px] flex-1 rounded ${i < idx ? "bg-leaf" : "bg-hairline"}`} />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {trackError && <p className="mt-3 text-center font-sans text-[11px] text-melon">{trackError}</p>}
        </div>
      </div>

      {/* journey actions */}
      <div className="flex-1 px-5 pt-5">
        {isCancelled ? (
          <Link href="/menu" className="block w-full rounded-[16px] bg-maroon py-3.5 text-center font-sans text-[14px] font-semibold text-cream active:scale-[.99]">
            Order semula →
          </Link>
        ) : (
          <>
            {canPickup && (
              <button onClick={() => void confirmPickup()} disabled={pickupBusy} className="w-full rounded-[16px] bg-maroon py-3.5 text-center font-sans text-[14px] font-semibold text-cream active:scale-[.99] disabled:opacity-60">
                {pickupBusy ? "…" : "Sahkan dah ambil"}
              </button>
            )}
            {canReview && (
              <Link href={`/order/${id}/review`} className="block w-full rounded-[16px] bg-maroon py-3.5 text-center font-sans text-[14px] font-semibold text-cream active:scale-[.99]">
                Beri review &amp; buka voucher →
              </Link>
            )}
            {reviewed && (
              <div className="rounded-[16px] border border-leaf/40 bg-leaf/5 py-3.5 text-center font-sans text-[13px] font-semibold text-leaf">
                ✓ Review diterima — voucher dibuka
              </div>
            )}
            {!canPickup && !canReview && !reviewed && (
              <div className="flex items-center gap-3 rounded-[18px] border border-hairline bg-card p-4 shadow-card">
                <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[13px] bg-cream-2 text-[20px]">
                  {isAwaiting ? "💳" : status === "preparing" ? "☕" : "📣"}
                </div>
                <div>
                  <div className="font-sans text-[14px] font-semibold text-espresso">
                    {isAwaiting ? "Bayaran belum diterima" : status === "preparing" ? "Sedang dibuat" : "Kami akan maklumkan bila siap"}
                  </div>
                  <div className="mt-0.5 font-sans text-[12px] text-muted">
                    {isAwaiting
                      ? "Order masuk ke dapur sebaik sahaja anda bayar di kaunter."
                      : tableNo
                        ? `Pesanan akan dihantar ke ${target}.`
                        : buzzerNo
                          ? `${target} akan berbunyi bila siap.`
                          : "Skrin ini akan berbunyi bila pesanan siap."}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* items summary (from the local snapshot) */}
        <div className="mt-3.5 rounded-[18px] border border-hairline bg-card p-4 shadow-card">
          {order?.items.map((it, i) => (
            <div key={i} className="flex justify-between gap-3 py-1 font-sans text-[13px]">
              <span className="min-w-0 text-muted"><span className="text-espresso">{it.qty}×</span> {it.name}{it.optionsText ? ` · ${it.optionsText}` : ""}</span>
              <span className="whitespace-nowrap font-display font-semibold text-espresso">{rm(it.unitPrice * it.qty)}</span>
            </div>
          ))}
          <div className={`flex justify-between ${order?.items.length ? "mt-2 border-t border-hairline pt-2" : ""}`}>
            <span className="font-sans text-[13px] text-muted">
              {isAwaiting ? (paysAtCounter ? "Bayar di kaunter" : "Belum dibayar") : track?.payment_status === "paid" ? "Dibayar" : order?.payment === "online" ? "Online" : "—"}
            </span>
            <span className="font-display text-[15px] font-semibold text-espresso">{rm(total)}</span>
          </div>
        </div>
      </div>

      {/* actions */}
      <div className="safe-bottom flex-none px-5 pb-5 pt-3">
        <div className="flex gap-2.5">
          <Link href="/rewards" className="flex-1 rounded-[14px] border border-hairline bg-card py-3.5 text-center font-sans text-[14px] font-semibold text-espresso active:scale-[.99]">My points</Link>
          <Link href="/menu" className="flex-1 rounded-[14px] bg-maroon py-3.5 text-center font-sans text-[14px] font-semibold text-cream active:scale-[.99]">Order again</Link>
        </div>
      </div>
    </div>
  );
}
