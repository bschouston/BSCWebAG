import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { TournamentTabs } from "@/components/tournament/tournament-tabs";
import { livePageTitle } from "@/lib/live-page-title";
import { normalizePublicTabs } from "@/lib/public-tournament-tabs";

export const dynamic = "force-dynamic";

export default async function PublicTournamentPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const adminDb = getAdminDb();

  const snap = await adminDb.collection("tournaments").doc(tournamentId).get();
  if (!snap.exists) notFound();

  const t = snap.data() as any;
  const liveEnabled = t.publicLiveEnabled !== false;
  if (t.status !== "ACTIVE" || !liveEnabled) notFound();

  const statTrackerId = String(t.statTrackerId ?? "");
  const name = livePageTitle(String(t.name ?? "Tournament"), statTrackerId);
  const enabledTabs = normalizePublicTabs(t.publicTabs);

  // Always use the embed stored on the tournament doc (seeded at create/convert;
  // editable in admin). Never hardcode a sport-specific sheet URL here.
  const iframe = t.publicIframeEmbedHtml ? String(t.publicIframeEmbedHtml) : "";
  const srcMatch = iframe.match(/src="([^"]+)"/i);
  const sheetSrc = srcMatch?.[1]?.replace(/&amp;/g, "&") || undefined;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-screen-2xl mx-auto px-4 lg:px-8 py-8 md:py-10 space-y-6">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-600" />
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">{name}</h1>
        </div>

        <TournamentTabs
          tournamentId={tournamentId}
          enabledTabs={enabledTabs}
          sheetSrc={sheetSrc}
          pageTitle={name}
        />
      </div>
    </div>
  );
}
