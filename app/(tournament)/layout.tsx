import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Loka Tournament" };

// Dark, phone-width shell for the participant app. Separate from the cream
// ordering app on purpose — this is an esports screen people glance at
// between games.
export default function TournamentRootLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ colorScheme: "dark" }} className="flex min-h-[100dvh] w-full justify-center bg-black">
      <div className="relative min-h-[100dvh] w-full max-w-lg bg-[#0A0C11] font-sans text-white antialiased">
        {children}
      </div>
    </div>
  );
}
