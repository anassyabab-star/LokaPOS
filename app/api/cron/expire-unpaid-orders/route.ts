import { NextResponse, type NextRequest } from "next/server";
import { expireStaleUnpaidOrders } from "@/lib/order-expiry";

// Voids "awaiting_payment" orders older than
// store_settings.unpaid_order_expiry_minutes.
//
// NOT wired to a Vercel cron: the Hobby plan allows two cron jobs and both are
// taken, so the nightly /api/cron/auto-close-shift run does this sweep too.
// During opening hours the POS and KDS list endpoints sweep every minute.
// This route stays for manual runs, an external scheduler, or a Pro plan that
// can afford its own */15 entry in vercel.json.
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
