import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";
import {
  calculateCustomerOrderItems,
  generateOrderNumber,
  insertOrderItemAddonsWithFallback,
} from "@/lib/customer-orders";
import { createChipPurchase, getChipConfigStatus } from "@/lib/chip";
import { normalizeWhatsAppTo, sendOrderReceivedMessage } from "@/lib/whatsapp";
import {
  applyReferralOnSignup,
  calculateRedeem,
  ensureReferralCode,
  getAvailablePoints,
  getLoyaltyConfig,
  redeemPointsAtomic,
} from "@/lib/loyalty";
import { normalizeOtpPhone, requirePhoneOtp } from "@/lib/phone-otp";
import { loadRedeemableCoupon } from "@/lib/coupons";
import { canonicalPhone, phoneVariants } from "@/lib/phone";
import { computeVoucherDiscount, type CartItemLite } from "@/lib/rewards-vouchers";
import { normalizeOrderType, sanitizeTargetLabel, shortOrderNumber } from "@/lib/order-flow";
import { isMissingColumnError } from "@/lib/order-status";

type ItemAddonRow = {
  order_item_id?: string | null;
  order_item?: string | null;
  order_items_id?: string | null;
  addon_name_snapshot?: string | null;
  addon_name?: string | null;
  name?: string | null;
  addon_id?: string | null;
};

function pickAddonItemId(row: ItemAddonRow) {
  return String(row.order_item_id || row.order_item || row.order_items_id || "").trim();
}
function pickAddonName(row: ItemAddonRow) {
  return String(row.addon_name_snapshot || row.addon_name || row.name || "").trim();
}
function couponErrorMessage(
  reason: "disabled" | "not_found" | "wrong_customer" | "expired" | "used"
): string {
  switch (reason) {
    case "disabled": return "Coupons aren't active right now.";
    case "not_found": return "Invalid coupon code.";
    case "wrong_customer": return "This coupon belongs to a different phone number.";
    case "expired": return "This coupon has expired.";
    case "used": return "This coupon has already been used.";
    default: return "Invalid coupon.";
  }
}

function formatSugarLevel(value: string | null | undefined) {
  const key = String(value || "").toLowerCase();
  if (!key || key === "null") return null;
  if (key === "normal") return "Normal Sugar";
  if (key === "less") return "Less Sugar";
  if (key === "half") return "Half Sugar";
  if (key === "none") return "No Sugar";
  return key;
}

