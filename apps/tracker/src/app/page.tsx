"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardContent } from "@bsc/ui";
import { useAuth } from "@/lib/auth-context";

type TournamentRow = { id: string; name: string; status: string; statTrackerId: string };

export default function Home() {
  const { user, profile, loading, signOut } = useAuth();
  const [rows, setRows] = useState<TournamentRow[]>([]);
  const [busy, setBusy] = useState(true);

  const isTracker = profile?.role === "TRACKER" || profile?.role === "ADMIN" || profile?.role === "SUPER_ADMIN";

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.assign("/login");
      return;
    }
    if (!isTracker) return;

    const run = async () => {
      setBusy(true);
      const token = await user.getIdToken();
      const res = await fetch("/api/tournaments", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.ok ? await res.json() : { tournaments: [] };
      setRows(data.tournaments ?? []);
      setBusy(false);
    };
    void run();
  }, [loading, user, isTracker]);

  const active = useMemo(() => rows.filter((r) => r.status === "ACTIVE"), [rows]);

  if (loading) return null;
  if (!user) return null;

  if (!isTracker) {
    return (
      <main className="max-w-xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Access denied</h1>
        <p className="text-muted-foreground">
          Your account does not have the <strong className="text-foreground">TRACKER</strong> role.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <a href={process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000"}>Go to website</a>
          </Button>
          <Button onClick={() => void signOut()}>Sign out</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Tracker Console</h1>
          <p className="text-muted-foreground mt-1">Pick an active tournament to track.</p>
        </div>
        <Button variant="outline" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>

      {busy ? (
        <div className="text-muted-foreground">Loading tournaments…</div>
      ) : active.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No active tournaments.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {active.map((t) => (
            <Link key={t.id} href={`/tournaments/${t.id}`}>
              <Card className="hover:bg-muted/40 transition-colors">
                <CardContent className="py-4">
                  <div className="font-bold text-lg">{t.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Tracker: {t.statTrackerId}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
