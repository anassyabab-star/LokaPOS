import { NextResponse, type NextRequest } from "next/server";
import { expireStaleUnpaidOrders } from "@/lib/order-expiry";

// Vercel cron: void "awaiting_payment" orders older than
// store_settings.unpaid_order_expiry_minutes (see vercel.json).
// The POS / KDS list endpoints also run this best-effort, so a plan without
// frequent crons still cleans up while the store is operating.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await expireStaleUnpaidOrders({ force: true });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Expiry failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
