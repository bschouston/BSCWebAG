import { getAdminDb } from "@/lib/firebase/admin";
import { isVolleyballStatTrackerId } from "@/lib/live-volleyball-sheet";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Default public tournament when the active query fails (override via env). */
const DEFAULT_HOME_TOURNAMENT_ID =
  process.env.DEFAULT_HOME_TOURNAMENT_ID ?? "B34i4kEl50WByUpNAcM9";

function sortByNewest<T extends { createdAt?: { toMillis?: () => number } }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() ?? 0;
    const tb = b.createdAt?.toMillis?.() ?? 0;
    return tb - ta;
  });
}

async function resolveHomeTournamentId(): Promise<string | null> {
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
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (!msg.includes("Firebase Admin credentials not set")) {
      console.error("Homepage redirect query error:", err);
    }
    return null;
  }
}

/** Homepage → active men's volleyball public tournament page (fallback: default tournament). */
export default async function Home() {
  const tournamentId = (await resolveHomeTournamentId()) ?? DEFAULT_HOME_TOURNAMENT_ID;
  redirect(`/tournament/${tournamentId}`);
}
