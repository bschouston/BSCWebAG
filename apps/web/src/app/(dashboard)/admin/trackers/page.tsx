"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import { Checkbox } from "@/components/ui/checkbox";

type TabletTrackerRow = {
  uid: string;
  email: string | null;
  firstName: string;
  disabled: boolean;
  isTrackerAdmin: boolean;
};

export default function TrackerLoginsPage() {
  const { user } = useAuth();
  const [tabletRows, setTabletRows] = useState<TabletTrackerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isTrackerAdmin, setIsTrackerAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const token = await user?.getIdToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const trackersRes = await fetch("/api/admin/trackers", { headers });
    const trackersData = await trackersRes.json();
    setTabletRows(trackersData.tabletTrackers ?? []);
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
        body: JSON.stringify({ name, email, password, isTrackerAdmin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Failed to create tracker login");
      }
      setName("");
      setEmail("");
      setPassword("");
      setIsTrackerAdmin(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleDisabled = async (row: TabletTrackerRow) => {
    setBusyUid(row.uid);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/trackers/${row.uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ disabled: !row.disabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Failed to update account");
      }
      setTabletRows((prev) =>
        prev.map((r) => (r.uid === row.uid ? { ...r, disabled: !row.disabled } : r))
      );
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : "Failed to update account");
    } finally {
      setBusyUid(null);
    }
  };

  const deleteTracker = async (row: TabletTrackerRow) => {
    const label = row.email || row.firstName || row.uid;
    const ok = window.confirm(`Delete tablet login ${label}? This cannot be undone.`);
    if (!ok) return;
    setBusyUid(row.uid);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/trackers/${row.uid}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Failed to delete");
      }
      setTabletRows((prev) => prev.filter((r) => r.uid !== row.uid));
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusyUid(null);
    }
  };

  const toggleAdmin = async (row: TabletTrackerRow) => {
    setBusyUid(row.uid);
    const token = await user?.getIdToken();
    const next = !row.isTrackerAdmin;
    const res = await fetch(`/api/admin/trackers/${row.uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ isTrackerAdmin: next }),
    });
    if (res.ok) {
      setTabletRows((prev) =>
        prev.map((r) => (r.uid === row.uid ? { ...r, isTrackerAdmin: next } : r))
      );
    } else {
      const data = await res.json().catch(() => ({}));
      window.alert(data?.error ?? "Failed to update admin flag");
    }
    setBusyUid(null);
  };

  const resetPassword = async (row: TabletTrackerRow) => {
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
          <CardTitle>Create tablet tracker login</CardTitle>
          <CardDescription>
            Dedicated email/password accounts for stat-tracking tablets. Only tablet logins can
            be tracker admins (Sports / settings).
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
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={isTrackerAdmin}
              onCheckedChange={(checked) => setIsTrackerAdmin(checked === true)}
            />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Tracker admin</p>
              <p className="text-xs text-muted-foreground">
                Can manage Sports / settings in the Tracker Console.
              </p>
            </div>
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            onClick={create}
            disabled={submitting || !email.trim() || password.length < 8}
          >
            {submitting ? "Creating…" : "Create login"}
          </Button>
          <div className="border-t pt-3">
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/tracker-logs">View tracker activity log →</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tablet tracker logins</CardTitle>
          <CardDescription>
            Email/password accounts for devices. Admins can open Sports and tracker settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : tabletRows.length === 0 ? (
            <div className="text-muted-foreground">No tablet tracker logins yet.</div>
          ) : (
            <ul className="space-y-2">
              {tabletRows.map((r) => (
                <li
                  key={r.uid}
                  className="flex flex-wrap items-center justify-between gap-2 border rounded-md px-3 py-2"
                >
                  <div>
                    <div className="font-medium">
                      {r.firstName || r.email}
                      {r.isTrackerAdmin ? (
                        <span className="ml-2 text-xs font-semibold text-primary">Admin</span>
                      ) : null}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {r.email}
                      {r.disabled && (
                        <span className="ml-2 text-destructive">Disabled</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void toggleAdmin(r)}
                      disabled={busyUid === r.uid}
                    >
                      {r.isTrackerAdmin ? "Remove admin" : "Make admin"}
                    </Button>
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
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void deleteTracker(r)}
                      disabled={busyUid === r.uid}
                    >
                      Delete
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
