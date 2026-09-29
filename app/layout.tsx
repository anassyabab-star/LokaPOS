import type { Metadata, Viewport } from "next";
import { Space_Grotesk, DM_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { PWARegister } from "@/components/pwa-register";

// Loka customer-ordering display + body fonts (exposed as CSS vars for Tailwind
// `font-display` / `font-sans`). See design_handoff_loka_ordering.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

// What a shared link shows by default (WhatsApp, IG, FB) — customer-facing.
// Staff areas (POS, KDS, dashboard) set their own "Loka POS" title; the
// default share image is app/opengraph-image.png.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://pos.lokacafe.my"),
  title: "Loka — Coffee & Fruits Specialists",
  description: "Coffee & fruits at Bangi Sentral. Order ahead, collect rewards and join Loka events.",
  openGraph: { siteName: "Loka Coffee", type: "website" },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Loka POS",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#7F1D1D",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ms" suppressHydrationWarning className={`${spaceGrotesk.variable} ${dmSans.variable}`}>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <PWARegister />
      </body>
    </html>
  );
}