export async function GET(req: Request) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("order_id");

  if (!orderId) {
    return NextResponse.json({ error: "order_id required" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    // Fetch order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, receipt_number, created_at, customer_name, payment_method, subtotal, discount_value, total, status")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    // Fetch items — try with sugar_level first, fallback without it
    let items: Array<{ id: string; product_name_snapshot: string | null; variant_id: string | null; sugar_level: string | null; price: number | null; qty: number | null; line_total: number | null }> = [];

    const { data: itemRows, error: itemsError } = await supabase
      .from("order_items")
      .select("id, product_name_snapshot, variant_id, sugar_level, price, qty, line_total")
      .eq("order_id", orderId);

    if (itemsError) {
      // sugar_level column might not exist — retry without it
      const { data: fallbackRows, error: fallbackError } = await supabase
        .from("order_items")
        .select("id, product_name_snapshot, variant_id, price, qty, line_total")
        .eq("order_id", orderId);

      if (fallbackError) return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      items = (fallbackRows || []).map((r: { id: string; product_name_snapshot: string | null; variant_id: string | null; price: number | null; qty: number | null; line_total: number | null }) => ({ ...r, sugar_level: null }));
    } else {
      items = (itemRows || []) as typeof items;
    }

    // Fetch variant names
    const variantIds = Array.from(new Set(items.map((i: { variant_id: string | null }) => i.variant_id).filter(Boolean))) as string[];
    const variantNameById = new Map<string, string>();
    if (variantIds.length > 0) {
      try {
        const { data: variants } = await supabase.from("product_variants").select("id, name").in("id", variantIds);
        for (const v of variants || []) variantNameById.set(v.id, v.name);
      } catch {
        // product_variants table might not exist — skip
      }
    }

    // Fetch addons (wrapped in try-catch — table might not exist)
    const itemIds = items.map((i: { id: string }) => i.id);
    let addonRows: ItemAddonRow[] = [];
    if (itemIds.length > 0) {
      try {
        const { data: rows, error: err } = await supabase.from("order_item_addons").select("*").in("order_item_id", itemIds);
        if (err) {
          const { data: fb } = await supabase.from("order_item_addons").select("*").in("order_item", itemIds);
          addonRows = (fb || []) as ItemAddonRow[];
        } else {
          addonRows = (rows || []) as ItemAddonRow[];
        }
      } catch {
        // order_item_addons table might not exist — skip addons silently
        addonRows = [];
      }
    }

    // Resolve missing addon names (skip if no addons)
    const missingIds = Array.from(new Set(addonRows.filter(r => !pickAddonName(r)).map(r => String(r.addon_id || "").trim()).filter(Boolean)));
    const addonNameById = new Map<string, string>();
    if (missingIds.length > 0) {
      try {
        const { data: names } = await supabase.from("product_addons").select("id, name").in("id", missingIds);
        for (const n of names || []) addonNameById.set(String(n.id), String(n.name || ""));
      } catch {
        // skip
      }
    }

    const addonsByItemId = new Map<string, string[]>();
    for (const row of addonRows) {
      const id = pickAddonItemId(row);
      if (!id) continue;
      const list = addonsByItemId.get(id) || [];
      const name = pickAddonName(row) || addonNameById.get(String(row.addon_id || "").trim()) || "";
      if (name) list.push(name);
      addonsByItemId.set(id, list);
    }

    const enrichedItems = items.map((item: { id: string; product_name_snapshot: string | null; variant_id: string | null; sugar_level: string | null; price: number | null; qty: number | null; line_total: number | null }) => {
      const variantName = item.variant_id ? variantNameById.get(item.variant_id) || null : null;
      const addons = addonsByItemId.get(item.id) || [];
      return {
        name: item.product_name_snapshot || "Item",
        variant_name: variantName,
        addon_names: addons,
        sugar_level: formatSugarLevel(item.sugar_level),
        price: Number(item.price || 0),
        qty: Number(item.qty || 0),
        line_total: Number(item.line_total || 0),
      };
    });

    return NextResponse.json({
      order: {
        id: order.id,
        receipt_number: order.receipt_number,
        created_at: order.created_at,
        customer_name: order.customer_name,
        payment_method: order.payment_method,
        subtotal: Number(order.subtotal || 0),
        discount_value: Number(order.discount_value || 0),
        total: Number(order.total || 0),
        status: order.status,
      },
      items: enrichedItems,
    });
  } catch (error) {
    console.error("POS order detail error:", error);
    const message = error instanceof Error ? error.message : "Failed to load order detail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── PUBLIC: Guest order creation (no auth required) ──────────────────────────
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const customerName = String(body.customer_name || "").trim();
  const customerPhone = String(body.customer_phone || "").trim();
  const paymentMethod = String(body.payment_method || "fpx").trim().toLowerCase();
  // Dine In (table from the scanned QR) or Take Away. The cashier can still
  // change these when collecting payment.
  const requestedTable = sanitizeTargetLabel(body.table_number);
  const orderType = normalizeOrderType(body.order_type) ?? (requestedTable ? "dine_in" : null);
  const tableNumber = orderType === "take_away" ? null : requestedTable;
  const paysAtCounter = paymentMethod === "cash";

  if (!customerName) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!customerPhone || customerPhone.replace(/[^\d]/g, "").length < 8) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }
  const requestItems = Array.isArray(body.items) ? body.items : null;
  if (!requestItems || requestItems.length === 0) {
    return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    // Reject orders when store has no open shift (store is closed)
    const { data: openShift } = await supabase
      .from("pos_shifts")
      .select("id")
      .eq("register_id", "main")
      .eq("status", "open")
      .limit(1)
      .maybeSingle();

    if (!openShift) {
      return NextResponse.json(
        { error: "We're closed right now. Please try again during opening hours.", store_closed: true },
        { status: 503 }
      );
    }

    const parsedItems = (requestItems as Record<string, unknown>[]).map(raw => ({
      product_id: String(raw.product_id || "").trim(),
      variant_id: String(raw.variant_id || "").trim() || null,
      addon_ids: Array.isArray(raw.addon_ids)
        ? (raw.addon_ids as unknown[]).map(v => String(v || "").trim()).filter(Boolean)
        : [],
      sugar_level: String(raw.sugar_level || "").trim() || null,
      qty: Number(raw.qty || 0),
    }));

    const calculated = await calculateCustomerOrderItems(parsedItems);
    const numbering = await generateOrderNumber();

    // Find or create customer by phone. Match every legacy shape of the same
    // number ("60…", "+60…", bare digits) so an existing customer is never
    // duplicated, but always store the canonical "0…" form.
    const normalizedPhone = canonicalPhone(customerPhone);
    const { data: phoneMatches } = await supabase
      .from("customers")
      .select("id, phone, consent_whatsapp, total_orders")
      .in("phone", phoneVariants(customerPhone))
      .order("total_orders", { ascending: false })
      .limit(5);
    // Prefer the row with the most history if legacy duplicates still exist.
    const existingCustomer = (phoneMatches || [])[0] || null;
    if (existingCustomer && existingCustomer.phone !== normalizedPhone) {
      await supabase.from("customers").update({ phone: normalizedPhone }).eq("id", existingCustomer.id);
    }

    let customerId: string | null = existingCustomer?.id || null;
    const isNewCustomer = !customerId;
    const referralCode = String(body.referral_code || "").trim();

    if (!customerId) {
      const { data: newCustomer } = await supabase
        .from("customers")
        .insert([{ name: customerName, phone: normalizedPhone, consent_whatsapp: true }])
        .select("id")
        .maybeSingle();
      customerId = newCustomer?.id || null;
    } else if (!existingCustomer?.consent_whatsapp) {
      await supabase.from("customers").update({ consent_whatsapp: true }).eq("id", customerId);
    }

    if (customerId) {
      // Give every customer a referral code, and record who referred them.
      await ensureReferralCode(customerId);
      if (isNewCustomer && referralCode) {
        await applyReferralOnSignup(customerId, referralCode);
      }
    }

    // ── Loyalty redeem (OTP-gated): use points as a direct checkout discount ──
    // Spending points requires a verified phone session — otherwise anyone who
    // knows a phone number could drain that customer's balance. We resolve the
    // applied points here (config-driven, identical maths to POS), then commit
    // the deduction atomically AFTER the order row exists.
    const requestedRedeemPoints = Math.max(0, Math.floor(Number(body.redeem_points || 0)));
    const loyaltyConfig = await getLoyaltyConfig();
    let resolvedRedeemPoints = 0;
    let resolvedRedeemAmount = 0;
    if (requestedRedeemPoints > 0 && customerId) {
      const otpPhone = normalizeOtpPhone(customerPhone);
      const guard = requirePhoneOtp(req, otpPhone);
      if (!guard.ok) return guard.response;
      const availablePoints = await getAvailablePoints(customerId, loyaltyConfig);
      const redeem = calculateRedeem(
        requestedRedeemPoints,
        availablePoints,
        calculated.subtotal,
        loyaltyConfig
      );
      resolvedRedeemPoints = redeem.redeem_points;
      resolvedRedeemAmount = redeem.redeem_amount;
    }

    // ── Coupon (mutually exclusive with points — one benefit per order) ──
    const couponCode = String(body.coupon_code || "").trim().toUpperCase();
    if (couponCode && requestedRedeemPoints > 0) {
      return NextResponse.json(
        { error: "Only one discount per order — points OR a coupon." },
        { status: 400 }
      );
    }
    let resolvedCoupon: { code: string; discount: number } | null = null;
    if (couponCode && customerId) {
      const loaded = await loadRedeemableCoupon(couponCode, customerId);
      if (!loaded.ok) {
        return NextResponse.json({ error: couponErrorMessage(loaded.reason) }, { status: 400 });
      }
      // Category-scoped coupons need product → category.
      let categoryByProductId: Map<string, string | null> | undefined;
      if (loaded.voucher.reward_category_id) {
        const productIds = Array.from(
          new Set(calculated.items.map(i => i.product_id).filter(Boolean))
        ) as string[];
        categoryByProductId = new Map();
        if (productIds.length > 0) {
          const { data: prodRows } = await supabase
            .from("products")
            .select("id,category_id")
            .in("id", productIds);
          for (const p of prodRows || []) {
            categoryByProductId.set(String(p.id), p.category_id ? String(p.category_id) : null);
          }
        }
      }
      const cartItems: CartItemLite[] = calculated.items.map(i => ({
        product_id: i.product_id,
        line_total: Number(i.line_total || 0),
      }));
      const discount = computeVoucherDiscount(
        loaded.voucher,
        cartItems,
        calculated.subtotal,
        categoryByProductId
      );
      if (discount <= 0) {
        return NextResponse.json(
          { error: "This coupon can't be used for this order." },
          { status: 400 }
        );
      }
      resolvedCoupon = { code: couponCode, discount };
    }

    const orderBase = {
      receipt_number: numbering.orderNumber,
      date_key: numbering.dateKey,
      customer_name: customerName,
      customer_id: customerId,
      subtotal: calculated.subtotal,
      discount_type: "none",
      discount_value: 0,
      total: calculated.subtotal,
      payment_method: paymentMethod,
      cash_received: 0,
      balance: 0,
      // Nothing reaches the kitchen until it is paid: at the counter (cashier
      // "Terima Bayaran") or via the online-payment callback.
      status: "awaiting_payment",
      payment_status: "pending",
    };
    const orderFlow = {
      order_type: orderType,
      table_number: tableNumber,
      buzzer_number: null,
    };

    let orderInsert = await supabase
      .from("orders")
      .insert([{ ...orderBase, ...orderFlow, order_source: "customer_web" }])
      .select("id")
      .single();

    // Pre-migration DBs: retry without the pay-at-counter columns, then without order_source.
    if (orderInsert.error && isMissingColumnError(orderInsert.error.message)) {
      orderInsert = await supabase
        .from("orders")
        .insert([{ ...orderBase, order_source: "customer_web" }])
        .select("id")
        .single();
      if (orderInsert.error?.message?.toLowerCase().includes("order_source")) {
        orderInsert = await supabase.from("orders").insert([orderBase]).select("id").single();
      }
    }

    const { data: order, error: orderError } = orderInsert;
    if (orderError || !order) {
      return NextResponse.json({ error: orderError?.message || "Couldn't place the order" }, { status: 500 });
    }

    // RESERVE the loyalty points now (atomic, advisory-locked) and only apply the
    // discount if the deduction succeeds. Deducting at creation — rather than
    // deferring to payment — closes the free-discount window (a customer can't
    // spend the same points elsewhere between create and pay) and the RPC's
    // serialization prevents concurrent double-spend. If the order is later
    // voided/refunded, reverseOrderLoyalty returns these points.
    let finalTotal = calculated.subtotal;
    let appliedRedeemPoints = 0;
    let appliedRedeemAmount = 0;
    let appliedCouponCode: string | null = null;
    let appliedCouponDiscount = 0;
    if (resolvedRedeemPoints > 0 && customerId) {
      const redeemResult = await redeemPointsAtomic({
        customerId,
        points: resolvedRedeemPoints,
        orderId: order.id,
        source: "order",
        note: `Redeem on order ${numbering.orderNumber}`,
        eventKey: `redeem:${order.id}`,
      });
      if (redeemResult.ok) {
        appliedRedeemPoints = resolvedRedeemPoints;
        appliedRedeemAmount = resolvedRedeemAmount;
        finalTotal = Math.max(0, calculated.subtotal - appliedRedeemAmount);
        await supabase
          .from("orders")
          .update({
            discount_type: "fixed",
            discount_value: appliedRedeemAmount,
            total: finalTotal,
          })
          .eq("id", order.id);
      }
      // !ok (insufficient / lost race) → charge full price, no discount granted.
    } else if (resolvedCoupon && customerId) {
      // Atomically redeem the coupon voucher, then apply its discount. If the
      // redeem loses a race (already used), the customer just pays full price.
      const { error: couponRedeemErr } = await supabase.rpc("redeem_voucher_code", {
        p_code: resolvedCoupon.code,
        p_order_id: order.id,
      });
      if (!couponRedeemErr) {
        appliedCouponCode = resolvedCoupon.code;
        appliedCouponDiscount = resolvedCoupon.discount;
        finalTotal = Math.max(0, calculated.subtotal - appliedCouponDiscount);
        await supabase
          .from("orders")
          .update({
            discount_type: "coupon",
            discount_value: appliedCouponDiscount,
            total: finalTotal,
          })
          .eq("id", order.id);
      }
    }

    for (const item of calculated.items) {
      let itemInsert = await supabase
        .from("order_items")
        .insert([{
          order_id: order.id,
          product_id: item.product_id,
          product_name_snapshot: item.product_name_snapshot,
          variant_id: item.variant_id,
          sugar_level: item.sugar_level,
          price: item.unit_price,
          qty: item.qty,
          line_total: item.line_total,
        }])
        .select("id")
        .single();

      if (itemInsert.error?.message?.toLowerCase().includes("sugar_level")) {
        itemInsert = await supabase
          .from("order_items")
          .insert([{
            order_id: order.id,
            product_id: item.product_id,
            product_name_snapshot: item.product_name_snapshot,
            variant_id: item.variant_id,
            price: item.unit_price,
            qty: item.qty,
            line_total: item.line_total,
          }])
          .select("id")
          .single();
      }

      if (itemInsert.error) {
        return NextResponse.json({ error: itemInsert.error.message }, { status: 500 });
      }

      if (itemInsert.data && item.addon_snapshots.length > 0) {
        await insertOrderItemAddonsWithFallback(itemInsert.data.id, item.addon_snapshots);
      }
    }

    // Decrement stock
    for (const [productId, requestedQty] of calculated.requestedQtyByProductId.entries()) {
      const { error: rpcError } = await supabase.rpc("decrement_stock", {
        p_product_id: productId,
        p_qty: requestedQty,
      });
      if (rpcError && (rpcError.message?.includes("does not exist") || rpcError.message?.includes("schema cache"))) {
        const { data: product } = await supabase.from("products").select("stock").eq("id", productId).single();
        const updatedStock = Math.max(0, Number(product?.stock || 0) - requestedQty);
        await supabase.from("products").update({ stock: updatedStock }).eq("id", productId);
      }
    }

    // Create payment bill for online payment methods (no auth required — guest flow)
    let paymentUrl: string | null = null;
    if (paymentMethod === "fpx" || paymentMethod === "card") {
      const chipStatus = getChipConfigStatus();
      if (chipStatus.configured) {
        try {
          const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")
            .trim()
            .replace(/\/+$/, "");
          const purchase = await createChipPurchase({
            amount: finalTotal,
            orderId: order.id,
            orderNumber: numbering.orderNumber,
            customerName: customerName,
            customerEmail: null,
            customerPhone: normalizedPhone,
            // Land back on the order tracker (QR ordering app), not the member PWA.
            successRedirect: `${siteUrl}/order/${order.id}`,
            failureRedirect: `${siteUrl}/order/${order.id}?payment=failed`,
          });
          paymentUrl = purchase.checkoutUrl;
        } catch (chipErr) {
          // Log but don't fail the order — frontend will handle missing URL
          console.error("CHIP bill creation failed:", chipErr);
        }
      }
    }

    // WhatsApp receipt — fire-and-forget, never block the order response
    const waPhone = normalizeWhatsAppTo(normalizedPhone);
    if (waPhone) {
      const storeName = String(process.env.STORE_NAME || "Loka").trim();
      const itemLines = calculated.items
        .map(i => `• ${i.product_name_snapshot}${i.variant_name ? ` (${i.variant_name})` : ""} ×${i.qty} — RM${i.line_total.toFixed(2)}`)
        .join("\n");
      const redeemLine =
        appliedRedeemPoints > 0
          ? `Tebus mata: −RM${appliedRedeemAmount.toFixed(2)} (${appliedRedeemPoints} pts)\n`
          : "";
      const couponLine =
        appliedCouponDiscount > 0
          ? `Coupon ${appliedCouponCode}: −RM${appliedCouponDiscount.toFixed(2)}\n`
          : "";
      const shortNo = shortOrderNumber(numbering.orderNumber, order.id);
      const whereLine =
        orderType === "dine_in" && tableNumber
          ? `Dine In · Meja ${tableNumber}\n`
          : orderType === "take_away"
            ? "Take Away\n"
            : "";
      const nextStep = paysAtCounter
        ? `🧾 Sila ke kaunter dan sebut Order ID *#${shortNo}* untuk bayar.\n` +
          `${storeName} akan maklumkan bila pesanan siap. Terima kasih! ☕`
        : `Selesaikan bayaran online untuk hantar pesanan ke dapur.\n` +
          `${storeName} akan maklumkan bila pesanan siap. Terima kasih! ☕`;
      const waMsg =
        `✅ Order #${shortNo} (${numbering.orderNumber}) diterima!\n` +
        whereLine +
        `\n${itemLines}\n\n` +
        (redeemLine || couponLine ? `Subjumlah: RM${calculated.subtotal.toFixed(2)}\n${redeemLine}${couponLine}` : "") +
        `Jumlah: RM${finalTotal.toFixed(2)}\n\n` +
        nextStep;
      const itemsSummary = calculated.items
        .map(i => `${i.qty}× ${i.product_name_snapshot}${i.variant_name ? ` (${i.variant_name})` : ""}`)
        .join(", ");
      sendOrderReceivedMessage({
        to: waPhone,
        name: customerName,
        shortNo,
        receipt: numbering.orderNumber,
        where: orderType === "dine_in" && tableNumber ? `Dine In · Meja ${tableNumber}` : orderType === "take_away" ? "Take Away" : "-",
        itemsSummary,
        total: finalTotal.toFixed(2),
        nextStep: paysAtCounter
          ? `Sila ke kaunter dan sebut Order ID #${shortNo} untuk bayar.`
          : "Selesaikan bayaran online untuk hantar pesanan ke dapur.",
        text: waMsg,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      order_id: order.id,
      order_number: numbering.orderNumber,
      short_number: shortOrderNumber(numbering.orderNumber, order.id),
      status: "awaiting_payment",
      order_type: orderType,
      table_number: tableNumber,
      subtotal: calculated.subtotal,
      total: finalTotal,
      redeemed_points: appliedRedeemPoints,
      redeemed_amount: appliedRedeemAmount,
      coupon_code: appliedCouponCode,
      coupon_discount: appliedCouponDiscount,
      payment_url: paymentUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't place the order";
    const status = message.toLowerCase().includes("stock")
      ? 400
      : message.toLowerCase().includes("not found") || message.toLowerCase().includes("not available")
      ? 404
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
