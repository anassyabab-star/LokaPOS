import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// ============================================================================
// LokaPOS — Single source of truth for the loyalty economy.
//
// Every redeem rate, earn rate, min-points, expiry window, tier threshold and
// bonus amount lives here. Routes/UI must read these values (server: via
// getLoyaltyConfig(); client: via /api/public/store-status) instead of
// hard-coding constants, so changing loyalty_config in admin takes effect
// everywhere without a deploy.
// ============================================================================

export type LoyaltyTier = {
  name: string;
  /** Minimum rolling-12-month paid spend (RM) to reach this tier. */
  minSpend: number;
  /** Earn multiplier applied to base earn for members of this tier. */
  earnMultiplier: number;
};

export type LoyaltyVoucherTier = {
  /** Points spent to issue the voucher. */
  points: number;
  /** RM discount value of the voucher. */
  amount: number;
  /** Display label, e.g. "RM5". */
  label: string;
};

export type LoyaltyConfig = {
  /** Points earned per RM1 of (paid) order total. */
  earnPerRM: number;
  /** RM discount granted per redeemed point (100 pts × 0.05 = RM5). */
  redeemRmPerPoint: number;
  /** Minimum points that can be redeemed in one action. */
  redeemMinPoints: number;
  /** Max fraction of an order total that loyalty redemption may cover. */
  redeemMaxRatio: number;
  /** Days a points lot stays valid before expiry. */
  expiryDays: number;
  /** Window (days before expiry) flagged as "expiring soon". */
  expiringSoonDays: number;
  /** Points awarded per daily check-in. */
  checkInPoints: number;
  /** Points awarded to BOTH parties when a referral qualifies. */
  referralPoints: number;
  /** Points awarded once per year on a customer's birthday. */
  birthdayPoints: number;
  /** Days an issued voucher stays redeemable. */
  voucherExpiryDays: number;
  /** OTP validity window (minutes). */
  otpExpiryMinutes: number;
  /** Membership tiers, ascending by minSpend. */
  membershipTiers: LoyaltyTier[];
  /** Voucher redemption tiers offered in the PWA. */
  voucherTiers: LoyaltyVoucherTier[];
};

