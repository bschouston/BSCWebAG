"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getStatTracker } from "@bsc/shared";

export default function TrackPage({ params }: { params: { tournamentId: string; matchId: string } }) {
  const { user, loading, signOut } = useAuth();
  const search = useSearchParams();
  const team = (search.get("team") ?? "A") as "A" | "B";
  const [trackerId, setTrackerId] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.assign("/login");
      return;
    }

    const run = async () => {
      // Minimal: fetch tournament doc via admin API (V1 placeholder).
      // For now we infer volleyball.v1; admin creation enforces it.
      setTrackerId("volleyball.v1");
    };
    void run();
  }, [loading, user]);

  const tracker = useMemo(() => (trackerId ? getStatTracker(trackerId) : null), [trackerId]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <Link href={`/tournaments/${params.tournamentId}/matches/${params.matchId}`} style={{ textDecoration: "none" }}>
          ← Back
        </Link>
        <button
          onClick={() => void signOut()}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}
        >
          Sign out
        </button>
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>
        Tracking session (Team {team})
      </h1>
      <p style={{ opacity: 0.75, marginBottom: 16 }}>
        {tracker ? (
          <>
            Tracker selected for this tournament: <strong>{tracker.name}</strong>
          </>
        ) : (
          "Loading…"
        )}
      </p>

      <div style={{ padding: 16, borderRadius: 12, border: "1px solid #eee", opacity: 0.85 }}>
        Tracking UI is coming in V2. Locks are implemented, and this page is intentionally a placeholder
        driven by the tournament’s selected tracker.
      </div>
    </main>
  );
}

