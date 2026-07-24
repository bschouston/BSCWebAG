"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, CardContent } from "@bsc/ui";
import { FantasyShell } from "@/components/fantasy-shell";
import { isFantasyAdminProfile, useAuth } from "@/lib/auth-context";

type TournamentRow = { id: string; name: string; status: string; statTrackerId?: string };

export default function HomePage() {
  const { user, profile, loading, signOut } = useAuth();
  const [rows, setRows] = useState<TournamentRow[]>([]);
  const [busy, setBusy] = useState(true);
  const isFantasy = profile?.isFantasyUser === true && profile?.fantasyDisabled !== true;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.assign("/login");
      return;
    }
    if (!isFantasy) return;

    const run = async () => {
      setBusy(true);
      const token = await user.getIdToken();
      const res = await fetch("/api/tournaments", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.ok ? await res.json() : { tournaments: [] };
      const list = (data.tournaments ?? []) as TournamentRow[];
      // One active tournament → go straight to All teams.
      if (list.length === 1) {
        window.location.assign(`/t/${list[0].id}/teams`);
        return;
      }
      setRows(list);
      setBusy(false);
    };
    void run();
  }, [loading, user, isFantasy]);

  if (loading) return null;
  if (!user) return null;

  if (!isFantasy) {
    return (
      <main className="max-w-xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Access denied</h1>
        <p className="text-muted-foreground">Your account is not enabled for Fantasy.</p>
        <Button onClick={() => void signOut()}>Sign out</Button>
      </main>
    );
  }

  return (
    <FantasyShell>
      <main className="w-full px-3 sm:px-4 lg:px-6 py-4 md:py-8">
        <div className="bsc-page-heading mb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
            Pick a tournament
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Build your fantasy roster from live tracked players.
          </p>
          {isFantasyAdminProfile(profile) ? (
            <Button asChild variant="outline" className="mt-4">
              <Link href="/admin">Open Fantasy Admin</Link>
            </Button>
          ) : null}
        </div>

        {busy ? (
          <div className="text-muted-foreground">Loading tournaments…</div>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No active tournaments right now.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {rows.map((t) => (
              <Link key={t.id} href={`/t/${t.id}/teams`}>
                <Card className="bsc-accent-card hover:border-bsc-red/40 hover:bg-bsc-red/5 transition-colors">
                  <CardContent className="py-5">
                    <div className="font-bold text-lg text-foreground">{t.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">View all teams →</div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </FantasyShell>
  );
}
