"use client";

import { useState } from "react";
import type { Announcement, AnnouncementPriority } from "@/lib/tournament/types";
import { Badge, ConfirmSheet, api, btnPrimary, cardCls, inputCls, labelCls } from "../ui";
import type { TabProps } from "./page";

export function AnnouncementsTab({ bundle, reload }: TabProps) {
  const t = bundle.tournament;
  const [f, setF] = useState({ title: "", message: "", priority: "normal" as AnnouncementPriority });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);

  async function post() {
    if (!f.title.trim()) { setErr("Tajuk diperlukan"); return; }
    setBusy(true); setErr(null);
    const r = await api(`/api/admin/tournaments/${t.id}/announcements`, "POST", f);
    setBusy(false);
    if (!r.ok) { setErr(r.data.error || "Gagal"); return; }
    setF({ title: "", message: "", priority: "normal" });
    await reload();
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    await api(`/api/admin/tournaments/${t.id}/announcements/${deleting.id}`, "DELETE");
    setBusy(false); setDeleting(null);
    await reload();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <div className={`${cardCls} h-fit space-y-3`}>
        <div className="font-bold text-gray-900">Pengumuman baru</div>
        <label className={labelCls}>Tajuk
          <input className={`${inputCls} mt-1`} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Match #5 lewat 15 minit" />
        </label>
        <label className={labelCls}>Mesej
          <textarea rows={12} maxLength={10000} className={`${inputCls} mt-1 font-mono text-[12px]`} value={f.message} onChange={e => setF({ ...f, message: e.target.value })} />
          <span className="mt-1 block text-right text-[11px] font-normal text-gray-400">{f.message.length.toLocaleString()} / 10,000</span>
        </label>
        <div>
          <span className={labelCls}>Keutamaan</span>
          <div className="mt-1 flex gap-2">
            {(["normal", "important", "urgent"] as const).map(p => (
              <button key={p} onClick={() => setF({ ...f, priority: p })} className={`flex-1 rounded-xl border px-2 py-1.5 text-xs font-semibold capitalize ${f.priority === p ? "border-[#7F1D1D] bg-[#7F1D1D]/10 text-[#7F1D1D]" : "border-gray-200 text-gray-500"}`}>
                {p}
              </button>
            ))}
          </div>
        </div>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <button onClick={() => void post()} disabled={busy} className={`${btnPrimary} w-full`}>{busy ? "…" : "Publish — terus ke telefon peserta"}</button>
      </div>

      <div className="space-y-2">
        {bundle.announcements.length === 0 ? (
          <div className={`${cardCls} py-10 text-center`}>
            <div className="text-4xl">📣</div>
            <p className="mt-2 text-sm text-gray-400">Belum ada pengumuman.</p>
          </div>
        ) : (
          bundle.announcements.map(a => (
            <div key={a.id} className={`${cardCls} flex items-start justify-between gap-3`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{a.title}</span>
                  {a.priority !== "normal" && <Badge tone={a.priority === "urgent" ? "red" : "amber"}>{a.priority}</Badge>}
                </div>
                {a.message && <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{a.message}</p>}
                <p className="mt-1 text-xs text-gray-400">{new Date(a.created_at).toLocaleString("ms-MY", { timeZone: "Asia/Kuala_Lumpur" })}</p>
              </div>
              <button onClick={() => setDeleting(a)} className="shrink-0 text-xs font-semibold text-red-500">Padam</button>
            </div>
          ))
        )}
      </div>
      <ConfirmSheet open={!!deleting} title="Padam pengumuman?" message={deleting?.title} busy={busy} onConfirm={() => void remove()} onClose={() => setDeleting(null)} />
    </div>
  );
}
