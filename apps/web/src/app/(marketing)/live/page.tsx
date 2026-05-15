import Link from "next/link";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

export default async function LiveIndexPage() {
  const adminDb = getAdminDb();
  const snap = await adminDb
    .collection("tournaments")
    .where("status", "==", "ACTIVE")
    .get();

  const rows = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((t) => t.publicLiveEnabled !== false) // default true for older docs
    .sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? 0;
      return tb - ta;
    });

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-5xl mx-auto px-4 py-12 space-y-6">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-600" />
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Live
          </h1>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
            No live tournaments right now.
          </div>
        ) : (
          <div className="grid gap-3">
            {rows.map((t) => (
              <Link
                key={t.id}
                href={`/live/${t.id}`}
                className="rounded-2xl border bg-card p-5 hover:bg-muted/30 transition-colors"
              >
                <div className="font-semibold">{t.name ?? "Tournament"}</div>
                <div className="text-sm text-muted-foreground">View live page</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

