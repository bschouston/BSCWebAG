"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TrackerRow = {
  uid: string;
  email: string | null;
  firstName: string;
  disabled: boolean;
};

export default function TrackerLoginsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<TrackerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const token = await user?.getIdToken();
    const res = await fetch("/api/admin/trackers", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await res.json();
    setRows(data.trackers ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (user) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const create = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/admin/trackers", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Failed to create tracker login");
      }
      setName("");
      setEmail("");
      setPassword("");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleDisabled = async (row: TrackerRow) => {
    setBusyUid(row.uid);
    const token = await user?.getIdToken();
    await fetch(`/api/admin/trackers/${row.uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ disabled: !row.disabled }),
    });
    setRows((prev) =>
      prev.map((r) => (r.uid === row.uid ? { ...r, disabled: !row.disabled } : r))
    );
    setBusyUid(null);
  };

  const resetPassword = async (row: TrackerRow) => {
    const next = window.prompt(`New password for ${row.email}? (min 8 chars)`);
    if (!next) return;
    setBusyUid(row.uid);
    const token = await user?.getIdToken();
    const res = await fetch(`/api/admin/trackers/${row.uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data?.error ?? "Failed to reset password");
    }
    setBusyUid(null);
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Create tracker login</CardTitle>
          <CardDescription>
            Dedicated accounts for the stat-tracking tablets. They sign into the Tracker
            Console and can only record match stats.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Device name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tablet 1"
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tablet1@bschouston.org"
              />
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <Input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="min 8 characters"
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            onClick={create}
            disabled={submitting || !email.trim() || password.length < 8}
          >
            {submitting ? "Creating…" : "Create login"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tracker logins</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-muted-foreground">No tracker logins yet.</div>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li
                  key={r.uid}
                  className="flex flex-wrap items-center justify-between gap-2 border rounded-md px-3 py-2"
                >
                  <div>
                    <div className="font-medium">{r.firstName || r.email}</div>
                    <div className="text-sm text-muted-foreground">
                      {r.email}
                      {r.disabled && (
                        <span className="ml-2 text-destructive">Disabled</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void resetPassword(r)}
                      disabled={busyUid === r.uid}
                    >
                      Reset password
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void toggleDisabled(r)}
                      disabled={busyUid === r.uid}
                    >
                      {r.disabled ? "Enable" : "Disable"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
