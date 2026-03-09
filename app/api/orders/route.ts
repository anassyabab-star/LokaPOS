import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireStaffApi } from "@/lib/staff-api-auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  consent_whatsapp: boolean | null;
  consent_email: boolean | null;
  consent_whatsapp_at: string | null;
  consent_email_at: string | null;
  total_orders: number | null;
  total_spend: number | null;
};

type LoyaltyBalanceRow = {
  customer_id: string;
  points_balance: number | null;
};

type CustomerPayload = {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
  consent_whatsapp?: boolean;
  consent_email?: boolean;
};

const LOYALTY_EARN_PER_RM = 1;
const LOYALTY_REDEEM_RM_PER_POINT = 0.05; // 100 pts = RM 5
const LOYALTY_REDEEM_MIN_POINTS = 100;
const LOYALTY_REDEEM_MAX_RATIO = 0.3; // max 30% of order total
const LOYALTY_POINTS_EXPIRY_DAYS = 365;

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "").trim();
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

async function findExistingCustomer(email: string | null, phone: string | null) {
  if (email) {
    const { data } = await supabase
      .from("customers")
      .select(
        "id,name,phone,email,consent_whatsapp,consent_email,consent_whatsapp_at,consent_email_at,total_orders,total_spend"
      )
      .eq("email", email)
      .maybeSingle();
    if (data) return data as CustomerRow;
  }

  if (phone) {
    const { data } = await supabase
      .from("customers")
      .select(
        "id,name,phone,email,consent_whatsapp,consent_email,consent_whatsapp_at,consent_email_at,total_orders,total_spend"
      )
      .eq("phone", phone)
      .maybeSingle();
    if (data) return data as CustomerRow;
  }

  return null;
}

function isMissingRelationError(message: string | null | undefined) {
  const m = String(message || "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("relation") && m.includes("not found")
  );
}

async function getLoyaltyPointsBalance(customerId: string) {
  const cutoffIso = new Date(
    Date.now() - LOYALTY_POINTS_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: ledgerRows, error: ledgerError } = await supabase
    .from("loyalty_ledger")
    .select("points_change")
    .eq("customer_id", customerId)
    .gte("created_at", cutoffIso)
    .limit(5000);

  if (ledgerError) {
    if (isMissingRelationError(ledgerError.message)) return 0;
    throw ledgerError;
  }

  return (ledgerRows || []).reduce((sum, row) => sum + Number(row.points_change || 0), 0);
}

async function getLoyaltyPointsBalanceLegacyView(customerId: string) {
  const { data, error } = await supabase
    .from("customer_loyalty_balances")
    .select("customer_id,points_balance")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error.message)) return 0;
    throw error;
  }

  const row = (data || null) as LoyaltyBalanceRow | null;
  return Number(row?.points_balance || 0);
}

async function writeLoyaltyLedgerEntry(payload: {
  customerId: string;
  orderId: string;
  entryType: "earn" | "redeem";
  pointsChange: number;
  createdBy: string;
  note: string;
}) {
  if (!payload.pointsChange) return;

  const { error } = await supabase.from("loyalty_ledger").insert([
    {
      customer_id: payload.customerId,
      order_id: payload.orderId,
      entry_type: payload.entryType,
      points_change: payload.pointsChange,
      created_by: payload.createdBy,
      note: payload.note,
    },
  ]);

  if (error && !isMissingRelationError(error.message)) {
    throw error;
  }
}

