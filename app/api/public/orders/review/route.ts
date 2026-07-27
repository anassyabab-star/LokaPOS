import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getLoyaltyConfig, loyaltyExpiresAt } from "@/lib/loyalty";
import { insertLedgerEvent } from "@/lib/customer-order-payment";
import { issueRewardVoucher } from "@/lib/rewards-vouchers";

// POST { order_id, phone, rating, comment } — submit an order review.
// Records the review, marks the journey 'reviewed', and (if configured) unlocks a
// reward voucher + review points. Idempotent per order.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const orderId = String(body?.order_id || "").trim();
  const phone = String(body?.phone || "").replace(/[^\d+]/g, "");
  const rating = Math.max(1, Math.min(5, Math.round(Number(body?.rating || 0))));
  const comment = String(body?.comment || "").trim().slice(0, 1000) || null;

  if (!orderId || !phone) {
    return NextResponse.json({ error: "order_id & phone diperlukan" }, { status: 400 });
  }
  if (!Number.isFinite(rating) || rating < 1) {
    return NextResponse.json({ error: "Sila beri rating 1–5" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (!customer?.id) return NextResponse.json({ error: "Order tidak dijumpai" }, { status: 404 });
  const customerId = String(customer.id);

  const { data: order } = await supabase
    .from("orders")
    .select("id, customer_id, receipt_number")
    .eq("id", orderId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "Order tidak dijumpai" }, { status: 404 });

  // Record the review (unique per order → idempotent).
  const { error: insertErr } = await supabase
    .from("order_reviews")
    .insert([{ order_id: orderId, customer_id: customerId, rating, comment }]);
  const alreadyReviewed =
    insertErr && String(insertErr.message).toLowerCase().includes("duplicate");
  if (insertErr && !alreadyReviewed) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await supabase
    .from("orders")
    .update({ fulfillment_stage: "reviewed", reviewed_at: new Date().toISOString() })
    .eq("id", orderId);

  const config = await getLoyaltyConfig();
  let voucher: { code: string; reward_label: string | null } | null = null;

  // Review points (idempotent).
  if (config.reviewPoints > 0) {
    await insertLedgerEvent({
      customerId,
      orderId,
      entryType: "earn",
      pointsChange: config.reviewPoints,
      source: "review",
      note: `Review reward — order ${order.receipt_number || orderId.slice(0, 8)}`,
      eventKey: `review-pts:${orderId}`,
      createdBy: null,
      expiresAt: loyaltyExpiresAt(config),
    });
  }

  // Review reward voucher (idempotent).
  if (config.reviewRewardAmount > 0) {
    const expiresAt = new Date(
      Date.now() + config.voucherExpiryDays * 24 * 60 * 60 * 1000
    ).toISOString();
    const issued = await issueRewardVoucher({
      customerId,
      source: "review",
      sourceRef: orderId,
      rewardType: "amount",
      rewardLabel: `RM${config.reviewRewardAmount.toFixed(2)} (review)`,
      rewardAmount: config.reviewRewardAmount,
      issueEventKey: `review:${orderId}`,
      expiresAt,
    });
    if (issued) voucher = { code: issued.code, reward_label: issued.reward_label };
  }

  return NextResponse.json({ success: true, already_reviewed: Boolean(alreadyReviewed), voucher });
}
