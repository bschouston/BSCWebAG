import { getAdminDb } from "@/lib/firebase/admin";
import { isVolleyballStatTrackerId } from "@/lib/live-volleyball-sheet";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function sortByNewest<T extends { createdAt?: { toMillis?: () => number } }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() ?? 0;
    const tb = b.createdAt?.toMillis?.() ?? 0;
    return tb - ta;
  });
}

/** Homepage → active men's volleyball public tournament page (fallback: /events). */
export default async function Home() {
  try {
    const adminDb = getAdminDb();
    const snap = await adminDb.collection("tournaments").where("status", "==", "ACTIVE").get();

    const active = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((t) => t.publicLiveEnabled !== false);

    const volleyball = sortByNewest(
      active.filter((t) => isVolleyballStatTrackerId(String(t.statTrackerId ?? "")))
    );

    const pick = volleyball[0] ?? sortByNewest(active)[0];
    if (pick) redirect(`/tournament/${pick.id}`);
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (!msg.includes("Firebase Admin credentials not set")) {
      console.error("Homepage redirect query error:", err);
    }
  }

  redirect("/events");
}
