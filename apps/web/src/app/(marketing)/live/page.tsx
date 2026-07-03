import { redirect } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

/** Legacy /live URL — redirect to the first active public tournament page. */
export default async function LiveIndexRedirect() {
  const adminDb = getAdminDb();
  const snap = await adminDb.collection("tournaments").where("status", "==", "ACTIVE").get();

  const rows = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((t) => t.publicLiveEnabled !== false)
    .sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? 0;
      return tb - ta;
    });

  if (rows.length === 0) redirect("/");
  redirect(`/tournament/${rows[0].id}`);
}