async function upsertCustomerAndTrackOrder(payload: CustomerPayload | undefined, orderTotal: number) {
  if (!payload) return;

  const customerId = String(payload.id || "").trim() || null;
  const name = String(payload.name || "").trim();
  const phoneRaw = String(payload.phone || "").trim();
  const emailRaw = String(payload.email || "").trim();
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const email = emailRaw ? normalizeEmail(emailRaw) : null;
  const consentWhatsapp = Boolean(payload.consent_whatsapp);
  const consentEmail = Boolean(payload.consent_email);

  if (!name && !phone && !email) return null;

  const nowIso = new Date().toISOString();
  let existing: CustomerRow | null = null;

  if (customerId) {
    const { data } = await supabase
      .from("customers")
      .select(
        "id,name,phone,email,consent_whatsapp,consent_email,consent_whatsapp_at,consent_email_at,total_orders,total_spend"
      )
      .eq("id", customerId)
      .maybeSingle();
    existing = (data as CustomerRow | null) || null;
  }

  if (!existing) {
    existing = await findExistingCustomer(email, phone);
  }

  if (existing) {
    const wasWhatsapp = Boolean(existing.consent_whatsapp);
    const wasEmail = Boolean(existing.consent_email);

    await supabase
      .from("customers")
      .update({
        name: name || existing.name,
        phone: phone || existing.phone,
        email: email || existing.email,
        consent_whatsapp: consentWhatsapp,
        consent_email: consentEmail,
        consent_whatsapp_at:
          consentWhatsapp && !wasWhatsapp
            ? nowIso
            : consentWhatsapp
              ? existing.consent_whatsapp_at
              : null,
        consent_email_at:
          consentEmail && !wasEmail
            ? nowIso
            : consentEmail
              ? existing.consent_email_at
              : null,
        total_orders: Number(existing.total_orders || 0) + 1,
        total_spend: Number(existing.total_spend || 0) + Number(orderTotal || 0),
        last_order_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: inserted } = await supabase.from("customers").insert([
    {
      name: name || "Walk-in Customer",
      phone,
      email,
      consent_whatsapp: consentWhatsapp,
      consent_email: consentEmail,
      consent_whatsapp_at: consentWhatsapp ? nowIso : null,
      consent_email_at: consentEmail ? nowIso : null,
      total_orders: 1,
      total_spend: Number(orderTotal || 0),
      last_order_at: nowIso,
      updated_at: nowIso,
    },
  ]).select("id").single();

  return inserted?.id || null;
}

export async function POST(req: Request) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const registerId = String(body?.register_id || "main");

    const { data: openShift, error: shiftError } = await supabase
      .from("pos_shifts")
      .select("id")
      .eq("register_id", registerId)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();

    if (shiftError) {
      return NextResponse.json({
        success: false,
        error: shiftError.message,
      });
    }

    if (!openShift) {
      return NextResponse.json({
        success: false,
        error: "No open shift. Please start shift before checkout.",
      });
    }

    const today = new Date();
    const dateKey = today.toISOString().slice(0, 10);

    const { count } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("date_key", dateKey);

    const orderNumber = (count || 0) + 1;
    const formattedNumber = String(orderNumber).padStart(3, "0");

    const datePart = today
      .toLocaleDateString("en-GB")
      .split("/")
      .join("");

    const receiptNumber = `${datePart}-${formattedNumber}`;

    let subtotal = 0;

    // CHECK STOCK
    for (const item of body.items) {
      const productId = item.product_id;

      const { data: product } = await supabase
        .from("products")
        .select("stock, name")
        .eq("id", productId)
        .single();

      if (!product) {
        return NextResponse.json({
          success: false,
          error: "Product not found",
        });
      }

      if ((product.stock || 0) < Number(item.qty)) {
        return NextResponse.json({
          success: false,
          error: `Stock not enough for ${product.name}`,
        });
      }
    }

    const { data: order, error } = await supabase
      .from("orders")
      .insert([
        {
          receipt_number: receiptNumber,
          date_key: dateKey,
          customer_name: body.customer_name,
          subtotal: 0,
          discount_type: body.discount_type,
          discount_value: body.discount_value,
          total: 0,
          payment_method: body.payment_method,
          cash_received: body.cash_received,
          balance: 0,
          status: "completed",
          payment_status: "paid",
        },
      ])
      .select()
      .single();

    if (error || !order) {
      return NextResponse.json({ success: false, error });
    }

    // PROCESS ITEMS
    for (const item of body.items) {
      const productId = item.product_id;
      const variantId = item.variant_id;
      const addonIds = Array.isArray(item.addon_ids) ? item.addon_ids : [];
      const snapshotName =
        typeof item.name === "string" && item.name.trim().length > 0
          ? item.name.trim()
          : null;

      const { data: product } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .single();

      if (!product) continue;

      let price = Number(product.price);

      if (variantId) {
        const { data: variant } = await supabase
          .from("product_variants")
          .select("*")
          .eq("id", variantId)
          .single();

        if (variant) {
          price += Number(variant.price_adjustment || 0);
        }
      }

      const addonSnapshots: Array<{ id: string; name: string; price: number }> = [];
      if (addonIds.length > 0) {
        const { data: addons } = await supabase
          .from("product_addons")
          .select("id, name, price")
          .in("id", addonIds);

        for (const addon of addons || []) {
          price += Number(addon.price || 0);
          addonSnapshots.push({
            id: addon.id,
            name: addon.name,
            price: Number(addon.price || 0),
          });
        }
      }

      const lineTotal = price * Number(item.qty);
      subtotal += lineTotal;

      const { data: orderItem } = await supabase.from("order_items").insert([
        {
          order_id: order.id,
          product_id: productId,
          product_name_snapshot: snapshotName || product.name,
          variant_id: variantId || null,
          sugar_level: item.sugar_level || null,
          price,
          qty: item.qty,
          line_total: lineTotal,
        },
      ]).select("id").single();

      if (orderItem && addonSnapshots.length > 0) {
        await supabase.from("order_item_addons").insert(
          addonSnapshots.map(addon => ({
            order_item_id: orderItem.id,
            addon_id: addon.id,
            addon_name_snapshot: addon.name,
            addon_price_snapshot: addon.price,
          }))
        );
      }

      await supabase
        .from("products")
        .update({ stock: (product.stock || 0) - item.qty })
        .eq("id", productId);
    }

    let total = subtotal;

    if (body.discount_type === "percent") {
      total = subtotal - (subtotal * body.discount_value) / 100;
    }

    if (body.discount_type === "fixed") {
      total = subtotal - body.discount_value;
    }

    const totalAfterDiscount = Math.max(Number(total || 0), 0);
    const requestedRedeemPoints = Math.max(0, Math.floor(Number(body.loyalty_redeem_points || 0)));
    let appliedRedeemPoints = 0;
    let appliedRedeemAmount = 0;

    const requestedCustomerId = String(body?.customer?.id || "").trim();
    if (requestedRedeemPoints > 0 && requestedCustomerId) {
      let availablePoints = 0;
      try {
        availablePoints = await getLoyaltyPointsBalance(requestedCustomerId);
      } catch (error) {
        if (error instanceof Error && isMissingRelationError(error.message)) {
          availablePoints = await getLoyaltyPointsBalanceLegacyView(requestedCustomerId);
        } else {
          throw error;
        }
      }

      const maxRedeemAmountByCap = totalAfterDiscount * LOYALTY_REDEEM_MAX_RATIO;
      const maxByAmount = Math.floor(maxRedeemAmountByCap / LOYALTY_REDEEM_RM_PER_POINT);
      appliedRedeemPoints = Math.min(requestedRedeemPoints, availablePoints, maxByAmount);
      if (appliedRedeemPoints < LOYALTY_REDEEM_MIN_POINTS) {
        appliedRedeemPoints = 0;
      }
      appliedRedeemAmount = appliedRedeemPoints * LOYALTY_REDEEM_RM_PER_POINT;
    }

    total = Math.max(totalAfterDiscount - appliedRedeemAmount, 0);

    const balance =
      Number(body.cash_received || 0) - Number(total || 0);

    await supabase
      .from("orders")
      .update({
        subtotal,
        total,
        balance,
      })
      .eq("id", order.id);

    const linkedCustomerId = await upsertCustomerAndTrackOrder(body.customer, total);

    if (linkedCustomerId) {
      const earnPoints = Math.max(0, Math.floor(Number(total || 0) * LOYALTY_EARN_PER_RM));
      if (earnPoints > 0) {
        await writeLoyaltyLedgerEntry({
          customerId: linkedCustomerId,
          orderId: order.id,
          entryType: "earn",
          pointsChange: earnPoints,
          createdBy: auth.user.id,
          note: `Earn from order ${receiptNumber}`,
        });
      }

      if (appliedRedeemPoints > 0) {
        await writeLoyaltyLedgerEntry({
          customerId: linkedCustomerId,
          orderId: order.id,
          entryType: "redeem",
          pointsChange: -Math.abs(appliedRedeemPoints),
          createdBy: auth.user.id,
          note: `Redeem on order ${receiptNumber}`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      order_id: order.id,
      receipt_number: receiptNumber,
      loyalty: {
        redeemed_points: appliedRedeemPoints,
        redeemed_amount: appliedRedeemAmount,
      },
    });

  } catch (err) {
    console.log("SERVER ERROR:", err);
    return NextResponse.json({ success: false, error: err });
  }
}
