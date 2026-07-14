"use client";

import { use } from "react";
import { TrackerActivityLog } from "@/components/admin/tracker-activity-log";

export default function TournamentTrackerActivityPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  return (
    <TrackerActivityLog
      lockedTournamentId={tournamentId}
      title="Tournament tracker activity"
      description="Activity for this tournament only (match tracking, stats, logins recorded against matches)."
    />
  );
}
