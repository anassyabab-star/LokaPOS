import { redirect } from "next/navigation";

// The legacy single-file member PWA lived here. It was retired on 2026-09-16
// in favour of the QR ordering app (app/(order): /menu, /rewards, /orders …).
// Old bookmarks and installed PWAs still land here, so map the old tabs across.
export default async function LegacyCustomerRedirect({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; order_id?: string; ref?: string }>;
}) {
  const params = (await searchParams) || {};
  const tab = String(params.tab || "").toLowerCase();
  const ref = String(params.ref || "").trim();
  const suffix = ref ? `?ref=${encodeURIComponent(ref)}` : "";

  if (params.order_id) redirect(`/order/${encodeURIComponent(String(params.order_id))}`);
  if (tab === "orders") redirect("/orders");
  if (tab === "rewards" || tab === "account") redirect("/rewards");
  if (tab === "cart") redirect("/cart");
  redirect(`/menu${suffix}`);
}
