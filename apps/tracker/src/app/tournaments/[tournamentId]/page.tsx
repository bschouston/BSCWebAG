"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";

type MatchRow = {
  id: string;
  teamAId: string;
  teamBId: string;
  status: "UPCOMING" | "IN_PROGRESS" | "COMPLETED";
};

export default function TournamentPage({ params }: { params: { tournamentId: string } }) {
  const { user, loading } = useAuth();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [filter, setFilter] = useState<"UPCOMING" | "IN_PROGRESS" | "COMPLETED">("UPCOMING");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.assign("/login");
      return;
    }
    const run = async () => {
      setBusy(true);
      const token = await user.getIdToken();
      const res = await fetch(`/api/tournaments/${params.tournamentId}/matches`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMatches(data.matches ?? []);
      setBusy(false);
    };
    void run();
  }, [loading, user, params.tournamentId]);

  const filtered = useMemo(() => matches.filter((m) => m.status === filter), [matches, filter]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 860, margin: "0 auto" }}>
      <div style={{ marginBottom: 12 }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          ← Back
        </Link>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Matches</h1>
      <p style={{ opacity: 0.75, marginBottom: 16 }}>Pick a match, then choose which team you’re tracking.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["UPCOMING", "IN_PROGRESS", "COMPLETED"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #eee",
              background: filter === s ? "#111" : "#fff",
              color: filter === s ? "#fff" : "#111",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {s.replace("_", " ").toLowerCase()}
          </button>
        ))}
      </div>

      {busy ? (
        <div style={{ opacity: 0.75 }}>Loading matches…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 16, border: "1px solid #eee", borderRadius: 12, opacity: 0.8 }}>
          No matches in this state.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map((m) => (
            <Link
              key={m.id}
              href={`/tournaments/${params.tournamentId}/matches/${m.id}`}
              style={{
                padding: 14,
                border: "1px solid #eee",
                borderRadius: 12,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ fontWeight: 900 }}>{m.teamAId} vs {m.teamBId}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Status: {m.status}</div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

