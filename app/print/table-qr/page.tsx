"use client";

// Printable QR sheet: one card per dine-in table (→ /t/<table>) plus one
// Take Away card (→ /t/takeaway). Print, cut, laminate, stick on tables.

import { useEffect, useMemo, useState } from "react";

const STORE_NAME = "Loka Coffee";

function qrSrc(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=4&data=${encodeURIComponent(data)}`;
}

export default function TableQrPrintPage() {
  const [tables, setTables] = useState<string[] | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/public/store-status", { cache: "no-store" })
      .then(r => r.json())
      .then(d => setTables(Array.isArray(d?.dine_in_tables) ? d.dine_in_tables.map((t: unknown) => String(t)) : []))
      .catch(() => setTables([]));
  }, []);

  type Card = { key: string; title: string; big: string; subtitle: string; url: string; tone: "table" | "takeaway" };
  const cards = useMemo<Card[]>(() => {
    if (!origin || !tables) return [];
    const list: Card[] = tables.map(t => ({
      key: `t-${t}`,
      title: `Meja ${t}`,
      big: t,
      subtitle: "Scan untuk order dari meja anda",
      url: `${origin}/t/${encodeURIComponent(t)}`,
      tone: "table" as const,
    }));
    list.push({
      key: "takeaway",
      title: "Take Away",
      big: "🥡",
      subtitle: "Scan untuk order & ambil di kaunter",
      url: `${origin}/t/takeaway`,
      tone: "takeaway" as const,
    });
    return list;
  }, [origin, tables]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          .qr-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10mm !important; }
          .qr-card { break-inside: avoid; page-break-inside: avoid; box-shadow: none !important; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>

      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">QR Meja — {STORE_NAME}</h1>
          <p className="text-sm text-gray-500">
            {tables === null ? "Memuatkan senarai meja…" : `${tables.length} meja + 1 kad Take Away · setiap QR buka ${origin || "…"}/t/…`}
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/dashboard/settings" className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">← Settings</a>
          <button onClick={() => window.print()} className="rounded-xl bg-[#7F1D1D] px-5 py-2 text-sm font-bold text-white hover:bg-[#6B1818]">🖨 Cetak</button>
        </div>
      </div>

      {tables !== null && tables.length === 0 && (
        <p className="no-print mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tiada meja ditetapkan. Tambah nombor meja di Settings → Meja &amp; QR Order, kemudian cetak semula. Kad Take Away tetap boleh dicetak.
        </p>
      )}

      <div className="qr-grid grid grid-cols-2 gap-6 sm:grid-cols-3">
        {cards.map(card => (
          <div key={card.key} className="qr-card flex flex-col items-center rounded-3xl border-2 border-gray-900 bg-white p-6 text-center shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[.2em] text-gray-500">{STORE_NAME}</div>
            <div className={`mt-2 text-4xl font-black leading-none ${card.tone === "table" ? "text-[#7F1D1D]" : "text-gray-900"}`}>
              {card.tone === "table" ? `Meja ${card.big}` : "Take Away"}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc(card.url)} alt={`QR ${card.title}`} width={220} height={220} className="mt-4 h-[220px] w-[220px]" />
            <div className="mt-3 text-sm font-semibold text-gray-900">Scan · Order · Bayar di kaunter</div>
            <div className="mt-1 text-xs text-gray-500">{card.subtitle}</div>
            <div className="mt-3 break-all font-mono text-[10px] text-gray-400">{card.url.replace(/^https?:\/\//, "")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
