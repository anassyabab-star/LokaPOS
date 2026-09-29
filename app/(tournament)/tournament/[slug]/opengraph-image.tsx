import { ImageResponse } from "next/og";
import { getTournamentBySlug } from "@/lib/tournament/server";
import { STATUS_LABEL, rmLabel, voucherSpecLabel } from "@/lib/tournament/types";

// The card shown when the tournament link is shared (WhatsApp, IG, FB).
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Loka tournament";
export const revalidate = 300;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getTournamentBySlug(slug).catch(() => null);

  const name = t?.name || "Loka Tournament";
  const when = t?.start_at
    ? new Date(t.start_at).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "short", day: "numeric", month: "long" })
    : "Date TBA";
  const open = t?.status === "registration_open";
  const badge = t ? (open ? "REGISTRATION OPEN" : STATUS_LABEL[t.status].toUpperCase()) : "MOBILE LEGENDS";
  const perk = t?.voucher_config?.discount?.enabled ? `Every player gets ${voucherSpecLabel(t.voucher_config.discount)}` : null;
  const prize = t?.prizes?.[0]?.value ? `${t.prizes[0].title}: ${t.prizes[0].value}` : null;
  const fee = t ? (Number(t.entry_fee) > 0 ? `${rmLabel(t.entry_fee)} / team` : "Free entry") : null;

  // With a poster: poster on the left (3:4, uncropped), the essentials beside it.
  if (t?.cover_url) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", color: "white", fontFamily: "sans-serif", background: "linear-gradient(135deg, #7F1D1D 0%, #3b0d0d 60%, #0A0C11 100%)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.cover_url} width={472} height={630} style={{ objectFit: "cover" }} alt="" />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 48, flex: 1 }}>
            <div style={{ display: "flex" }}>
              <div style={{ display: "flex", padding: "8px 18px", borderRadius: 999, background: open ? "#DC2626" : "rgba(255,255,255,0.15)", fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>
                {badge}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: name.length > 40 ? 44 : 56, fontWeight: 800, lineHeight: 1.1 }}>{name}</div>
              <div style={{ display: "flex", marginTop: 16, fontSize: 28, opacity: 0.75 }}>{when}{t.venue ? ` · ${t.venue}` : ""}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[fee, prize, perk].filter(Boolean).map(line => (
                <div key={line!} style={{ display: "flex", padding: "12px 20px", borderRadius: 16, background: "rgba(0,0,0,0.35)", fontSize: 26, fontWeight: 600 }}>{line}</div>
              ))}
            </div>
          </div>
        </div>
      ),
      size
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: 64, color: "white", fontFamily: "sans-serif",
          background: "linear-gradient(135deg, #7F1D1D 0%, #3b0d0d 55%, #0A0C11 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: open ? "#DC2626" : "rgba(255,255,255,0.15)", fontSize: 26, fontWeight: 700, letterSpacing: 3 }}>
            {badge}
          </div>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 700, letterSpacing: 6, opacity: 0.8 }}>LOKA</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          {t?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.logo_url} width={170} height={170} style={{ borderRadius: 32, objectFit: "cover" }} alt="" />
          ) : null}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: name.length > 28 ? 64 : 80, fontWeight: 800, lineHeight: 1.05, maxWidth: 900 }}>{name}</div>
            <div style={{ display: "flex", marginTop: 18, fontSize: 32, opacity: 0.75 }}>
              {when}{t?.venue ? ` · ${t.venue}` : ""}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 18 }}>
          {[fee, prize, perk].filter(Boolean).map(line => (
            <div key={line!} style={{ display: "flex", padding: "16px 24px", borderRadius: 20, background: "rgba(0,0,0,0.35)", fontSize: 28, fontWeight: 600 }}>
              {line}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
