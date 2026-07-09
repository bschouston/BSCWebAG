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

type TrackerRow = {
  uid: string;
  email: string | null;
  firstName: string;
  disabled: boolean;
};

type AuthorizedEmailRow = {
  id: string;
  email: string;
  label: string;
};

export default function TrackerLoginsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<TrackerRow[]>([]);
  const [authorizedEmails, setAuthorizedEmails] = useState<AuthorizedEmailRow[]>([]);
  const [publicGoogleLogin, setPublicGoogleLogin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [googleEmail, setGoogleEmail] = useState("");
  const [googleLabel, setGoogleLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [addingGoogle, setAddingGoogle] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const token = await user?.getIdToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const [trackersRes, accessRes] = await Promise.all([
      fetch("/api/admin/trackers", { headers }),
      fetch("/api/admin/tracker-access", { headers }),
    ]);
    const trackersData = await trackersRes.json();
    const accessData = await accessRes.json();
    setRows(trackersData.trackers ?? []);
    setAuthorizedEmails(accessData.authorizedEmails ?? []);
    setPublicGoogleLogin(accessData.publicGoogleLogin === true);
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const savePublicAccess = async (next: boolean) => {
    setSavingAccess(true);
    setAccessError(null);
    setPublicGoogleLogin(next);
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/admin/tracker-access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ publicGoogleLogin: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Failed to update access setting");
      }
    } catch (e: unknown) {
      setAccessError(e instanceof Error ? e.message : "Failed to save");
      setPublicGoogleLogin(!next);
    } finally {
      setSavingAccess(false);
    }
  };

  const addGoogleEmail = async () => {
    setAddingGoogle(true);
    setAccessError(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/admin/tracker-access/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: googleEmail, label: googleLabel }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Failed to add email");
      }
      setGoogleEmail("");
      setGoogleLabel("");
      await load();
    } catch (e: unknown) {
      setAccessError(e instanceof Error ? e.message : "Failed to add email");
    } finally {
      setAddingGoogle(false);
    }
  };

  const removeGoogleEmail = async (rowEmail: string) => {
    setBusyEmail(rowEmail);
    const token = await user?.getIdToken();
    await fetch(`/api/admin/tracker-access/emails?email=${encodeURIComponent(rowEmail)}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    setAuthorizedEmails((prev) => prev.filter((r) => r.email !== rowEmail));
    setBusyEmail(null);
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
          <CardTitle>Google sign-in access</CardTitle>
          <CardDescription>
            Control who can sign into the Tracker Console with Google. Tablet email/password
            logins below are unaffected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={publicGoogleLogin}
              disabled={savingAccess || loading}
              onCheckedChange={(checked) => void savePublicAccess(checked === true)}
            />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Public tracker (any Google account)</p>
              <p className="text-xs text-muted-foreground">
                When enabled, any Google sign-in can access the tracker without being on the
                allowlist.
              </p>
            </div>
          </label>

          {!publicGoogleLogin && (
            <div className="space-y-3 border-t pt-4">
              <div className="grid gap-3 md:grid-cols-[1fr_140px]">
                <div className="space-y-1">
                  <Label>Pre-authorized Google email</Label>
                  <Input
                    type="email"
                    value={googleEmail}
                    onChange={(e) => setGoogleEmail(e.target.value)}
                    placeholder="tracker@example.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Label (optional)</Label>
                  <Input
                    value={googleLabel}
                    onChange={(e) => setGoogleLabel(e.target.value)}
                    placeholder="Tablet 2"
                  />
                </div>
              </div>
              <Button
                onClick={() => void addGoogleEmail()}
                disabled={addingGoogle || !googleEmail.trim().includes("@")}
              >
                {addingGoogle ? "Adding…" : "Add authorized email"}
              </Button>
              {authorizedEmails.length === 0 ? (
                <p className="text-sm text-muted-foreground">No authorized Google emails yet.</p>
              ) : (
                <ul className="space-y-2">
                  {authorizedEmails.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 border rounded-md px-3 py-2"
                    >
                      <div>
                        <div className="font-medium">{r.email}</div>
                        {r.label ? (
                          <div className="text-xs text-muted-foreground">{r.label}</div>
                        ) : null}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyEmail === r.email}
                        onClick={() => void removeGoogleEmail(r.email)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {accessError ? <p className="text-sm text-destructive">{accessError}</p> : null}

          <div className="border-t pt-3">
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/tracker-logs">View tracker activity log →</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create tracker login</CardTitle>
          <CardDescription>
            Dedicated email/password accounts for stat-tracking tablets.
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
