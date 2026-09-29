import { canonicalPhone } from "@/lib/phone";
import { PLAYER_ROLES, type PlayerRole, type VoucherConfig, type VoucherSpec } from "./types";

// Whitelists for admin writes — only these keys ever reach the database.

const FORMATS = ["round_robin", "single_elim", "group_knockout"];
const STATUSES = ["draft", "registration_open", "registration_closed", "ongoing", "completed"];

const str = (v: unknown, max = 200) => {
  const s = String(v ?? "").trim().slice(0, max);
  return s || null;
};
const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const iso = (v: unknown) => {
  if (v === null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const bo = (v: unknown, fallback: number) => ([1, 3, 5].includes(Number(v)) ? Number(v) : fallback);

export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 48);
}

function spec(v: unknown, withValidity: boolean): VoucherSpec | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const type = o.type === "percent" ? "percent" : "amount";
  const value = Math.max(0, Number(o.value) || 0);
  return {
    enabled: Boolean(o.enabled),
    type,
    value: type === "percent" ? Math.min(100, value) : value,
    max_discount: o.max_discount ? Math.max(0, Number(o.max_discount) || 0) : null,
    min_spend: Math.max(0, Number(o.min_spend) || 0),
    ...(withValidity ? { validity_days: int(o.validity_days, 1, 365, 30) } : {}),
  };
}

export function sanitizeVoucherConfig(v: unknown): VoucherConfig {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: VoucherConfig = {};
  const d = spec(o.discount, true);
  const e = spec(o.event_day, false);
  if (d) out.discount = d;
  if (e) out.event_day = e;
  const pp = o.player_perk as Record<string, unknown> | undefined;
  if (pp && typeof pp === "object") {
    out.player_perk = {
      enabled: Boolean(pp.enabled),
      percent: Math.min(100, Math.max(0, Math.round(Number(pp.percent) || 0))),
      category_ids: (Array.isArray(pp.category_ids) ? pp.category_ids : [])
        .map(String).filter(id => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 20),
    };
  }
  return out;
}

export function sanitizePrizes(v: unknown) {
  return (Array.isArray(v) ? v : [])
    .map(p => ({ title: str((p as Record<string, unknown>)?.title, 40) || "", value: str((p as Record<string, unknown>)?.value, 120) || "" }))
    .filter(p => p.title || p.value)
    .slice(0, 8);
}

/** Tournament create/update. `partial` keeps only keys present in the body. */
export function sanitizeTournament(body: Record<string, unknown>, partial: boolean) {
  const has = (k: string) => !partial || k in body;
  const out: Record<string, unknown> = {};
  if (has("name")) out.name = str(body.name, 80) || "Tournament";
  if (has("slug") && body.slug) out.slug = slugify(String(body.slug)) || null;
  if (has("description")) out.description = str(body.description, 2000);
  if (has("logo_url")) out.logo_url = str(body.logo_url, 500);
  if (partial ? "cover_url" in body : !!body.cover_url) out.cover_url = str(body.cover_url, 500);
  if (has("venue")) out.venue = str(body.venue, 120);
  if (has("format")) out.format = FORMATS.includes(String(body.format)) ? body.format : "round_robin";
  if (has("status")) out.status = STATUSES.includes(String(body.status)) ? body.status : "draft";
  if (has("published")) out.published = Boolean(body.published);
  if (has("start_at")) out.start_at = iso(body.start_at);
  if (has("end_at")) out.end_at = iso(body.end_at);
  if (has("registration_deadline")) out.registration_deadline = iso(body.registration_deadline);
  if (has("max_teams")) out.max_teams = int(body.max_teams, 2, 128, 16);
  if (has("min_players")) out.min_players = int(body.min_players, 1, 10, 5);
  if (has("max_players")) out.max_players = int(body.max_players, 1, 10, 6);
  if (has("entry_fee")) out.entry_fee = Math.max(0, Number(body.entry_fee) || 0);
  if (has("payment_instructions")) out.payment_instructions = str(body.payment_instructions, 1000);
  if (has("payment_qr_url")) out.payment_qr_url = str(body.payment_qr_url, 500);
  if (has("default_best_of")) out.default_best_of = bo(body.default_best_of, 1);
  if (has("knockout_best_of")) out.knockout_best_of = bo(body.knockout_best_of, 3);
  if (has("group_count")) out.group_count = int(body.group_count, 1, 16, 2);
  if (has("advance_per_group")) out.advance_per_group = int(body.advance_per_group, 1, 8, 2);
  if (has("points_win")) out.points_win = int(body.points_win, 0, 100, 3);
  if (has("points_loss")) out.points_loss = int(body.points_loss, 0, 100, 0);
  if (has("voucher_config")) out.voucher_config = sanitizeVoucherConfig(body.voucher_config);
  if (partial ? "prizes" in body : Array.isArray(body.prizes)) out.prizes = sanitizePrizes(body.prizes);
  if (typeof out.min_players === "number" && typeof out.max_players === "number" && out.max_players < out.min_players) {
    out.max_players = out.min_players;
  }
  return out;
}

export function sanitizeTeam(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if ("name" in body) out.name = str(body.name, 40);
  if ("short_name" in body) out.short_name = str(body.short_name, 6)?.toUpperCase() ?? null;
  if ("logo_url" in body) out.logo_url = str(body.logo_url, 500);
  if ("team_number" in body) out.team_number = body.team_number === null || body.team_number === "" ? null : int(body.team_number, 1, 999, 1);
  if ("group_name" in body) out.group_name = str(body.group_name, 10)?.toUpperCase() ?? null;
  if ("seed" in body) out.seed = body.seed === null || body.seed === "" ? null : int(body.seed, 1, 999, 1);
  if ("manual_position" in body) out.manual_position = body.manual_position === null || body.manual_position === "" ? null : int(body.manual_position, 1, 999, 1);
  if ("contact_phone" in body) out.contact_phone = canonicalPhone(String(body.contact_phone || "")) || null;
  if ("notes" in body) out.notes = str(body.notes, 1000);
  return out;
}

export function sanitizePlayer(p: Record<string, unknown>) {
  return {
    full_name: str(p.full_name, 60),
    ign: str(p.ign, 30) || "",
    mlbb_user_id: String(p.mlbb_user_id ?? "").replace(/\D/g, "").slice(0, 20),
    server_id: String(p.server_id ?? "").replace(/\D/g, "").slice(0, 10) || null,
    phone: canonicalPhone(String(p.phone || "")) || null,
    player_role: (PLAYER_ROLES.includes(p.player_role as PlayerRole) ? p.player_role : "sub") as PlayerRole,
    is_captain: Boolean(p.is_captain),
    status: p.status === "inactive" ? "inactive" : "active",
  };
}
