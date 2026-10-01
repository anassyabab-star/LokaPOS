import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { issueRewardVoucher } from "@/lib/rewards-vouchers";
import { sendTransactional } from "@/lib/whatsapp";
import { endOfDayMYT, findOrCreateCustomerByPhone, formatDateMYT, startOfDayMYT } from "./server";
import { voucherSpecLabel, type Player, type Tournament, type VoucherSpec } from "./types";

// ============================================================================
// Vouchers for an approved team — one set for every player with a phone
// number. The registration form only asks the captain for one; an admin can
// add a teammate's phone to give them a set too.
//
//   discount  — valid from approval for `validity_days`
//   event_day — valid only on the tournament day(s), Malaysia time
//
// Idempotent: keys are tournament:{tid}:{playerId}:{customerId}:{kind}, so approving twice
// (or a retry after a timeout) issues nothing new. The WhatsApp note goes out
// only the first time (vouchers_issued_at is still null).
// ============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

function specIsOn(spec: VoucherSpec | undefined): spec is VoucherSpec {
  return !!spec && spec.enabled && Number(spec.value) > 0;
}

function voucherFields(spec: VoucherSpec) {
  return spec.type === "percent"
    ? {
        rewardType: "percent" as const,
        discountPercent: Number(spec.value),
        maxDiscount: spec.max_discount ? Number(spec.max_discount) : null,
      }
    : { rewardType: "amount" as const, rewardAmount: Number(spec.value) };
}

export type IssueResult = { players: number; vouchers: number; notified: number; skipped: string[] };

export async function issueTournamentVouchers(teamId: string): Promise<IssueResult> {
  const supabase = createSupabaseAdminClient();
  const { data: team, error: teamErr } = await supabase
    .from("tournament_teams")
    .select("id,name,tournament_id,registration_status,vouchers_issued_at")
    .eq("id", teamId)
    .maybeSingle();
  if (teamErr || !team) throw new Error(teamErr?.message || "Team not found");
  if (team.registration_status !== "approved") throw new Error("Team is not approved");

  const { data: tRow } = await supabase.from("tournaments").select("*").eq("id", team.tournament_id).maybeSingle();
  const tournament = tRow as Tournament | null;
  if (!tournament) throw new Error("Tournament not found");

  const { data: playerRows } = await supabase
    .from("tournament_players")
    .select("*")
    .eq("team_id", teamId)
    .eq("status", "active");
  const players = (playerRows || []) as Player[];

  const cfg = tournament.voucher_config || {};
  const discount = specIsOn(cfg.discount) ? cfg.discount : null;
  const eventDay = specIsOn(cfg.event_day) && tournament.start_at ? cfg.event_day : null;
  const firstTime = !team.vouchers_issued_at;

  const withPhone = players.filter(p => p.phone);
  const result: IssueResult = { players: withPhone.length, vouchers: 0, notified: 0, skipped: [] };

  for (const p of withPhone) {
    const customerId = p.customer_id || (await findOrCreateCustomerByPhone(p.phone!, p.full_name || p.ign));
    if (!customerId) { result.skipped.push(p.ign); continue; }
    if (!p.customer_id) {
      await supabase.from("tournament_players").update({ customer_id: customerId }).eq("id", p.id);
    }

    const lines: string[] = [];
    if (discount) {
      const days = Math.max(1, Number(discount.validity_days || 30));
      const v = await issueRewardVoucher({
        customerId,
        source: "tournament",
        sourceRef: tournament.slug,
        ...voucherFields(discount),
        rewardLabel: `${tournament.name}: ${voucherSpecLabel(discount)}`,
        minSpend: Number(discount.min_spend || 0),
        issueEventKey: `tournament:${tournament.id}:${p.id}:${customerId}:discount`,
        expiresAt: new Date(Date.now() + days * DAY_MS).toISOString(),
      });
      if (v) { result.vouchers++; lines.push(`• ${voucherSpecLabel(discount)} (sah ${days} hari)`); }
    }
    if (eventDay && tournament.start_at) {
      const v = await issueRewardVoucher({
        customerId,
        source: "tournament",
        sourceRef: tournament.slug,
        ...voucherFields(eventDay),
        rewardLabel: `Hari ${tournament.name}: ${voucherSpecLabel(eventDay)}`,
        minSpend: Number(eventDay.min_spend || 0),
        issueEventKey: `tournament:${tournament.id}:${p.id}:${customerId}:eventday`,
        validFrom: startOfDayMYT(tournament.start_at).toISOString(),
        expiresAt: endOfDayMYT(tournament.end_at || tournament.start_at).toISOString(),
      });
      if (v) { result.vouchers++; lines.push(`• ${voucherSpecLabel(eventDay)} — hanya pada ${formatDateMYT(tournament.start_at)}`); }
    }

    if (firstTime) {
      const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://pos.lokacafe.my").replace(/\/$/, "");
      const message =
        `🎮 ${tournament.name}\n\n` +
        `Hai ${p.ign}! Pendaftaran team *${team.name}* telah diluluskan. Jumpa di ${tournament.venue || "Loka"}!\n` +
        (lines.length ? `\nBaucar Loka untuk anda:\n${lines.join("\n")}\n\nLihat di ${site}/rewards (log masuk dengan nombor ini).\n` : "") +
        `\nJadual & keputusan: ${site}/tournament/${tournament.slug}`;
      // Meta only lets a business start a conversation with an approved
      // template; free text to someone who hasn't messaged Loka in 24h is
      // accepted by the API and then silently not delivered. So: template on
      // Cloud (name from WHATSAPP_TEMPLATE_TEAM_APPROVED, body params
      // {{1}} player · {{2}} team · {{3}} tournament · {{4}} voucher), with
      // the full text as the Murpati fallback.
      try {
        const sent = await sendTransactional({
          to: p.phone!,
          template: {
            name: process.env.WHATSAPP_TEMPLATE_TEAM_APPROVED || "loka_team_approved",
            bodyParams: [
              p.full_name || p.ign,
              team.name,
              tournament.name,
              lines.length ? lines.map(l => l.replace(/^• /, "")).join(" + ") : "-",
            ],
          },
          text: message,
        });
        console.log(`[tournament] approval WhatsApp for team ${team.id}: ${sent.ok ? "sent" : "failed"} via ${sent.provider}${sent.error ? ` — ${sent.error}` : ""}`);
        if (sent.ok) result.notified++;
      } catch (err) {
        // Best-effort; the vouchers are already in their wallet.
        console.warn(`[tournament] approval WhatsApp for team ${team.id} threw:`, err);
      }
    }
  }

  await supabase
    .from("tournament_teams")
    .update({ vouchers_issued_at: team.vouchers_issued_at || new Date().toISOString() })
    .eq("id", teamId);

  return result;
}
