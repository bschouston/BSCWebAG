import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { LiveIframe } from "@/components/live/live-iframe";
import {
  VOLLEYBALL_LIVE_SHEET_IFRAME_SRC,
  isVolleyballStatTrackerId,
} from "@/lib/live-volleyball-sheet";

export const dynamic = "force-dynamic";

/** Drop event-style prefixes so live titles read e.g. "Live — Men's Volleyball Tournament". */
function livePageTitle(raw: string): string {
  const s = raw.trim();
  const stripped = s.replace(/^registration\s*-\s*/i, "").trim();
  return stripped || s || "Tournament";
}

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

  const name = livePageTitle(String(t.name ?? "Tournament"));
  const iframe = t.publicIframeEmbedHtml ? String(t.publicIframeEmbedHtml) : "";
  const srcMatch = iframe.match(/src="([^"]+)"/i);
  const fromDoc = srcMatch?.[1]?.replace(/&amp;/g, "&") ?? "";
  const statTrackerId = String(t.statTrackerId ?? "");
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
          Live updates and standings are embedded below.
        </p>

        {iframeSrc ? (
          <LiveIframe src={iframeSrc} title={`Live - ${name}`} />
        ) : iframe ? (
          <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
            Live embed is configured, but the iframe URL couldn&apos;t be read. Please re-save the embed code.
          </div>
        ) : (
          <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
            Live embed is not configured yet.
          </div>
        )}
      </div>
    </div>
  );
}

