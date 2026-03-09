import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coffee POS",
  description: "Clean cashier-friendly coffee shop POS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
