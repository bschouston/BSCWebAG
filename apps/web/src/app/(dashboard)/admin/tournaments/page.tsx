"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

type EventRow = {
  id: string;
  title: string;
  category?: string;
  status?: string;
  startTime?: string;
};

type TournamentRow = {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "COMPLETED";
  statTrackerId: string;
};

export default function AdminTournamentsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"active" | "all">("active");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TournamentRow[]>([]);
  const [featured, setFeatured] = useState<EventRow[]>([]);
  const [converting, setConverting] = useState<string | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (tab === "all") return rows;
    return rows.filter((r) => r.status === "ACTIVE");
  }, [rows, tab]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoading(true);
      try {
        const token = await user?.getIdToken();
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

        const [tRes, eRes] = await Promise.all([
          fetch("/api/tournaments", { headers }),
          fetch("/api/events?limit=200", { headers }),
        ]);
        const tData = await tRes.json();
        const eData = await eRes.json();
        if (!mounted) return;
        setRows((tData.tournaments ?? []) as TournamentRow[]);
        const events = (eData.events ?? []) as EventRow[];
        setFeatured(events.filter((e) => e.category === "FEATURED_EVENTS"));
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [user]);

  const convertToTournament = async (eventId: string) => {
    setConverting(eventId);
    setConvertError(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/admin/tournaments/convert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Conversion failed");
      window.location.assign(`/admin/tournaments/${data.tournamentId}/players`);
    } catch (e: any) {
      setConvertError(e?.message ?? "Conversion failed");
    } finally {
      setConverting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Tournaments</h1>
        <Link href="/admin/tournaments/new">
          <Button>Create tournament</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Featured events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : featured.length === 0 ? (
            <div className="text-muted-foreground">
              No featured events found.
            </div>
          ) : (
            <div className="grid gap-2">
              {featured.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{e.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.status ?? "—"} {e.startTime ? `• ${new Date(e.startTime).toLocaleDateString()}` : ""}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    disabled={!!converting}
                    onClick={() => convertToTournament(e.id)}
                  >
                    {converting === e.id ? "Converting…" : "Convert to tournament"}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {convertError && <p className="text-sm text-destructive">{convertError}</p>}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No tournaments</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Create your first tournament to start managing teams, players, and schedules.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {filtered.map((t) => (
                <Card key={t.id}>
                  <CardContent className="py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{t.name}</div>
                      <div className="text-sm text-muted-foreground">
                        Tracker: <span className="font-medium">{t.statTrackerId}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant={t.status === "ACTIVE" ? "default" : "secondary"}>
                        {t.status}
                      </Badge>
                      <Link href={`/admin/tournaments/${t.id}/players`}>
                        <Button variant="outline">Manage tournament</Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

