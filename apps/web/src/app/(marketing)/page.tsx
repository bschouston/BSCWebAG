import { getAdminDb } from "@/lib/firebase/admin";
import { isVolleyballStatTrackerId } from "@/lib/live-volleyball-sheet";
import { redirect } from "next/navigation";
import { ClubHomePage } from "@/components/home/club-home-page";

export const dynamic = "force-dynamic";

function sortByNewest<T extends { createdAt?: { toMillis?: () => number } }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() ?? 0;
    const tb = b.createdAt?.toMillis?.() ?? 0;
    return tb - ta;
  });
}

async function resolveLiveTournamentId(): Promise<string | null> {
  try {
    const adminDb = getAdminDb();
    const snap = await adminDb.collection("tournaments").where("status", "==", "ACTIVE").get();

    const active = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((t) => t.publicLiveEnabled !== false);

    const volleyball = sortByNewest(
      active.filter((t) => isVolleyballStatTrackerId(String(t.statTrackerId ?? "")))
    );

    return volleyball[0]?.id ?? sortByNewest(active)[0]?.id ?? null;
  } catch (err: unknown) {
    const msg = String(err instanceof Error ? err.message : err);
    if (!msg.includes("Firebase Admin credentials not set")) {
      console.error("Homepage live tournament query error:", err);
    }
    return null;
  }
}

/** Live tournament when one is public; otherwise the club landing page. */
export default async function Home() {
  const tournamentId = await resolveLiveTournamentId();
  if (tournamentId) {
    redirect(`/tournament/${tournamentId}`);
  }
  return <ClubHomePage />;
}
