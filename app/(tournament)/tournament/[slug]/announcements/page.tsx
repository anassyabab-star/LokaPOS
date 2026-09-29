"use client";

import { useTournament } from "@/components/tournament/tournament-provider";
import { AnnouncementCard } from "@/components/tournament/ui";
import { PageHeader } from "../shell";

export default function AnnouncementsPage() {
  const { slug, data } = useTournament();
  if (!data) return null;
  return (
    <div>
      <PageHeader title="Announcements" back={`/tournament/${slug}`} />
      <div className="space-y-2 px-4 pt-4">
        {data.announcements.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-4xl">📣</div>
            <p className="mt-2 text-sm text-white/50">No announcements yet.</p>
          </div>
        ) : (
          data.announcements.map(a => <AnnouncementCard key={a.id} {...a} />)
        )}
      </div>
    </div>
  );
}
