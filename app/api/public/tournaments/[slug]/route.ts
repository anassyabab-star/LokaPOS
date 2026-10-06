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
    if (tournament) {
      // Every phone at the venue refetches this on each score update. A 5s
      // CDN cache means the database is read once per 5s however many are
      // watching (Supabase warned about Disk IO); Realtime still says when.
      return NextResponse.json(await loadPublicBundle(tournament), {
        headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=30" },
      });
    }
    if (await isAdmin()) tournament = await getTournamentBySlug(slug, { includeUnpublished: true });
    if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    // Unpublished preview for an admin: never cached.
    return NextResponse.json(await loadPublicBundle(tournament), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
