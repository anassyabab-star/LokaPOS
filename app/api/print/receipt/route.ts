import { NextRequest, NextResponse } from "next/server";
import * as net from "net";
import { requireStaffApi } from "@/lib/staff-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildEscPosReceipt } from "@/lib/escpos";

export const runtime = "nodejs";

function sendToTcpPrinter(ip: string, port: number, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Printer timeout (${ip}:${port})`));
    }, 6000);

    socket.connect(port, ip, () => {
      socket.write(data, () => {
        clearTimeout(timeout);
        socket.end();
        resolve();
      });
    });
    socket.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const { orderId, printerIp, printerPort } = await req.json() as {
    orderId: string;
    printerIp: string;
    printerPort?: number;
  };

  if (!orderId || !printerIp) {
    return NextResponse.json({ error: "orderId and printerIp required" }, { status: 400 });
  }

  const port = Number(printerPort || 9100);

  const supabase = createSupabaseAdminClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id,receipt_number,created_at,customer_name,payment_method,subtotal,discount_value,total")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const { data: itemRows } = await supabase
    .from("order_items")
    .select("id,product_name_snapshot,variant_id,price,qty,line_total")
    .eq("order_id", orderId);

  const items = (itemRows || []).map((item) => ({
    name: String(item.product_name_snapshot || "Item"),
    qty: Number(item.qty || 0),
    unitPrice: Number(item.price || 0),
    lineTotal: Number(item.line_total || 0),
  }));

  const escpos = buildEscPosReceipt({
    shopName: "Loka POS",
    receiptNumber: order.receipt_number || order.id.slice(0, 8),
    createdAt: order.created_at,
    customerName: order.customer_name,
    paymentMethod: order.payment_method,
    subtotal: Number(order.subtotal || 0),
    discount: Number(order.discount_value || 0),
    total: Number(order.total || 0),
    items,
  });

  try {
    await sendToTcpPrinter(printerIp, port, escpos);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Print failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