export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  earnPerRM: 1,
  redeemRmPerPoint: 0.05, // 100 pts = RM5
  redeemMinPoints: 100, // resolves the historic 50-vs-100 split → 100
  redeemMaxRatio: 0.3, // resolves the historic 0.3-vs-0.5 split → 0.3 (conservative)
  expiryDays: 365,
  expiringSoonDays: 30,
  checkInPoints: 1,
  referralPoints: 50,
  birthdayPoints: 50,
  voucherExpiryDays: 30,
  otpExpiryMinutes: 5,
  membershipTiers: [
    { name: "Bronze", minSpend: 0, earnMultiplier: 1 },
    { name: "Silver", minSpend: 500, earnMultiplier: 1 },
    { name: "Gold", minSpend: 1500, earnMultiplier: 1.25 },
    { name: "Platinum", minSpend: 3000, earnMultiplier: 1.5 },
  ],
  voucherTiers: [
    { points: 100, amount: 5, label: "RM5" },
    { points: 300, amount: 15, label: "RM15" },
    { points: 500, amount: 25, label: "RM25" },
    { points: 1000, amount: 50, label: "RM50" },
  ],
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toNumber(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseTiers(raw: unknown, fallback: LoyaltyTier[]): LoyaltyTier[] {
  if (!Array.isArray(raw)) return fallback;
  const parsed = raw
    .map(item => {
      const obj = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const name = String(obj.name || "").trim();
      if (!name) return null;
      return {
        name,
        minSpend: Math.max(0, toNumber(obj.minSpend, 0)),
        earnMultiplier: Math.max(0, toNumber(obj.earnMultiplier, 1)) || 1,
      };
    })
    .filter((t): t is LoyaltyTier => Boolean(t))
    .sort((a, b) => a.minSpend - b.minSpend);
  return parsed.length > 0 ? parsed : fallback;
}

function parseVoucherTiers(
  raw: unknown,
  redeemRmPerPoint: number,
  fallback: LoyaltyVoucherTier[]
): LoyaltyVoucherTier[] {
  if (!Array.isArray(raw)) return fallback;
  const parsed = raw
    .map(item => {
      const obj = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const points = Math.max(0, Math.floor(toNumber(obj.points, 0)));
      if (points <= 0) return null;
      const amount =
        obj.amount !== undefined ? toNumber(obj.amount, points * redeemRmPerPoint) : points * redeemRmPerPoint;
      const label = String(obj.label || `RM${amount}`).trim();
      return { points, amount, label };
    })
    .filter((t): t is LoyaltyVoucherTier => Boolean(t))
    .sort((a, b) => a.points - b.points);
  return parsed.length > 0 ? parsed : fallback;
}

/** Merge a raw JSONB blob with defaults into a fully-populated LoyaltyConfig. */
export function parseLoyaltyConfig(raw: unknown): LoyaltyConfig {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_LOYALTY_CONFIG;
  const redeemRmPerPoint = Math.max(0, toNumber(obj.redeemRmPerPoint, d.redeemRmPerPoint)) || d.redeemRmPerPoint;
  return {
    earnPerRM: Math.max(0, toNumber(obj.earnPerRM, d.earnPerRM)),
    redeemRmPerPoint,
    redeemMinPoints: Math.max(0, Math.floor(toNumber(obj.redeemMinPoints, d.redeemMinPoints))),
    redeemMaxRatio: Math.min(1, Math.max(0, toNumber(obj.redeemMaxRatio, d.redeemMaxRatio))),
    expiryDays: Math.max(1, Math.floor(toNumber(obj.expiryDays, d.expiryDays))),
    expiringSoonDays: Math.max(1, Math.floor(toNumber(obj.expiringSoonDays, d.expiringSoonDays))),
    checkInPoints: Math.max(0, Math.floor(toNumber(obj.checkInPoints, d.checkInPoints))),
    referralPoints: Math.max(0, Math.floor(toNumber(obj.referralPoints, d.referralPoints))),
    birthdayPoints: Math.max(0, Math.floor(toNumber(obj.birthdayPoints, d.birthdayPoints))),
    voucherExpiryDays: Math.max(1, Math.floor(toNumber(obj.voucherExpiryDays, d.voucherExpiryDays))),
    otpExpiryMinutes: Math.max(1, Math.floor(toNumber(obj.otpExpiryMinutes, d.otpExpiryMinutes))),
    membershipTiers: parseTiers(obj.membershipTiers, d.membershipTiers),
    voucherTiers: parseVoucherTiers(obj.voucherTiers, redeemRmPerPoint, d.voucherTiers),
  };
}

let cachedConfig: { value: LoyaltyConfig; atMs: number } | null = null;
const CONFIG_TTL_MS = 30_000;

function isMissingRelationError(message: string | null | undefined) {
  const text = String(message || "").toLowerCase();
  return text.includes("does not exist") || text.includes("schema cache");
}

/**
 * Read the active loyalty config from store_settings.loyalty_config, merged with
 * defaults. Cached for a short TTL to avoid hammering the DB per request.
 */
export async function getLoyaltyConfig(): Promise<LoyaltyConfig> {
  const now = Date.now();
  if (cachedConfig && now - cachedConfig.atMs < CONFIG_TTL_MS) {
    return cachedConfig.value;
  }
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("store_settings")
      .select("loyalty_config")
      .eq("id", "main")
      .maybeSingle();
    if (error && !isMissingRelationError(error.message)) {
      // Surface non-schema errors but still fall back to defaults.
      console.error("[loyalty] getLoyaltyConfig error:", error.message);
    }
    const value = parseLoyaltyConfig(data?.loyalty_config);
    cachedConfig = { value, atMs: now };
    return value;
  } catch (err) {
    console.error("[loyalty] getLoyaltyConfig threw:", err);
    return DEFAULT_LOYALTY_CONFIG;
  }
}

export type LoyaltyLedgerRowLike = {
  points_change: number | null;
  created_at: string;
};

export type LoyaltySnapshot = {
  pointsAvailable: number;
  expiringPoints30d: number;
  /** Points in lots already past expiry that have not yet been written off. */
  expiredPoints: number;
};

/**
 * FIFO snapshot: positive entries are lots consumed oldest-first by negative
 * entries; lots older than expiryDays are dropped from the available balance.
 */
export function calculateLoyaltySnapshot(
  rows: LoyaltyLedgerRowLike[],
  config: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG
): LoyaltySnapshot {
  const nowMs = Date.now();
  const expiryCutoffMs = nowMs - config.expiryDays * MS_PER_DAY;
  const expiringSoonCutoffMs = nowMs - (config.expiryDays - config.expiringSoonDays) * MS_PER_DAY;
  const lots: Array<{ remaining: number; createdAtMs: number }> = [];

  const sorted = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  for (const row of sorted) {
    const change = Number(row.points_change || 0);
    const createdAtMs = new Date(row.created_at).getTime();
    if (!Number.isFinite(createdAtMs)) continue;

    if (change > 0) {
      lots.push({ remaining: change, createdAtMs });
      continue;
    }
    if (change < 0) {
      let redeem = Math.abs(change);
      while (redeem > 0 && lots.length > 0) {
        const lot = lots[0];
        const used = Math.min(lot.remaining, redeem);
        lot.remaining -= used;
        redeem -= used;
        if (lot.remaining <= 0) lots.shift();
      }
    }
  }

  let pointsAvailable = 0;
  let expiringPoints30d = 0;
  let expiredPoints = 0;
  for (const lot of lots) {
    if (lot.createdAtMs < expiryCutoffMs) {
      expiredPoints += lot.remaining;
      continue;
    }
    pointsAvailable += lot.remaining;
    if (lot.createdAtMs <= expiringSoonCutoffMs) {
      expiringPoints30d += lot.remaining;
    }
  }

  return { pointsAvailable, expiringPoints30d, expiredPoints };
}

