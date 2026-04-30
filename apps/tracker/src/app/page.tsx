"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";

type TournamentRow = { id: string; name: string; status: string; statTrackerId: string };

export default function Home() {
  const { user, profile, loading, signOut } = useAuth();
  const [rows, setRows] = useState<TournamentRow[]>([]);
  const [busy, setBusy] = useState(true);

  const isTracker = profile?.role === "TRACKER";

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
      const data = await res.json();
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
      <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Access denied</h1>
        <p style={{ opacity: 0.8, marginBottom: 16 }}>
          Your account does not have the <strong>TRACKER</strong> role.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <a href={process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000"}>
            <button style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}>
              Go to website
            </button>
          </a>
          <button
            onClick={() => void signOut()}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #111", background: "#111", color: "#fff" }}
          >
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 4 }}>Tracker Console</h1>
          <p style={{ opacity: 0.75 }}>Pick an active tournament to track.</p>
        </div>
        <button
          onClick={() => void signOut()}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}
        >
          Sign out
        </button>
      </div>

      {busy ? (
        <div style={{ opacity: 0.75 }}>Loading tournaments…</div>
      ) : active.length === 0 ? (
        <div style={{ padding: 16, border: "1px solid #eee", borderRadius: 12, opacity: 0.8 }}>
          No active tournaments.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {active.map((t) => (
            <Link
              key={t.id}
              href={`/tournaments/${t.id}`}
              style={{ padding: 14, border: "1px solid #eee", borderRadius: 12, textDecoration: "none", color: "inherit" }}
            >
              <div style={{ fontWeight: 800 }}>{t.name}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Tracker: {t.statTrackerId}</div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

