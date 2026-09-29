import { NextResponse } from "next/server";
import { getCurrentSessionUser, resolveCurrentUserRole } from "@/lib/auth";
import { getTournamentBySlug, loadPublicBundle } from "@/lib/tournament/server";

export const revalidate = 0;

// Admins may preview a tournament before it's published ("Buka app peserta").
async function isAdmin() {
  try {
    const user = await getCurrentSessionUser();
    if (!user) return false;
    const role = await resolveCurrentUserRole(user.id, (user.app_metadata?.role as string | undefined) || null);
    return role === "admin";
  } catch {
    return false;
  }
}

// GET — everything a participant screen needs, with personal data stripped.
export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  try {
    let tournament = await getTournamentBySlug(slug);
    if (!tournament && (await isAdmin())) tournament = await getTournamentBySlug(slug, { includeUnpublished: true });
    if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    return NextResponse.json(await loadPublicBundle(tournament));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
