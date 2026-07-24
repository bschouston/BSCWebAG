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

type GoogleUserRow = {
  uid: string;
  email: string | null;
  firstName: string;
  lastName: string;
  disabled: boolean;
  fantasySessionActive: boolean;
};

type AdminRow = {
  uid: string;
  email: string | null;
  firstName: string;
  disabled: boolean;
};

export default function FantasyLoginsPage() {
  const { user } = useAuth();
  const [googleUsers, setGoogleUsers] = useState<GoogleUserRow[]>([]);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const authHeaders = async (): Promise<Record<string, string>> => {
    const token = await user?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const load = async () => {
    setLoading(true);
    const headers = await authHeaders();
    const [uRes, aRes] = await Promise.all([
      fetch("/api/admin/fantasy-users", { headers }),
      fetch("/api/admin/fantasy-admins", { headers }),
    ]);
    const uData = await uRes.json().catch(() => ({}));
    const aData = await aRes.json().catch(() => ({}));
    setGoogleUsers(uData.users ?? []);
    setAdmins(aData.admins ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (user) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const createAdmin = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/fantasy-admins", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Create failed");
      setName("");
      setEmail("");
      setPassword("");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleUserDisabled = async (uid: string, fantasyDisabled: boolean) => {
    setBusyUid(uid);
    const headers = await authHeaders();
    await fetch("/api/admin/fantasy-users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ uid, fantasyDisabled }),
    });
    await load();
    setBusyUid(null);
  };

  const toggleAdminDisabled = async (uid: string, fantasyDisabled: boolean) => {
    setBusyUid(uid);
    const headers = await authHeaders();
    await fetch("/api/admin/fantasy-admins", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ uid, fantasyDisabled }),
    });
    await load();
    setBusyUid(null);
  };

  const resetAdminPassword = async (uid: string) => {
    if (resetPassword.length < 8) {
      window.alert("Password must be at least 8 characters");
      return;
    }
    setBusyUid(uid);
    const headers = await authHeaders();
    await fetch("/api/admin/fantasy-admins", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ uid, password: resetPassword }),
    });
    setResetPassword("");
    setBusyUid(null);
    window.alert("Password updated");
  };

  const deleteAdmin = async (uid: string) => {
    if (!window.confirm("Delete this Fantasy admin account?")) return;
    setBusyUid(uid);
    const headers = await authHeaders();
    await fetch(`/api/admin/fantasy-admins?uid=${encodeURIComponent(uid)}`, {
      method: "DELETE",
      headers,
    });
    await load();
    setBusyUid(null);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fantasy Logins</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Google players sign up on the Fantasy site. Fantasy admins use dedicated email/password
          accounts you create here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create Fantasy admin login</CardTitle>
          <CardDescription>
            Email/password accounts for managing pools, locks, and teams on the Fantasy site.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Display name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button
            onClick={() => void createAdmin()}
            disabled={submitting || !email.includes("@") || password.length < 8}
          >
            {submitting ? "Creating…" : "Create admin"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fantasy admin accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : admins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admin logins yet.</p>
          ) : (
            admins.map((a) => (
              <div
                key={a.uid}
                className="flex flex-wrap items-center gap-2 border rounded-md px-3 py-2"
              >
                <div className="flex-1 min-w-[160px]">
                  <div className="font-medium text-sm">{a.firstName || "Admin"}</div>
                  <div className="text-xs text-muted-foreground">{a.email}</div>
                  {a.disabled ? (
                    <div className="text-xs text-destructive">Disabled</div>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyUid === a.uid}
                  onClick={() => void toggleAdminDisabled(a.uid, !a.disabled)}
                >
                  {a.disabled ? "Enable" : "Disable"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyUid === a.uid}
                  onClick={() => void deleteAdmin(a.uid)}
                >
                  Delete
                </Button>
              </div>
            ))
          )}
          <div className="flex flex-wrap gap-2 items-end border-t pt-3">
            <div className="space-y-1">
              <Label className="text-xs">Reset password (then click Reset on a row)</Label>
              <Input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="New password (8+ chars)"
                className="max-w-xs"
              />
            </div>
            {admins.map((a) => (
              <Button
                key={`pw-${a.uid}`}
                size="sm"
                variant="secondary"
                disabled={busyUid === a.uid || resetPassword.length < 8}
                onClick={() => void resetAdminPassword(a.uid)}
              >
                Reset {a.firstName || a.email}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Google fantasy users</CardTitle>
          <CardDescription>
            Players who signed in with Google on the Fantasy site. Emails shown here for
            admin management only — never shown on the Fantasy site team pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : googleUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Google fantasy users yet.</p>
          ) : (
            googleUsers.map((u) => (
              <div
                key={u.uid}
                className="flex flex-wrap items-center gap-2 border rounded-md px-3 py-2"
              >
                <div className="flex-1 min-w-[160px]">
                  <div className="font-medium text-sm">
                    {[u.firstName, u.lastName].filter(Boolean).join(" ") || "Player"}
                  </div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyUid === u.uid}
                  onClick={() => void toggleUserDisabled(u.uid, !u.disabled)}
                >
                  {u.disabled ? "Enable" : "Disable"}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
