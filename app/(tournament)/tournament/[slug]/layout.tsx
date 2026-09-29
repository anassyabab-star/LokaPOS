import type { ReactNode } from "react";
import type { Metadata } from "next";
import { TournamentProvider } from "@/components/tournament/tournament-provider";
import { getTournamentBySlug } from "@/lib/tournament/server";
import { rmLabel, voucherSpecLabel } from "@/lib/tournament/types";
import { TournamentShell } from "./shell";

// What WhatsApp / Instagram / Facebook show when the link is shared. The
// image comes from ./opengraph-image.tsx.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTournamentBySlug(slug).catch(() => null);
  if (!t) return { title: "Loka Tournament" };
  const when = t.start_at
    ? new Date(t.start_at).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric" })
    : null;
  const perk = t.voucher_config?.discount?.enabled ? ` Every player gets ${voucherSpecLabel(t.voucher_config.discount)} at Loka.` : "";
  const lead =
    t.status === "registration_open"
      ? `Registration open — ${Number(t.entry_fee) > 0 ? `${rmLabel(t.entry_fee)} per team` : "free entry"}.`
      : t.status === "ongoing" ? "Live now — scores, schedule & bracket." : "Schedule, standings & bracket.";
  const description = `${lead}${when ? ` ${when}` : ""}${t.venue ? ` · ${t.venue}` : ""}.${perk}`;
  return {
    // Absolute og:image URLs — social crawlers don't resolve relative ones.
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://pos.lokacafe.my"),
    title: `${t.name} · Loka`,
    description,
    openGraph: { title: t.name, description, type: "website", siteName: "Loka Coffee" },
    twitter: { card: "summary_large_image", title: t.name, description },
  };
}

export default async function TournamentLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <TournamentProvider slug={slug}>
      <TournamentShell>{children}</TournamentShell>
    </TournamentProvider>
  );
}
