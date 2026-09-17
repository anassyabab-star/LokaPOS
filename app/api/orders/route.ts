import { NextResponse } from "next/server";
import { canonicalPhone } from "@/lib/phone";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";
import { sendPointsReceiptMessage } from "@/lib/whatsapp";
import { applyCustomerOrderPaidSettlement } from "@/lib/customer-order-payment";
import { calculateRedeem, getAvailablePoints, getLoyaltyConfig, redeemPointsAtomic } from "@/lib/loyalty";
import { statusOnPaid } from "@/lib/kds";
import { expireStaleUnpaidOrders } from "@/lib/order-expiry";
import { isMissingColumnError as isAnyMissingColumnError } from "@/lib/order-status";
import { myDateKey, nextReceiptNumber } from "@/lib/order-numbering";
import { normalizeOrderType, sanitizeTargetLabel, shortOrderNumber } from "@/lib/order-flow";

const supabase = createSupabaseAdminClient();

const ORDER_LIST_COLS =
  "id, receipt_number, customer_name, total, payment_method, payment_status, status, created_at, order_source";
const ORDER_LIST_FLOW_COLS = ORDER_LIST_COLS + ", order_type, table_number, buzzer_number, paid_at";

// ================= GET ORDERS (lightweight, for POS Orders tab) =================
export async function GET(req: Request) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 50), 200);
  const status = searchParams.get("status");
  const today = searchParams.get("today");

  // Best-effort sweep of expired "awaiting_payment" orders (throttled inside).
  try {
    await expireStaleUnpaidOrders();
  } catch {
    /* never block the list */
  }

  // `status` may be a single value or a comma list ("awaiting_payment,ready").
  const statuses =
    status && status !== "all"
      ? status.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
      : [];

  const buildQuery = (cols: string) => {
    let q = supabase.from("orders").select(cols).order("created_at", { ascending: false }).limit(limit);
    if (statuses.length === 1) q = q.eq("status", statuses[0]);
    else if (statuses.length > 1) q = q.in("status", statuses);
    // Today's orders only (POS frontend), keyed on the Malaysia business day.
    if (today === "1") q = q.eq("date_key", myDateKey());
    return q;
  };

  let { data, error } = await buildQuery(ORDER_LIST_FLOW_COLS);
  if (error && isAnyMissingColumnError(error.message)) {
    ({ data, error } = await buildQuery(ORDER_LIST_COLS));
  }
  if (error) {
    return NextResponse.json({ orders: [], error: error.message }, { status: 500 });
  }

  type ListRow = { id: string; receipt_number: string | null; [key: string]: unknown };
  const orders = ((data || []) as unknown as ListRow[]).map(row => ({
    order_type: null,
    table_number: null,
    buzzer_number: null,
    paid_at: null,
    ...row,
    short_number: shortOrderNumber(row.receipt_number, row.id),
  }));

  return NextResponse.json({ orders });
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

function normalizePhone(value: string) {
  return canonicalPhone(value);
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

// Resolves/creates the customer profile (name, phone, consents) for an order.
// Order stats (total_orders/total_spend/last_order_at) and loyalty earn are
// handled exclusively by applyCustomerOrderPaidSettlement to avoid double-count.
async function upsertCustomerAndTrackOrder(payload: CustomerPayload | undefined) {
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
        updated_at: nowIso,
      })
      .eq("id", existing.id);
    if (updateErr) console.error("[orders] Customer update failed:", updateErr.message);
    return existing.id;
  }

  const { data: inserted, error: insertErr } = await supabase.from("customers").insert([
    {
      name: name || "Walk-in Customer",
      phone,
      email,
      consent_whatsapp: consentWhatsapp,
      consent_email: consentEmail,
      consent_whatsapp_at: consentWhatsapp ? nowIso : null,
      consent_email_at: consentEmail ? nowIso : null,
      total_orders: 0,
      total_spend: 0,
      updated_at: nowIso,
    },
  ]).select("id").single();

  if (insertErr) {
    // Race condition: concurrent order created this customer — look them up
    const isUniqueViolation = String(insertErr.code) === "23505"
      || String(insertErr.message).toLowerCase().includes("unique")
      || String(insertErr.message).toLowerCase().includes("duplicate");
    if (isUniqueViolation) {
      const found = await findExistingCustomer(email, phone);
      return found?.id || null;
    }
    console.error("[orders] Customer insert failed:", insertErr.message);
    return null;
  }

  return inserted?.id || null;
}

