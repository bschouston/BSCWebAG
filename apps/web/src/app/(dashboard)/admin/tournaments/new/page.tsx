"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { statTrackers } from "@bsc/shared";

export default function NewTournamentPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "ACTIVE" | "COMPLETED">("DRAFT");
  const [statTrackerId, setStatTrackerId] = useState<string>(statTrackers[0]?.id ?? "volleyball.v1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trackerOptions = useMemo(() => statTrackers, []);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/tournaments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, status, statTrackerId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Failed to create tournament");
      }
      const data = await res.json();
      router.push(`/admin/tournaments/${data.id}/players`);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Create tournament</CardTitle>
          <CardDescription>
            Choose the stat tracker to use for this tournament (Volleyball now, others later).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Tournament name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Stat tracker</Label>
            <Select value={statTrackerId} onValueChange={setStatTrackerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select tracker" />
              </SelectTrigger>
              <SelectContent>
                {trackerOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            onClick={submit}
            disabled={submitting || !name.trim() || !statTrackerId}
            className="w-full"
          >
            {submitting ? "Creating…" : "Create tournament"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

