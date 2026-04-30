"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

export default function MatchPage({
  params,
}: {
  params: { tournamentId: string; matchId: string };
}) {
  const { user, loading } = useAuth();
  const [teamKey, setTeamKey] = useState<"A" | "B" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) window.location.assign("/login");
  }, [loading, user]);

  const start = async () => {
    if (!user || !teamKey) return;
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/locks/acquire", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tournamentId: params.tournamentId,
          matchId: params.matchId,
          teamKey,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Unable to acquire lock");
      }
      window.location.assign(
        `/tournaments/${params.tournamentId}/matches/${params.matchId}/track?team=${teamKey}`
      );
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 860, margin: "0 auto" }}>
      <div style={{ marginBottom: 12 }}>
        <Link href={`/tournaments/${params.tournamentId}`} style={{ textDecoration: "none" }}>
          ← Back to matches
        </Link>
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Start tracking</h1>
      <p style={{ opacity: 0.75, marginBottom: 16 }}>
        Choose which team you are tracking. The system will lock that team so no other tracker can track it simultaneously.
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        {(["A", "B"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTeamKey(k)}
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid #eee",
              background: teamKey === k ? "#111" : "#fff",
              color: teamKey === k ? "#fff" : "#111",
              fontWeight: 800,
              flex: 1,
            }}
          >
            Team {k}
          </button>
        ))}
      </div>

      {error && <div style={{ color: "crimson", fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <button
        onClick={start}
        disabled={!teamKey || busy}
        style={{ padding: 12, borderRadius: 12, border: "1px solid #111", background: "#111", color: "#fff", width: "100%" }}
      >
        {busy ? "Starting…" : "Start tracking"}
      </button>
    </main>
  );
}

