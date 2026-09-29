import type { ReactNode } from "react";
import { TournamentProvider } from "@/components/tournament/tournament-provider";
import { TournamentShell } from "./shell";

export default async function TournamentLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <TournamentProvider slug={slug}>
      <TournamentShell>{children}</TournamentShell>
    </TournamentProvider>
  );
}