export type RedeemResult = { redeem_points: number; redeem_amount: number };

/**
 * Compute how many points actually apply given the request, the customer's
 * available balance, and the order subtotal — bounded by min-points and the
 * max-ratio cap. Pure; takes config so POS and PWA agree exactly.
 */
export function calculateRedeem(
  requestedRedeemPoints: number,
  availablePoints: number,
  subtotal: number,
  config: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG
): RedeemResult {
  const points = Math.max(0, Math.floor(Number(requestedRedeemPoints || 0)));
  if (points <= 0 || availablePoints <= 0) {
    return { redeem_points: 0, redeem_amount: 0 };
  }
  const maxAmountByRatio = subtotal * config.redeemMaxRatio;
  const maxPointsByRatio = Math.floor(maxAmountByRatio / config.redeemRmPerPoint);
  let appliedPoints = Math.min(points, availablePoints, maxPointsByRatio);
  if (appliedPoints < config.redeemMinPoints) {
    appliedPoints = 0;
  }
  return {
    redeem_points: appliedPoints,
    redeem_amount: appliedPoints * config.redeemRmPerPoint,
  };
}

/** Highest tier whose minSpend the rolling-12-month spend meets or exceeds. */
export function computeMembershipTier(spend12m: number, config: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG) {
  const spend = Math.max(0, Number(spend12m || 0));
  const tiers = [...config.membershipTiers].sort((a, b) => a.minSpend - b.minSpend);
  let current: LoyaltyTier = tiers[0] || DEFAULT_LOYALTY_CONFIG.membershipTiers[0];
  for (const tier of tiers) {
    if (spend >= tier.minSpend) current = tier;
  }
  return current;
}

const VOUCHER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars

function randomCode(len: number) {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += VOUCHER_ALPHABET[Math.floor(Math.random() * VOUCHER_ALPHABET.length)];
  }
  return out;
}

/** Human-friendly voucher code, e.g. "ABC-2KD9". */
export function generateVoucherCode() {
  return `${randomCode(3)}-${randomCode(4)}`;
}

/** Referral code, e.g. "REF-7KQ2". */
export function generateReferralCode() {
  return `REF-${randomCode(4)}`;
}

export function loyaltyExpiresAt(config: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG) {
  return new Date(Date.now() + config.expiryDays * MS_PER_DAY).toISOString();
}

export function voucherExpiresAt(config: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG) {
  return new Date(Date.now() + config.voucherExpiryDays * MS_PER_DAY).toISOString();
}

// ============================================================================
// Server-side atomic operations (call the SQL RPCs from the migration).
// ============================================================================

function isInsufficientPointsError(message: string | null | undefined) {
  return String(message || "").includes("INSUFFICIENT_POINTS");
}

/** Net ledger balance across ALL entries (the strict non-negative invariant). */
export async function getNetPointsBalance(customerId: string): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("loyalty_ledger")
    .select("points_change")
    .eq("customer_id", customerId)
    .limit(10000);
  if (error) {
    if (isMissingRelationError(error.message)) return 0;
    throw new Error(error.message);
  }
  return (data || []).reduce((sum, row) => sum + Number(row.points_change || 0), 0);
}

export type RedeemAtomicResult = {
  ok: boolean;
  balance: number | null;
  error?: "INSUFFICIENT_POINTS" | "ERROR";
};

/**
 * Atomically deduct points via the redeem_loyalty_points RPC (advisory-locked,
 * never lets the net balance go negative). Falls back to a guarded
 * read-then-insert if the RPC is not yet deployed.
 */
