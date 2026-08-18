"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { SportEvent } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function FeaturedRegistrationActions({
  eventId,
  event,
  onEventChange,
}: {
  eventId: string;
  event: SportEvent;
  onEventChange: (patch: Partial<SportEvent>) => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "end" | "reopen">(null);

  const closed = Boolean(event.registrationsClosedAt);

  const run = async (path: "end" | "reopen") => {
    if (!user) return;
    setBusy(path);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/events/${eventId}/registrations/${path}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Action failed");
      if (path === "end") {
        onEventChange({
          registrationsClosedAt: new Date().toISOString() as unknown as SportEvent["registrationsClosedAt"],
          isPublic: false,
        });
      } else {
        onEventChange({
          registrationsClosedAt: null,
          isPublic: true,
        });
      }
      setDialog(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="text-[#1a3556] dark:text-foreground">Registrations</CardTitle>
        <CardDescription>
          {closed
            ? "Registrations are closed. This event is hidden from public pages until you reopen."
            : "Registrations are open on the public event page."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {closed ? (
            <Button
              className="bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540]"
              disabled={!!busy}
              onClick={() => setDialog("reopen")}
            >
              {busy === "reopen" ? "Reopening…" : "Reopen registrations"}
            </Button>
          ) : (
            <Button variant="destructive" disabled={!!busy} onClick={() => setDialog("end")}>
              {busy === "end" ? "Ending…" : "End registrations"}
            </Button>
          )}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>

      <Dialog open={dialog === "end"} onOpenChange={(open) => setDialog(open ? "end" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End registrations?</DialogTitle>
            <DialogDescription>
              New sign-ups will stop and this event will be removed from public listings. Existing
              registrations are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Back
            </Button>
            <Button variant="destructive" disabled={!!busy} onClick={() => void run("end")}>
              {busy === "end" ? "Ending…" : "End registrations"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "reopen"} onOpenChange={(open) => setDialog(open ? "reopen" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen registrations?</DialogTitle>
            <DialogDescription>
              The public event page will accept sign-ups again and the event will be listed publicly.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Back
            </Button>
            <Button
              className="bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540]"
              disabled={!!busy}
              onClick={() => void run("reopen")}
            >
              {busy === "reopen" ? "Reopening…" : "Reopen registrations"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
