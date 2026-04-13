import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";
import { sendMurpatiText } from "@/app/api/admin/campaigns/murpati";

const supabase = createSupabaseAdminClient();

// ================= GET ORDERS (lightweight, for POS Orders tab) =================
export async function GET(req: Request) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 50), 200);
  const status = searchParams.get("status");
  const today = searchParams.get("today");

  let query = supabase
    .from("orders")
    .select("id, receipt_number, customer_name, total, payment_method, payment_status, status, created_at, order_source")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  // Filter today's orders only (for POS frontend) using actual current date.
  if (today === "1") {
    const now = new Date();
    const year = now.toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", year: "numeric" });
    const month = now.toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", month: "2-digit" });
    const day = now.toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit" });
    const dateKey = `${year}-${month}-${day}`;
    query = query.eq("date_key", dateKey);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ orders: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: data || [] });
}

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
const LOYALTY_REDEEM_MIN_POINTS = 50;
const LOYALTY_REDEEM_MAX_RATIO = 0.5; // max 50% of order total
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

function isMissingColumnError(message: string | null | undefined, column: string) {
  const m = String(message || "").toLowerCase();
  const col = column.toLowerCase();
  return (
    (m.includes("could not find") && m.includes(col)) ||
    (m.includes("column") && m.includes(col) && m.includes("does not exist"))
  );
}

