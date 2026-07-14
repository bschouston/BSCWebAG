"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { TrackerActivityLog } from "@/components/admin/tracker-activity-log";

function TrackerLogsInner() {
  const searchParams = useSearchParams();
  const tournamentId = searchParams?.get("tournamentId")?.trim() || undefined;
  return <TrackerActivityLog lockedTournamentId={tournamentId} />;
}

export default function TrackerLogsPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground p-4">Loading…</div>}>
      <TrackerLogsInner />
    </Suspense>
  );
}
