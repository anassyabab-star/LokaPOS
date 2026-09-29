// ============================================================================
// Tournament shared types + labels. Client-safe (no server imports) so the
// dashboard and the participant app read the same shapes.
// ============================================================================

export type TournamentFormat = "round_robin" | "single_elim" | "group_knockout";
export type TournamentStatus = "draft" | "registration_open" | "registration_closed" | "ongoing" | "completed";
export type RegistrationStatus = "pending_payment" | "payment_submitted" | "approved" | "rejected" | "withdrawn";
export type MatchStatus = "scheduled" | "check_in" | "ready" | "live" | "completed" | "delayed" | "cancelled";
export type PlayerRole = "exp" | "gold" | "mid" | "jungler" | "roamer" | "sub";
export type AnnouncementPriority = "normal" | "important" | "urgent";

export type VoucherSpec = {
  enabled: boolean;
  type: "amount" | "percent";
  value: number;
  max_discount?: number | null;
  min_spend?: number | null;
  /** discount voucher only: days from approval. */
  validity_days?: number | null;
};
/**
 * Every-purchase discount for every player of an approved team, on the
 * tournament day(s) only, for the listed categories (e.g. drinks). Applied by
 * the cashier from the POS; not a voucher.
 */
export type PlayerPerk = { enabled: boolean; percent: number; category_ids: string[] };

export type VoucherConfig = { discount?: VoucherSpec; event_day?: VoucherSpec; player_perk?: PlayerPerk };

/** A prize line on the landing page, e.g. { title: "Champion", value: "RM300 + trophy" }. */
export type Prize = { title: string; value: string };

export type Tournament = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  /** Poster shown on the landing page + share card. Migration 20260930_tournament_cover. */
  cover_url?: string | null;
  venue: string | null;
  format: TournamentFormat;
  status: TournamentStatus;
  published: boolean;
  start_at: string | null;
  end_at: string | null;
  registration_deadline: string | null;
  max_teams: number;
  min_players: number;
  max_players: number;
  entry_fee: number;
  payment_instructions: string | null;
  payment_qr_url: string | null;
  default_best_of: number;
  knockout_best_of: number;
  group_count: number;
  advance_per_group: number;
  points_win: number;
  points_loss: number;
  voucher_config: VoucherConfig;
  /** Arrives with migration 20260930; absent before it. */
  prizes?: Prize[];
  created_at?: string;
  updated_at?: string;
};

export type Team = {
  id: string;
  tournament_id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  team_number: number | null;
  group_name: string | null;
  seed: number | null;
  manual_position: number | null;
  registration_status: RegistrationStatus;
};

/** What participants may see about a player — no phone, no game account id. */
export type PublicPlayer = { id: string; team_id: string; ign: string; player_role: PlayerRole; is_captain: boolean };

export type Player = PublicPlayer & {
  tournament_id: string;
  customer_id: string | null;
  /** Captain only (optional for teammates since 20260930_tournament_simpler_players). */
  full_name: string | null;
  mlbb_user_id: string;
  server_id: string | null;
  /** Captain only, unless an admin adds one — a phone is what a voucher is issued to. */
  phone: string | null;
  status: "active" | "inactive";
};

export type AdminTeam = Team & {
  captain_customer_id: string | null;
  contact_phone: string | null;
  payment_proof_path: string | null;
  payment_ref: string | null;
  payment_submitted_at: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  vouchers_issued_at: string | null;
  notes: string | null;
  created_at: string;
  players: Player[];
};

export type Match = {
  id: string;
  tournament_id: string;
  match_number: number;
  stage: "group" | "knockout";
  round_index: number;
  round_name: string | null;
  bracket_slot: number | null;
  group_name: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  team_a_score: number;
  team_b_score: number;
  best_of: number;
  winner_team_id: string | null;
  scheduled_at: string | null;
  station: string | null;
  lobby_info: string | null;
  status: MatchStatus;
  next_match_id: string | null;
  next_slot: "a" | "b" | null;
  admin_notes?: string | null;
  updated_at?: string;
};

export type Announcement = {
  id: string;
  tournament_id: string;
  title: string;
  message: string;
  priority: AnnouncementPriority;
  created_at: string;
};

export type PublicBundle = {
  tournament: Tournament;
  /** Teams holding a slot (pending, receipt sent or approved) vs the cap. */
  registration: { taken: number; max: number };
  /** Tournament-day player perk, with category names resolved; null when off. */
  perk: { percent: number; category_names: string[] } | null;
  teams: Team[];
  players: PublicPlayer[];
  matches: Match[];
  announcements: Announcement[];
};

export const FORMAT_LABEL: Record<TournamentFormat, string> = {
  round_robin: "Round Robin",
  single_elim: "Single Elimination",
  group_knockout: "Group Stage + Knockout",
};

export const STATUS_LABEL: Record<TournamentStatus, string> = {
  draft: "Draft",
  registration_open: "Registration Open",
  registration_closed: "Registration Closed",
  ongoing: "Ongoing",
  completed: "Completed",
};

export const REG_STATUS_LABEL: Record<RegistrationStatus, string> = {
  pending_payment: "Belum bayar",
  payment_submitted: "Menunggu semakan",
  approved: "Diluluskan",
  rejected: "Ditolak",
  withdrawn: "Tarik diri",
};

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  scheduled: "Upcoming",
  check_in: "Check-In",
  ready: "Ready",
  live: "Live",
  completed: "Final",
  delayed: "Delayed",
  cancelled: "Cancelled",
};

export const ROLE_LABEL: Record<PlayerRole, string> = {
  exp: "EXP Lane",
  gold: "Gold Lane",
  mid: "Mid Lane",
  jungler: "Jungler",
  roamer: "Roamer",
  sub: "Substitute",
};

export const PLAYER_ROLES: PlayerRole[] = ["exp", "gold", "mid", "jungler", "roamer", "sub"];
export const MATCH_STATUSES: MatchStatus[] = ["scheduled", "check_in", "ready", "live", "completed", "delayed", "cancelled"];

/** Games needed to take a best-of-N. */
export function winsNeeded(bestOf: number) {
  return Math.floor(Math.max(1, bestOf) / 2) + 1;
}

/** "RM50" / "RM12.50" */
export function rmLabel(n: number) {
  return `RM${Number(n || 0).toFixed(2).replace(/\.00$/, "")}`;
}

export function voucherSpecLabel(spec: VoucherSpec) {
  const v = spec.type === "percent" ? `${spec.value}% off` : `RM${Number(spec.value).toFixed(2).replace(/\.00$/, "")} off`;
  const cap = spec.type === "percent" && spec.max_discount ? ` (max RM${spec.max_discount})` : "";
  return v + cap;
}
