import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentSessionUser } from "@/lib/auth";
import { resolveCustomerForAuthUser } from "@/lib/customer-auth";
import { getPhoneOtpSession } from "@/lib/phone-otp";
import { canonicalPhone, phoneVariants } from "@/lib/phone";
import type { AdminTeam, Announcement, Match, Player, PublicBundle, PublicPlayer, Team, Tournament } from "./types";

// ============================================================================
// Server-side tournament loaders. Everything participant-facing goes through
// here so personal data (phones, game ids, receipts) is stripped in one place.
// ============================================================================

export const TEAM_PUBLIC_COLS =
  "id,tournament_id,name,short_name,logo_url,team_number,group_name,seed,manual_position,registration_status";

export const MATCH_COLS =
  "id,tournament_id,match_number,stage,round_index,round_name,bracket_slot,group_name,team_a_id,team_b_id,team_a_score,team_b_score,best_of,winner_team_id,scheduled_at,station,lobby_info,status,next_match_id,next_slot,admin_notes,updated_at";

export function isMissingTournamentSchema(message: string | null | undefined) {
  const m = String(message || "").toLowerCase();
  return m.includes("tournament") && (m.includes("does not exist") || m.includes("schema cache") || m.includes("could not find"));
}

export async function getTournamentBySlug(slug: string, opts?: { includeUnpublished?: boolean }) {
  const supabase = createSupabaseAdminClient();
  let q = supabase.from("tournaments").select("*").eq("slug", slug);
  if (!opts?.includeUnpublished) q = q.eq("published", true);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Tournament | null) ?? null;
}

export async function getTournamentById(id: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("tournaments").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Tournament | null) ?? null;
}

