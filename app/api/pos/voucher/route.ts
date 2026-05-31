import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";

function normalizeCode(value: string) {
  return String(value || "").trim().toUpperCase();
}

// GET ?code= — validate a voucher without redeeming it.
export async function GET(req: Request) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const code = normalizeCode(searchParams.get("code") || "");
  if (!code) return NextResponse.json({ error: "Kod diperlukan" }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { data: voucher, error } = await supabase
    .from("vouchers")
    .select("id,code,status,reward_amount,reward_label,points_spent,expires_at,customer_id")
    .eq("code", code)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!voucher) return NextResponse.json({ valid: false, reason: "not_found" });

  const expired = voucher.expires_at && new Date(voucher.expires_at).getTime() < Date.now();
  const valid = voucher.status === "issued" && !expired;

  return NextResponse.json({
    valid,
    reason: valid ? null : expired ? "expired" : voucher.status,
    voucher: {
      code: voucher.code,
      status: voucher.status,
      reward_amount: Number(voucher.reward_amount || 0),
      reward_label: voucher.reward_label,
      points_spent: Number(voucher.points_spent || 0),
      expires_at: voucher.expires_at,
    },
  });
}

// POST { code, order_id? } — atomically redeem (issued -> redeemed).
export async function POST(req: Request) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const code = normalizeCode(String(body?.code || ""));
  const orderId = String(body?.order_id || "").trim() || null;
  if (!code) return NextResponse.json({ error: "Kod diperlukan" }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("redeem_voucher_code", {
    p_code: code,
    p_order_id: orderId,
  });

  if (error) {
    if (String(error.message).includes("VOUCHER_NOT_REDEEMABLE")) {
      // Determine the precise reason for a helpful message.
      const { data: existing } = await supabase
        .from("vouchers")
        .select("status,expires_at")
        .eq("code", code)
        .maybeSingle();
      let reason = "not_found";
      if (existing) {
        reason =
          existing.expires_at && new Date(existing.expires_at).getTime() < Date.now()
            ? "expired"
            : existing.status; // 'redeemed' | 'expired'
      }
      return NextResponse.json({ success: false, reason }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const voucher = (Array.isArray(data) ? data[0] : data) as {
    code: string;
    reward_amount: number;
    reward_label: string | null;
    points_spent: number;
  } | null;

  return NextResponse.json({
    success: true,
    voucher: {
      code: voucher?.code || code,
      reward_amount: Number(voucher?.reward_amount || 0),
      reward_label: voucher?.reward_label || null,
      points_spent: Number(voucher?.points_spent || 0),
    },
  });
}
