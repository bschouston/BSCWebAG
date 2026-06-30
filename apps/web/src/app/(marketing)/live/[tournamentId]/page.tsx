import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { LiveIframe } from "@/components/live/live-iframe";
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
  const isVolleyball = isVolleyballStatTrackerId(statTrackerId);
  const name = livePageTitle(String(t.name ?? "Tournament"), statTrackerId);

  // Volleyball always uses the canonical org sheet defined in code; other
  // tournaments fall back to whatever embed is stored on the doc.
  const iframe = t.publicIframeEmbedHtml ? String(t.publicIframeEmbedHtml) : "";
  const srcMatch = iframe.match(/src="([^"]+)"/i);
  const fromDoc = srcMatch?.[1]?.replace(/&amp;/g, "&") ?? "";
  const iframeSrc = isVolleyball ? VOLLEYBALL_LIVE_SHEET_IFRAME_SRC : fromDoc;

  const header = (
    <div className="flex items-center gap-3">
      <span className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-600" />
      </span>
      <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
        Live - {name}
      </h1>
    </div>
  );

  // Sheet view: full-bleed, full width, zoomed out to show the whole workbook.
  if (iframeSrc) {
    return (
      <div className="min-h-screen bg-background">
        <div className="px-4 sm:px-6 py-6 space-y-4">
          {header}
          <LiveIframe
            src={iframeSrc}
            title={`Live - ${name}`}
            fillPage
            defaultScale={0.5}
          />
        </div>
      </div>
    );
  }

  // Native realtime view for tournaments without a sheet.
  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-5xl mx-auto px-4 py-10 space-y-6">
        {header}
        <p className="text-sm text-muted-foreground">
          Live scores, standings, and the player leaderboard update in real time.
        </p>
        <LiveTournament tournamentId={tournamentId} title={`Live - ${name}`} />
      </div>
    </div>
  );
}

