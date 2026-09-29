"use client";

import { useState } from "react";
import { REG_STATUS_LABEL, ROLE_LABEL, voucherSpecLabel, type AdminTeam, type RegistrationStatus } from "@/lib/tournament/types";
import { Badge, ConfirmSheet, api, cardCls, inputCls } from "../ui";
import type { TabProps } from "./page";

const TONE: Record<RegistrationStatus, "gray" | "green" | "amber" | "red" | "blue"> = {
  pending_payment: "gray", payment_submitted: "amber", approved: "green", rejected: "red", withdrawn: "gray",
};
const ORDER: RegistrationStatus[] = ["payment_submitted", "pending_payment", "rejected", "approved", "withdrawn"];

export function RegistrationsTab({ bundle, reload }: TabProps) {
  const t = bundle.tournament;
  const [filter, setFilter] = useState<RegistrationStatus | "all">("all");
  const [approving, setApproving] = useState<AdminTeam | null>(null);
  const [rejecting, setRejecting] = useState<AdminTeam | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  const vc = t.voucher_config || {};
  const voucherText = [vc.discount?.enabled && voucherSpecLabel(vc.discount), vc.event_day?.enabled && `${voucherSpecLabel(vc.event_day)} (hari tournament)`]
    .filter(Boolean).join(" + ") || "tiada baucar (set di Settings)";

  const teams = [...bundle.teams]
    .filter(x => filter === "all" || x.registration_status === filter)
    .sort((a, b) => ORDER.indexOf(a.registration_status) - ORDER.indexOf(b.registration_status) || (a.payment_submitted_at || a.created_at).localeCompare(b.payment_submitted_at || b.created_at));

  async function review(team: AdminTeam, action: "approve" | "reject" | "reissue", why?: string) {
    setBusy(team.id);
    const r = await api<{ issued?: { players: number; vouchers: number; notified: number; skipped: string[] }; voucher_error?: string }>(
      `/api/admin/tournaments/${t.id}/teams/${team.id}/review`, "POST", { action, reason: why }
    );
    setBusy(null); setApproving(null); setRejecting(null); setReason("");
    if (!r.ok && r.status !== 207) { setMsg(m => ({ ...m, [team.id]: r.data.error || "Gagal" })); return; }
    const i = r.data.issued;
    setMsg(m => ({
      ...m,
      [team.id]: r.data.voucher_error
        ? `Diluluskan, tapi baucar gagal: ${r.data.voucher_error} — tekan "Keluarkan semula baucar".`
        : i ? `✓ ${i.vouchers} baucar untuk ${i.players} pemain · ${i.notified} WhatsApp dihantar${i.skipped.length ? ` · gagal: ${i.skipped.join(", ")}` : ""}` : "✓ Disimpan",
    }));
    await reload();
  }

  const counts = bundle.teams.reduce<Record<string, number>>((c, x) => ({ ...c, [x.registration_status]: (c[x.registration_status] || 0) + 1 }), {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["all", ...ORDER] as const).map(k => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === k ? "bg-[#7F1D1D] text-white" : "bg-gray-100 text-gray-500"}`}>
            {k === "all" ? `Semua (${bundle.teams.length})` : `${REG_STATUS_LABEL[k]} (${counts[k] || 0})`}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-400">Lulus = setiap pemain dapat: {voucherText}.</p>

      {teams.length === 0 ? (
        <div className={`${cardCls} py-10 text-center`}>
          <div className="text-4xl">🧾</div>
          <p className="mt-2 text-sm text-gray-400">Tiada pendaftaran{filter !== "all" ? " dalam status ini" : ""}.</p>
        </div>
      ) : (
        teams.map(team => (
          <div key={team.id} className={cardCls}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-gray-900">{team.name}</span>
                  {team.short_name && <span className="text-xs text-gray-400">[{team.short_name}]</span>}
                  <Badge tone={TONE[team.registration_status]}>{REG_STATUS_LABEL[team.registration_status]}</Badge>
                  {team.vouchers_issued_at && <Badge tone="maroon">Baucar dikeluarkan</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-gray-400">
                  Kapten {team.contact_phone || "—"} · daftar {new Date(team.created_at).toLocaleString("ms-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  {team.payment_ref ? ` · Ref: ${team.payment_ref}` : ""}
                </p>
                {team.reject_reason && team.registration_status === "rejected" && <p className="mt-1 text-xs text-red-500">Sebab: {team.reject_reason}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {team.payment_proof_path && (
                  <a href={`/api/admin/tournaments/${t.id}/teams/${team.id}/proof`} target="_blank" rel="noreferrer" className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600">
                    🧾 Lihat resit
                  </a>
                )}
                {team.registration_status !== "approved" && (
                  <button disabled={busy === team.id} onClick={() => setApproving(team)} className="rounded-xl bg-green-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">✓ Luluskan</button>
                )}
                {!["rejected", "approved"].includes(team.registration_status) && (
                  <button disabled={busy === team.id} onClick={() => setRejecting(team)} className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600">Tolak</button>
                )}
                {team.registration_status === "approved" && (
                  <button disabled={busy === team.id} onClick={() => void review(team, "reissue")} className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 disabled:opacity-50">
                    {busy === team.id ? "…" : "Keluarkan semula baucar"}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400">
                    <th className="py-1 pr-2 font-semibold">IGN</th><th className="py-1 pr-2 font-semibold">Nama</th>
                    <th className="py-1 pr-2 font-semibold">MLBB ID</th><th className="py-1 pr-2 font-semibold">Telefon</th><th className="py-1 font-semibold">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {team.players.map(p => (
                    <tr key={p.id} className="border-t border-gray-100">
                      <td className="py-1.5 pr-2 font-semibold text-gray-900">{p.ign}{p.is_captain ? " 👑" : ""}</td>
                      <td className="py-1.5 pr-2 text-gray-600">{p.full_name}</td>
                      <td className="py-1.5 pr-2 font-mono text-gray-600">{p.mlbb_user_id} ({p.server_id})</td>
                      <td className="py-1.5 pr-2 font-mono text-gray-600">{p.phone}{p.customer_id ? " ✓" : ""}</td>
                      <td className="py-1.5 text-gray-500">{ROLE_LABEL[p.player_role]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {msg[team.id] && <p className="mt-2 text-xs font-semibold text-gray-600">{msg[team.id]}</p>}
          </div>
        ))
      )}

      <ConfirmSheet
        open={!!approving}
        title={`Luluskan ${approving?.name}?`}
        message={`${approving?.players.length || 0} pemain akan dapat ${voucherText}, dan WhatsApp makluman. ${Number(t.entry_fee) > 0 && !approving?.payment_proof_path ? "⚠️ Team ini belum upload resit." : ""}`}
        confirmLabel="Luluskan & keluarkan baucar"
        danger={false}
        busy={busy === approving?.id}
        onConfirm={() => approving && void review(approving, "approve")}
        onClose={() => setApproving(null)}
      />
      <ConfirmSheet
        open={!!rejecting}
        title={`Tolak ${rejecting?.name}?`}
        confirmLabel="Tolak"
        busy={busy === rejecting?.id}
        onConfirm={() => rejecting && void review(rejecting, "reject", reason)}
        onClose={() => { setRejecting(null); setReason(""); }}
      >
        <p className="mb-2 text-sm text-gray-600">Kapten akan nampak sebab ini dan boleh upload resit semula.</p>
        <textarea rows={3} className={inputCls} value={reason} onChange={e => setReason(e.target.value)} placeholder="Cth: Jumlah transfer tak cukup / resit tak jelas" />
      </ConfirmSheet>
    </div>
  );
}
