"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, CardContent } from "@bsc/ui";
import { FantasyShell } from "@/components/fantasy-shell";
import { isFantasyAdminProfile, useAuth } from "@/lib/auth-context";

type TournamentRow = { id: string; name: string };

export default function FantasyAdminHome() {
  const { user, profile, loading } = useAuth();
  const [rows, setRows] = useState<TournamentRow[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.assign("/login");
      return;
    }
    if (!isFantasyAdminProfile(profile)) {
      window.location.assign("/");
      return;
    }
    const run = async () => {
      const token = await user.getIdToken();
      const res = await fetch("/api/tournaments", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.ok ? await res.json() : { tournaments: [] };
      setRows(data.tournaments ?? []);
    };
    void run();
  }, [user, profile, loading]);

  if (loading || !user || !isFantasyAdminProfile(profile)) return null;

  return (
    <FantasyShell>
      <main className="w-full px-3 sm:px-4 lg:px-6 py-4 md:py-8 space-y-6">
        <div className="bsc-page-heading">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Fantasy Admin</h1>
          <p className="text-muted-foreground mt-1">
            Manage pools, locks, teams, and analytics per tournament.
          </p>
        </div>
        <div className="grid gap-3">
          {rows.map((t) => (
            <Link key={t.id} href={`/admin/tournaments/${t.id}`}>
              <Card className="bsc-accent-card hover:border-bsc-red/40 hover:bg-bsc-red/5 transition-colors">
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="font-bold text-lg">{t.name}</div>
                  <Button variant="outline" size="sm">
                    Manage
                  </Button>
                </CardContent>
              </Card>
            </Link>
          ))}
          {rows.length === 0 ? (
            <p className="text-muted-foreground">No active tournaments.</p>
          ) : null}
        </div>
      </main>
    </FantasyShell>
  );
}
