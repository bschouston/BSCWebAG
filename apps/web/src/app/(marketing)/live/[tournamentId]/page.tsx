import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { LiveTournament } from "@/components/live/live-tournament";
import { livePageTitle } from "@/lib/live-page-title";
import {
  VOLLEYBALL_LIVE_SHEET_IFRAME_SRC,
  isVolleyballStatTrackerId,
} from "@/lib/live-volleyball-sheet";

export const dynamic = "force-dynamic";

export default async function LiveTournamentPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const adminDb = getAdminDb();

  const snap = await adminDb.collection("tournaments").doc(tournamentId).get();
  if (!snap.exists) notFound();

  const t = snap.data() as any;
  const liveEnabled = t.publicLiveEnabled !== false; // default true for older docs
  if (t.status !== "ACTIVE" || !liveEnabled) notFound();

  const statTrackerId = String(t.statTrackerId ?? "");
  const name = livePageTitle(String(t.name ?? "Tournament"), statTrackerId);
  const iframe = t.publicIframeEmbedHtml ? String(t.publicIframeEmbedHtml) : "";
  const srcMatch = iframe.match(/src="([^"]+)"/i);
  const fromDoc = srcMatch?.[1]?.replace(/&amp;/g, "&") ?? "";
  const iframeSrc =
    fromDoc ||
    (isVolleyballStatTrackerId(statTrackerId) ? VOLLEYBALL_LIVE_SHEET_IFRAME_SRC : "");

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-5xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-600" />
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Live - {name}
          </h1>
        </div>

        <p className="text-sm text-muted-foreground">
          Live scores, standings, and the player leaderboard update in real time.
        </p>

        <LiveTournament
          tournamentId={tournamentId}
          iframeFallbackSrc={iframeSrc || undefined}
          title={`Live - ${name}`}
        />
      </div>
    </div>
  );
}

