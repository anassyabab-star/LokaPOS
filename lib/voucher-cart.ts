// What a voucher is worth against a specific cart, for the till.
//
// The web checkout prices vouchers with computeVoucherDiscount
// (lib/rewards-vouchers.ts), which deliberately returns 0 for `free_product`
// and leaves it "for POS redemption" — but the POS had no voucher UI at all,
// so a free-cup reward from a mission could not be spent anywhere. This is the
// missing half: the same rules, plus the free-item case.

export type PosVoucher = {
  code: string;
  reward_type: string;
  reward_amount: number;
  reward_label: string | null;
  discount_percent: number | null;
  max_discount: number | null;
  min_spend: number;
  reward_product_id: string | null;
  reward_category_id: string | null;
};

export type CartLineLite = {
  product_id: string;
  name: string;
  /** Unit price, before quantity. */
  price: number;
  qty: number;
};

export type VoucherApplication =
  | { ok: true; discount: number; covers: string | null; note: string }
  | { ok: false; reason: string };

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * `categoryByProductId` is optional; without it a category-scoped voucher
 * cannot be priced here and is refused rather than guessed at.
 */
export function applyVoucherToCart(
  v: PosVoucher,
  lines: CartLineLite[],
  subtotal: number,
  categoryByProductId?: Map<string, string | null>
): VoucherApplication {
  if (subtotal <= 0) return { ok: false, reason: "Troli kosong." };
  if (Number(v.min_spend || 0) > subtotal) {
    return { ok: false, reason: `Perlu belanja minimum RM${Number(v.min_spend).toFixed(2)}.` };
  }

  if (v.reward_type === "free_product") {
    // Eligible lines: the named product, else the named category, else anything.
    let eligible = lines;
    if (v.reward_product_id) {
      eligible = lines.filter(l => l.product_id === v.reward_product_id);
      if (eligible.length === 0) return { ok: false, reason: "Item percuma itu tiada dalam troli." };
    } else if (v.reward_category_id) {
      if (!categoryByProductId) return { ok: false, reason: "Voucher kategori — tebus di web." };
      eligible = lines.filter(l => categoryByProductId.get(l.product_id) === v.reward_category_id);
      if (eligible.length === 0) return { ok: false, reason: "Tiada item kategori itu dalam troli." };
    }
    // One item, not one line: the cheapest eligible unit. Deliberately the
    // cheapest so a "free cup" cannot be pointed at the most expensive drink
    // in a large order without the cashier choosing to.
    const cheapest = eligible.reduce((min, l) => (l.price < min.price ? l : min));
    return {
      ok: true,
      discount: round2(Math.min(cheapest.price, subtotal)),
      covers: cheapest.name,
      note: `1× ${cheapest.name} percuma`,
    };
  }

  if (v.reward_type === "percent") {
    const pct = Math.max(0, Number(v.discount_percent || 0));
    let d = subtotal * (pct / 100);
    const cap = Number(v.max_discount || 0);
    if (cap > 0) d = Math.min(d, cap);
    if (d <= 0) return { ok: false, reason: "Voucher ini tiada nilai." };
    return { ok: true, discount: round2(Math.min(d, subtotal)), covers: null, note: `${pct}% off` };
  }

  if (v.reward_type === "amount") {
    const d = Math.min(Number(v.reward_amount || 0), subtotal);
    if (d <= 0) return { ok: false, reason: "Voucher ini tiada nilai." };
    return { ok: true, discount: round2(d), covers: null, note: `RM${round2(d).toFixed(2)} off` };
  }

  return { ok: false, reason: "Jenis voucher tidak disokong." };
}
