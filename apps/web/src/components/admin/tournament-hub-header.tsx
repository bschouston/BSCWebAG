"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmTypeDeleteDialog } from "@/components/tournament/confirm-type-delete-dialog";

type TournamentMeta = {
  id: string;
  name: string;
  status: string;
  eventId?: string | null;
};

export function TournamentHubHeader({ tournamentId }: { tournamentId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [tournament, setTournament] = useState<TournamentMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const token = await user?.getIdToken();
        const res = await fetch(`/api/tournaments/${tournamentId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json().catch(() => ({}));
        if (!mounted) return;
        if (res.ok && data.tournament) {
          setTournament({
            id: data.tournament.id,
            name: data.tournament.name,
            status: data.tournament.status,
            eventId: data.tournament.eventId ?? null,
          });
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [tournamentId, user]);

  const setStatus = async (status: "ACTIVE" | "ARCHIVED") => {
    setBusy(true);
    setError(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/tournaments/${tournamentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to update status");
      setTournament((prev) => (prev ? { ...prev, status } : prev));
      window.dispatchEvent(new CustomEvent("bsc:tournaments-changed"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setBusy(false);
    }
  };

  const undoConvert = async () => {
    if (!tournament?.eventId) return;
    setUndoing(true);
    setError(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/unpromote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ confirmEventId: tournament.eventId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail =
          Array.isArray(data?.blockers) && data.blockers.length
            ? `${data.error ?? "Cannot undo convert"}: ${data.blockers.join("; ")}`
            : (data?.error ?? "Failed to undo convert");
        throw new Error(detail);
      }
      setUndoOpen(false);
      window.dispatchEvent(new CustomEvent("bsc:tournaments-changed"));
      router.push("/admin/tournaments");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to undo convert");
    } finally {
      setUndoing(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight truncate">
            {tournament?.name ?? "Tournament"}
          </h1>
          {tournament?.status ? (
            <Badge
              variant={
                tournament.status === "ACTIVE"
                  ? "default"
                  : tournament.status === "ARCHIVED"
                    ? "outline"
                    : "secondary"
              }
            >
              {tournament.status}
            </Badge>
          ) : null}
        </div>
        {error ? <p className="text-sm text-destructive mt-1">{error}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/trackers">Tracker Logins</Link>
        </Button>
        {tournament?.eventId ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy || undoing || !tournament}
            onClick={() => setUndoOpen(true)}
          >
            Undo convert
          </Button>
        ) : null}
        {tournament?.status === "ARCHIVED" ? (
          <Button size="sm" disabled={busy} onClick={() => void setStatus("ACTIVE")}>
            {busy ? "Updating…" : "Unarchive / Publish"}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !tournament}
            onClick={() => void setStatus("ARCHIVED")}
          >
            {busy ? "Updating…" : "Archive"}
          </Button>
        )}
      </div>

      <ConfirmTypeDeleteDialog
        open={undoOpen}
        onOpenChange={(open) => {
          if (!undoing) setUndoOpen(open);
        }}
        title="Undo convert to tournament?"
        description={`This unlinks “${tournament?.name ?? "this tournament"}” from its featured event and deletes the tournament record. Event registrations stay intact and registration can continue.`}
        consequences={[
          "The featured event can be converted again later",
          "Imported tournament player copies will be deleted",
          "Event registrations, payments, and open registration are not changed",
          "Blocked if this tournament already has teams, matches, or playoffs",
        ]}
        confirmWord="undo"
        confirmLabel="Undo convert"
        confirmingLabel="Undoing…"
        confirming={undoing}
        onConfirm={() => void undoConvert()}
      />
    </div>
  );
}