export async function redeemPointsAtomic(params: {
  customerId: string;
  points: number;
  orderId?: string | null;
  source: string;
  note: string;
  eventKey?: string | null;
}): Promise<RedeemAtomicResult> {
  const points = Math.max(0, Math.floor(Number(params.points || 0)));
  if (points <= 0) return { ok: true, balance: null };
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase.rpc("redeem_loyalty_points", {
    p_customer_id: params.customerId,
    p_points: points,
    p_order_id: params.orderId ?? null,
    p_source: params.source,
    p_note: params.note,
    p_event_key: params.eventKey ?? null,
  });

  if (!error) {
    return { ok: true, balance: typeof data === "number" ? data : null };
  }
  if (isInsufficientPointsError(error.message)) {
    return { ok: false, balance: null, error: "INSUFFICIENT_POINTS" };
  }
  if (!isMissingRelationError(error.message)) {
    console.error("[loyalty] redeem RPC error:", error.message);
    return { ok: false, balance: null, error: "ERROR" };
  }

  // Fallback: RPC not deployed — guard with net balance then insert.
  const balance = await getNetPointsBalance(params.customerId);
  if (balance < points) return { ok: false, balance, error: "INSUFFICIENT_POINTS" };
  const { error: insertError } = await supabase.from("loyalty_ledger").insert([
    {
      customer_id: params.customerId,
      order_id: params.orderId ?? null,
      entry_type: "redeem",
      points_change: -points,
      source: params.source,
      note: params.note,
      ...(params.eventKey ? { event_key: params.eventKey } : {}),
    },
  ]);
  if (insertError && !isMissingRelationError(insertError.message)) {
    console.error("[loyalty] redeem fallback insert error:", insertError.message);
    return { ok: false, balance, error: "ERROR" };
  }
  return { ok: true, balance: balance - points };
}

export type VoucherRow = {
  id: string;
  code: string;
  customer_id: string | null;
  status: string;
  points_spent: number;
  reward_amount: number;
  reward_label: string | null;
  expires_at: string | null;
};

export type IssueVoucherResult =
  | { ok: true; voucher: VoucherRow }
  | { ok: false; error: "INSUFFICIENT_POINTS" | "ERROR" };

/**
 * Issue a voucher atomically (ledger redeem + voucher row in one tx via RPC).
 * Retries on unique code collisions with a fresh code each time.
 */
export async function issueVoucherAtomic(params: {
  customerId: string;
  points: number;
  amount: number;
  label: string;
  config: LoyaltyConfig;
}): Promise<IssueVoucherResult> {
  const supabase = createSupabaseAdminClient();
  const expiresAt = voucherExpiresAt(params.config);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateVoucherCode();
    const { data, error } = await supabase.rpc("issue_loyalty_voucher", {
      p_customer_id: params.customerId,
      p_points: params.points,
      p_amount: params.amount,
      p_label: params.label,
      p_code: code,
      p_expires_at: expiresAt,
    });

    if (!error) {
      const voucher = (Array.isArray(data) ? data[0] : data) as VoucherRow;
      return { ok: true, voucher };
    }
    if (isInsufficientPointsError(error.message)) {
      return { ok: false, error: "INSUFFICIENT_POINTS" };
    }
    if (isUniqueViolation(error.message)) {
      continue; // code collision — retry with a new code
    }
    console.error("[loyalty] issue voucher RPC error:", error.message);
    return { ok: false, error: "ERROR" };
  }
  return { ok: false, error: "ERROR" };
}

function isUniqueViolation(message: string | null | undefined) {
  const text = String(message || "").toLowerCase();
  return text.includes("duplicate key") || text.includes("unique");
}

/** Ensure a customer has a referral_code, generating a unique one if missing. */
export async function ensureReferralCode(customerId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data: customer, error } = await supabase
    .from("customers")
    .select("id,referral_code")
    .eq("id", customerId)
    .maybeSingle();
  if (error || !customer) return null;
  if (customer.referral_code) return String(customer.referral_code);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const { error: updateError } = await supabase
      .from("customers")
      .update({ referral_code: code })
      .eq("id", customerId)
      .is("referral_code", null);
    if (!updateError) return code;
    if (isMissingRelationError(updateError.message)) return null;
    if (!isUniqueViolation(updateError.message)) return null;
    // Code collided — re-read in case another writer set it, else retry.
    const { data: refreshed } = await supabase
      .from("customers")
      .select("referral_code")
      .eq("id", customerId)
      .maybeSingle();
    if (refreshed?.referral_code) return String(refreshed.referral_code);
  }
  return null;
}

export async function findCustomerByReferralCode(code: string): Promise<string | null> {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return null;
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("customers")
    .select("id")
    .eq("referral_code", normalized)
    .maybeSingle();
  return data?.id || null;
}

/**
 * Record who referred a customer — set once, only if not already attributed and
 * the referrer is a different customer. The actual bonus is paid by
 * applyCustomerOrderPaidSettlement on the first paid order.
 */
export async function applyReferralOnSignup(newCustomerId: string, referralCode: string): Promise<void> {
  const referrerId = await findCustomerByReferralCode(referralCode);
  if (!referrerId || referrerId === newCustomerId) return;
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("customers")
    .update({ referred_by: referrerId })
    .eq("id", newCustomerId)
    .is("referred_by", null);
}