/** Participant view: approved teams only, IGN/role only for players. */
export async function loadPublicBundle(tournament: Tournament): Promise<PublicBundle> {
  const supabase = createSupabaseAdminClient();
  const [teamsRes, matchesRes, annRes, takenRes] = await Promise.all([
    supabase
      .from("tournament_teams")
      .select(TEAM_PUBLIC_COLS)
      .eq("tournament_id", tournament.id)
      .eq("registration_status", "approved")
      .order("team_number", { ascending: true, nullsFirst: false })
      .order("name"),
    supabase
      .from("tournament_matches")
      .select(MATCH_COLS)
      .eq("tournament_id", tournament.id)
      .order("match_number"),
    supabase
      .from("tournament_announcements")
      .select("*")
      .eq("tournament_id", tournament.id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("tournament_teams")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", tournament.id)
      .in("registration_status", ["pending_payment", "payment_submitted", "approved"]),
  ]);
  const teams = (teamsRes.data || []) as Team[];
  const teamIds = teams.map(t => t.id);
  let players: PublicPlayer[] = [];
  if (teamIds.length) {
    const { data } = await supabase
      .from("tournament_players")
      .select("id,team_id,ign,player_role,is_captain")
      .in("team_id", teamIds)
      .eq("status", "active")
      .order("is_captain", { ascending: false });
    players = (data || []) as PublicPlayer[];
  }
  let perk: PublicBundle["perk"] = null;
  const pp = tournament.voucher_config?.player_perk;
  if (pp?.enabled && pp.percent > 0 && pp.category_ids?.length) {
    const { data: cats } = await supabase.from("categories").select("id,name").in("id", pp.category_ids);
    perk = { percent: pp.percent, category_names: (cats || []).map(c => String(c.name)) };
  }
  // Admin notes are internal.
  const matches = ((matchesRes.data || []) as Match[]).map(m => ({ ...m, admin_notes: undefined }));
  return {
    tournament,
    registration: { taken: takenRes.count ?? teams.length, max: tournament.max_teams },
    perk,
    teams,
    players,
    matches,
    announcements: (annRes.data || []) as Announcement[],
  };
}

/** Full admin view: every team in any state, with players and payment info. */
export async function loadAdminBundle(tournamentId: string) {
  const supabase = createSupabaseAdminClient();
  const tournament = await getTournamentById(tournamentId);
  if (!tournament) return null;
  const [teamsRes, playersRes, matchesRes, annRes] = await Promise.all([
    supabase.from("tournament_teams").select("*").eq("tournament_id", tournamentId).order("created_at"),
    supabase.from("tournament_players").select("*").eq("tournament_id", tournamentId).order("is_captain", { ascending: false }).order("created_at"),
    supabase.from("tournament_matches").select(MATCH_COLS).eq("tournament_id", tournamentId).order("match_number"),
    supabase.from("tournament_announcements").select("*").eq("tournament_id", tournamentId).order("created_at", { ascending: false }),
  ]);
  // Player-perk uses at the till (table from migration 20260930_tournament_perk_uses).
  const { data: uses } = await supabase
    .from("tournament_perk_uses")
    .select("team_id,discount_amount")
    .eq("tournament_id", tournamentId)
    .limit(5000);
  const perkUses = {
    count: (uses || []).length,
    total: Math.round((uses || []).reduce((s, u) => s + Number(u.discount_amount || 0), 0) * 100) / 100,
  };
  const players = (playersRes.data || []) as Player[];
  const teams = ((teamsRes.data || []) as Omit<AdminTeam, "players">[]).map(t => ({
    ...t,
    players: players.filter(p => p.team_id === t.id),
  })) as AdminTeam[];
  return {
    tournament,
    teams,
    matches: (matchesRes.data || []) as Match[],
    announcements: (annRes.data || []) as Announcement[],
    perkUses,
  };
}

/**
 * The signed-in customer (Google/email session, or a verified phone OTP
 * cookie). Returns their canonical phone and customers row id when one exists.
 */
export async function getCustomerSession(req: Request): Promise<{ phone: string; customerId: string | null; name: string | null } | null> {
  let phone: string | null = null;
  let name: string | null = null;
  let customerId: string | null = null;
  try {
    const user = await getCurrentSessionUser();
    if (user) {
      const customer = await resolveCustomerForAuthUser(user, { allowCreate: false });
      if (customer?.phone) {
        phone = canonicalPhone(customer.phone);
        name = customer.name || null;
        customerId = customer.id;
      }
    }
  } catch {
    // fall through to the OTP cookie
  }
  if (!phone) phone = getPhoneOtpSession(req);
  if (!phone) return null;

  if (!customerId) {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("customers")
      .select("id,name")
      .in("phone", phoneVariants(phone))
      .order("total_orders", { ascending: false })
      .limit(1)
      .maybeSingle();
    customerId = data?.id ?? null;
    name = name || (data?.name ? String(data.name) : null);
  }
  return { phone, customerId, name };
}

/**
 * Find the customer for a phone, creating a bare row if there is none — the
 * same shape /api/public/otp/verify creates, filled in on their first order.
 */
export async function findOrCreateCustomerByPhone(phoneRaw: string, name: string): Promise<string | null> {
  const phone = canonicalPhone(phoneRaw);
  if (!phone) return null;
  const supabase = createSupabaseAdminClient();
  const { data: found } = await supabase
    .from("customers")
    .select("id,phone,name")
    .in("phone", phoneVariants(phone))
    .order("total_orders", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (found?.id) {
    const patch: Record<string, unknown> = {};
    if (found.phone !== phone) patch.phone = phone;
    if (!String(found.name || "").trim() && name.trim()) patch.name = name.trim();
    if (Object.keys(patch).length) await supabase.from("customers").update(patch).eq("id", found.id);
    return String(found.id);
  }
  const { data: created, error } = await supabase
    .from("customers")
    .insert([{ name: name.trim(), phone, consent_whatsapp: true, consent_source: "tournament", total_orders: 0, total_spend: 0 }])
    .select("id")
    .maybeSingle();
  if (error) {
    // Raced with another insert for the same phone — read it back.
    const { data: again } = await supabase.from("customers").select("id").in("phone", phoneVariants(phone)).limit(1).maybeSingle();
    return again?.id ? String(again.id) : null;
  }
  return created?.id ? String(created.id) : null;
}

// ── Malaysia-time day boundaries ─────────────────────────────────────────────
const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 00:00 Malaysia time on the day `iso` falls on (in Malaysia). */
export function startOfDayMYT(iso: string) {
  const local = new Date(new Date(iso).getTime() + MYT_OFFSET_MS);
  const day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(day - MYT_OFFSET_MS);
}

/** 23:59:59 Malaysia time on the day `iso` falls on. */
export function endOfDayMYT(iso: string) {
  return new Date(startOfDayMYT(iso).getTime() + 24 * 60 * 60 * 1000 - 1000);
}

export function formatDateMYT(iso: string) {
  return new Date(iso).toLocaleDateString("ms-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "long", year: "numeric" });
}