async function insertOrderItemAddons(
  orderItemId: string,
  addonSnapshots: Array<{ id: string; name: string; price: number }>
) {
  if (!addonSnapshots.length) return;

  const payloadVariants = [
    addonSnapshots.map(addon => ({
      order_item_id: orderItemId,
      addon_id: addon.id,
      addon_name_snapshot: addon.name,
      addon_price_snapshot: addon.price,
    })),
    addonSnapshots.map(addon => ({
      order_item_id: orderItemId,
      addon_id: addon.id,
    })),
    addonSnapshots.map(addon => ({
      order_item: orderItemId,
      addon_id: addon.id,
      addon_name_snapshot: addon.name,
      addon_price_snapshot: addon.price,
    })),
    addonSnapshots.map(addon => ({
      order_item: orderItemId,
      addon_id: addon.id,
    })),
    addonSnapshots.map(addon => ({
      order_items_id: orderItemId,
      addon_id: addon.id,
    })),
  ];

  let lastError: { message?: string | null } | null = null;
  for (const payload of payloadVariants) {
    const { error } = await supabase.from("order_item_addons").insert(payload);
    if (!error) return;
    lastError = error;
    if (!isMissingRelationError(error.message)) break;
  }

  if (lastError) {
    console.warn("Failed to insert order item addons:", lastError.message || "Unknown error");
  }
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

    const { error: updateErr } = await supabase
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
    if (updateErr) console.error("[orders] Customer update failed:", updateErr.message);
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
      .select("id, opened_at")
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

    // Use actual order date (not shift opening date) so receipt numbers and
    // reports reflect the real business day each order was placed.
    const now = new Date();
    const _y = now.toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", year: "numeric" });
    const _m = now.toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", month: "2-digit" });
    const _d = now.toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit" });
    const dateKey = `${_y}-${_m}-${_d}`;

    const { count } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("date_key", dateKey);

    const orderNumber = (count || 0) + 1;
    const formattedNumber = String(orderNumber).padStart(3, "0");

    const datePart = `${_d}${_m}${_y}`;

    const receiptNumber = `${datePart}-${formattedNumber}`;

    let subtotal = 0;

    // CHECK STOCK (skip custom keypad items)
    for (const item of body.items) {
      const productId = item.product_id;
      if (productId === "custom") continue;

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

      const itemQty = Math.floor(Number(item.qty));
      if (!Number.isFinite(itemQty) || itemQty <= 0) {
        return NextResponse.json({ success: false, error: `Invalid quantity for ${product.name}` });
      }
      if ((product.stock || 0) < itemQty) {
        return NextResponse.json({
          success: false,
          error: `Stock not enough for ${product.name}`,
        });
      }
    }

    const orderInsertBasePayload = {
      receipt_number: receiptNumber,
      date_key: dateKey,
      customer_name: body.customer_name,
      subtotal: 0,
      discount_type: body.discount_type || null,
      discount_value: body.discount_value !== "" && body.discount_value != null ? Number(body.discount_value) : null,
      total: 0,
      payment_method: body.payment_method,
      cash_received: body.cash_received,
      balance: 0,
      status: "pending",
      payment_status: "paid",
    };

    let orderInsert = await supabase
      .from("orders")
      .insert([
        {
          ...orderInsertBasePayload,
          order_source: "pos",
        },
      ])
      .select()
      .single();

    if (orderInsert.error && isMissingColumnError(orderInsert.error.message, "order_source")) {
      orderInsert = await supabase
        .from("orders")
        .insert([orderInsertBasePayload])
        .select()
        .single();
    }

    const { data: order, error } = orderInsert;

    if (error || !order) {
      console.error("[orders] Order insert failed:", error);
      return NextResponse.json({ success: false, error: error?.message || "Gagal simpan order" });
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

      // Handle custom keypad amounts (no real product)
      if (productId === "custom") {
        const customPrice = Number(item.price || 0);
        const customQty = Number(item.qty || 1);
        const lineTotal = customPrice * customQty;
        subtotal += lineTotal;

        const customPayload = {
          order_id: order.id,
          product_id: null as string | null,
          product_name_snapshot: snapshotName || "Custom amount",
          variant_id: null,
          sugar_level: null,
          price: customPrice,
          qty: customQty,
          line_total: lineTotal,
        };

        await supabase.from("order_items").insert([customPayload]);
        continue;
      }

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

      const orderItemPayload = {
        order_id: order.id,
        product_id: productId,
        product_name_snapshot: snapshotName || product.name,
        variant_id: variantId || null,
        sugar_level: item.sugar_level || null,
        price,
        qty: item.qty,
        line_total: lineTotal,
      };

      let orderItemResult = await supabase
        .from("order_items")
        .insert([orderItemPayload])
        .select("id")
        .single();

      if (orderItemResult.error && isMissingRelationError(orderItemResult.error.message)) {
        const { sugar_level: omittedSugarLevel, ...legacyPayload } = orderItemPayload;
        void omittedSugarLevel;
        orderItemResult = await supabase
          .from("order_items")
          .insert([legacyPayload])
          .select("id")
          .single();
      }

      if (orderItemResult.error) {
        throw orderItemResult.error;
      }
      const orderItem = orderItemResult.data;

      if (orderItem && addonSnapshots.length > 0) {
        await insertOrderItemAddons(orderItem.id, addonSnapshots);
      }

      // Atomic stock decrement (race-condition safe)
      const qty = Number(item.qty || 1);
      const { error: rpcError } = await supabase.rpc("decrement_stock", {
        p_product_id: productId,
        p_qty: qty,
      });
      if (rpcError) {
        // Fallback to non-atomic if RPC not yet deployed
        if (rpcError.message?.includes("does not exist") || rpcError.message?.includes("schema cache")) {
          await supabase
            .from("products")
            .update({ stock: Math.max((product.stock || 0) - qty, 0) })
            .eq("id", productId);
        }
        // Ignore other RPC errors (e.g. insufficient stock already checked above)
      }
    }

    let total = subtotal;

    if (body.discount_type === "percent") {
      const pct = Math.min(Math.max(Number(body.discount_value || 0), 0), 100);
      total = subtotal - (subtotal * pct) / 100;
    }

    if (body.discount_type === "fixed") {
      const fixed = Math.min(Math.max(Number(body.discount_value || 0), 0), subtotal);
      total = subtotal - fixed;
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
      const { error: linkCustomerError } = await supabase
        .from("orders")
        .update({ customer_id: linkedCustomerId })
        .eq("id", order.id);

      if (linkCustomerError && !isMissingRelationError(linkCustomerError.message)) {
        throw linkCustomerError;
      }
    }

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

      // ── WhatsApp loyalty notification ─────────────────────
      if (earnPoints > 0 || appliedRedeemPoints > 0) {
        try {
          const customerPhone = normalizePhone(String(body?.customer?.phone || "").trim());
          const customerConsentWa = body?.customer?.consent_whatsapp === true;

          if (customerPhone && customerConsentWa) {
            let newBalance = 0;
            try {
              newBalance = await getLoyaltyPointsBalance(linkedCustomerId);
            } catch {
              newBalance = await getLoyaltyPointsBalanceLegacyView(linkedCustomerId);
            }

            const storeName = String(process.env.STORE_NAME || "Loka");
            const balanceNum = Number(newBalance || 0);
            const redeemRm = (balanceNum * LOYALTY_REDEEM_RM_PER_POINT).toFixed(2);
            const custName = String(body?.customer_name || "").trim();

            let msg = `Terima kasih${custName ? `, ${custName}` : ""}! 🎉\n\n`;
            msg += `Pembelian: RM ${Number(total).toFixed(2)}\n`;
            if (earnPoints > 0) msg += `Points diterima: +${earnPoints} pts ✅\n`;
            if (appliedRedeemPoints > 0) msg += `Points ditukar: -${appliedRedeemPoints} pts\n`;
            msg += `\n🏆 *Jumlah points: ${balanceNum} pts*\n`;
            msg += `_(Boleh ditukar: RM ${redeemRm})_\n\n`;
            msg += `— ${storeName}`;

            console.log("[orders] Sending loyalty WA to", customerPhone, "| msg:", msg);
            await sendMurpatiText({ to: customerPhone, message: msg });
          }
        } catch (waErr) {
          // Never fail the order if WhatsApp fails
          console.error("[orders] Loyalty WhatsApp failed:", waErr);
        }
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
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("SERVER ERROR:", err);
    return NextResponse.json({ success: false, error: errMsg });
  }
}