export async function POST(req: Request) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  let b1f1Reserved = false;
  let b1f1Phone = "";

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
    const dateKey = myDateKey();

    // Atomic receipt number — same daily sequence as customer-web orders.
    const receiptNumber = await nextReceiptNumber(dateKey);

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

    // POS orders are paid at the counter, at creation. statusOnPaid() puts them
    // in the KDS BARU lane ("pending") or straight at "completed" when KDS is off.
    const paidStatus = await statusOnPaid();
    const posTable = sanitizeTargetLabel(body.table_number);
    const posBuzzer = sanitizeTargetLabel(body.buzzer_number);
    const posOrderType = normalizeOrderType(body.order_type) ?? (posTable ? "dine_in" : null);

    const orderInsertBasePayload = {
      receipt_number: receiptNumber,
      date_key: dateKey,
      customer_name: String(body.customer_name || "Walk-in"),
      subtotal: 0,
      discount_type: body.discount_type || "none",
      discount_value: Number(body.discount_value || 0),
      total: 0,
      payment_method: body.payment_method || "cash",
      cash_received: Number(body.cash_received || 0),
      balance: 0,
      status: paidStatus,
      payment_status: "paid",
    };
    const orderFlowPayload = {
      paid_at: new Date().toISOString(),
      order_type: posOrderType,
      table_number: posOrderType === "take_away" ? null : posTable,
      buzzer_number: posBuzzer,
    };

    let orderInsert = await supabase
      .from("orders")
      .insert([{ ...orderInsertBasePayload, ...orderFlowPayload, order_source: "pos" }])
      .select()
      .single();

    // Pre-migration DBs: retry without the pay-at-counter columns, then without order_source.
    if (orderInsert.error && isAnyMissingColumnError(orderInsert.error.message)) {
      orderInsert = await supabase
        .from("orders")
        .insert([{ ...orderInsertBasePayload, order_source: "pos" }])
        .select()
        .single();
      if (orderInsert.error && isMissingColumnError(orderInsert.error.message, "order_source")) {
        orderInsert = await supabase
          .from("orders")
          .insert([orderInsertBasePayload])
          .select()
          .single();
      }
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
        const customPrice = Math.max(0, Number(item.price || 0));
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

    // B1F1 promo — atomic insert-first to prevent race condition double-redeem
    b1f1Phone = canonicalPhone(body?.b1f1_phone);
    let b1f1DiscountApplied = 0;

    if (b1f1Phone) {
      // Try to atomically reserve the redemption slot (unique constraint prevents double)
      const { data: reserved, error: reserveErr } = await supabase
        .from("member_promo_redemptions")
        .insert({ phone: b1f1Phone, promo_code: "B1F1_KOPI", order_id: null })
        .select("id")
        .maybeSingle();

      if (!reserveErr && reserved?.id) {
        b1f1Reserved = true;
        const MAX_B1F1 = 50;
        const requested = Math.max(0, Number(body.b1f1_discount_amount || 0));
        b1f1DiscountApplied = Math.min(requested, total, MAX_B1F1);
        total = Math.max(total - b1f1DiscountApplied, 0);
      }
      // If reserveErr (unique violation = already redeemed or concurrent request) → skip discount
    }

    const config = await getLoyaltyConfig();
    const totalAfterDiscount = Math.max(Number(total || 0), 0);

    // Resolve/link the customer profile (no stats bump — settlement owns that).
    const linkedCustomerId = await upsertCustomerAndTrackOrder(body.customer);

    if (linkedCustomerId) {
      const { error: linkCustomerError } = await supabase
        .from("orders")
        .update({ customer_id: linkedCustomerId })
        .eq("id", order.id);

      if (linkCustomerError && !isMissingRelationError(linkCustomerError.message)) {
        throw linkCustomerError;
      }
    }

    // ── Loyalty redeem: compute (config-driven, identical to PWA) then
    //    deduct atomically so concurrent orders can't overspend points. ──
    const requestedRedeemPoints = Math.max(0, Math.floor(Number(body.loyalty_redeem_points || 0)));
    let appliedRedeemPoints = 0;
    let appliedRedeemAmount = 0;

    if (requestedRedeemPoints > 0 && linkedCustomerId) {
      let availablePoints = 0;
      try {
        availablePoints = await getAvailablePoints(linkedCustomerId, config);
      } catch (error) {
        if (error instanceof Error && isMissingRelationError(error.message)) {
          availablePoints = await getLoyaltyPointsBalanceLegacyView(linkedCustomerId);
        } else {
          throw error;
        }
      }

      const redeem = calculateRedeem(requestedRedeemPoints, availablePoints, totalAfterDiscount, config);
      if (redeem.redeem_points > 0) {
        const redeemResult = await redeemPointsAtomic({
          customerId: linkedCustomerId,
          points: redeem.redeem_points,
          orderId: order.id,
          source: "order",
          note: `Redeem on order ${receiptNumber}`,
          eventKey: `redeem:${order.id}`,
        });
        if (redeemResult.ok) {
          appliedRedeemPoints = redeem.redeem_points;
          appliedRedeemAmount = redeem.redeem_amount;
        }
      }
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

    // Link B1F1 reservation to the completed order
    if (b1f1Reserved) {
      await supabase
        .from("member_promo_redemptions")
        .update({ order_id: order.id })
        .eq("phone", b1f1Phone)
        .eq("promo_code", "B1F1_KOPI")
        .is("order_id", null);
    }

    if (linkedCustomerId) {
      // Earn + stats + referral via the single shared settlement (idempotent).
      let earnPoints = 0;
      try {
        const settlement = await applyCustomerOrderPaidSettlement(
          {
            id: order.id,
            customer_id: linkedCustomerId,
            receipt_number: receiptNumber,
            total,
            discount_value: Number(body.discount_value || 0),
          },
          auth.user.id
        );
        earnPoints = settlement.earned;
      } catch (settleErr) {
        console.error("[orders] Loyalty settlement failed:", settleErr);
      }

      // ── WhatsApp loyalty notification ─────────────────────
      if (earnPoints > 0 || appliedRedeemPoints > 0) {
        try {
          const customerPhone = normalizePhone(String(body?.customer?.phone || "").trim());
          const customerConsentWa = body?.customer?.consent_whatsapp === true;

          if (customerPhone && customerConsentWa) {
            let newBalance = 0;
            try {
              newBalance = await getAvailablePoints(linkedCustomerId, config);
            } catch {
              newBalance = await getLoyaltyPointsBalanceLegacyView(linkedCustomerId);
            }

            const storeName = String(process.env.STORE_NAME || "Loka");
            const balanceNum = Number(newBalance || 0);
            const redeemRm = (balanceNum * config.redeemRmPerPoint).toFixed(2);
            const custName = String(body?.customer_name || "").trim();

            const nowMyt = new Date();
            const fmtDate = (d: Date) =>
              d.toLocaleDateString("ms-MY", {
                timeZone: "Asia/Kuala_Lumpur",
                day: "numeric",
                month: "short",
                year: "numeric",
              });
            const purchaseDate = fmtDate(nowMyt);
            const expiryDate = fmtDate(
              new Date(nowMyt.getTime() + config.expiryDays * 24 * 60 * 60 * 1000)
            );

            let msg = `Terima kasih${custName ? `, ${custName}` : ""}! 🎉\n\n`;
            msg += `📅 ${purchaseDate}\n`;
            msg += `Pembelian: RM ${Number(total).toFixed(2)}\n`;
            if (earnPoints > 0) msg += `Points diterima: +${earnPoints} pts ✅\n`;
            if (appliedRedeemPoints > 0) msg += `Points ditukar: -${appliedRedeemPoints} pts\n`;
            msg += `\n🏆 *Jumlah points: ${balanceNum} pts*\n`;
            msg += `_(Boleh ditukar: RM ${redeemRm})_\n`;
            msg += `⏳ _Luput: ${expiryDate}_\n\n`;
            msg += `— ${storeName}`;

            const pointsLine = [
              earnPoints > 0 ? `Points diterima: +${earnPoints} pts` : "",
              appliedRedeemPoints > 0 ? `Points ditukar: -${appliedRedeemPoints} pts` : "",
            ].filter(Boolean).join(" · ");
            await sendPointsReceiptMessage({
              to: customerPhone,
              name: custName || "Customer",
              purchaseDate,
              amount: Number(total).toFixed(2),
              pointsLine: pointsLine || "-",
              balancePoints: String(balanceNum),
              balanceRm: redeemRm,
              expiryDate,
              storeName,
              text: msg,
            });
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
    // Clean up dangling B1F1 reservation if order failed after atomic insert
    if (b1f1Reserved && b1f1Phone) {
      await supabase
        .from("member_promo_redemptions")
        .delete()
        .eq("phone", b1f1Phone)
        .eq("promo_code", "B1F1_KOPI")
        .is("order_id", null);
    }
    return NextResponse.json({ success: false, error: errMsg });
  }
}
