"use client";

import { useCallback, useEffect, useState } from "react";
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
import type { RegistrationFormDoc } from "@/lib/registration-forms/types";
import { Copy, Eye, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

export default function RegistrationFormsPage() {
  const { user } = useAuth();
  const [forms, setForms] = useState<RegistrationFormDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/admin/registration-forms", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load forms");
      setForms(data.forms ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const duplicate = async (formId: string) => {
    setBusyId(formId);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/registration-forms/${formId}/duplicate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Duplicate failed");
      window.location.assign(`/admin/registration-forms/${data.form.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Duplicate failed");
      setBusyId(null);
    }
  };

  const remove = async (form: RegistrationFormDoc) => {
    if (form.isSystem) return;
    if (!window.confirm(`Delete form “${form.name}”? This cannot be undone.`)) return;
    setBusyId(form.id);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/registration-forms/${form.id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Delete failed");
      }
      setForms((prev) => prev.filter((f) => f.id !== form.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const createBlank = async () => {
    setBusyId("new");
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/admin/registration-forms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: "New registration form" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Create failed");
      window.location.assign(`/admin/registration-forms/${data.form.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Create failed");
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Registration Forms</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reusable templates for featured/monthly events. Submissions always save on the
            event, not on the form.
          </p>
        </div>
        <Button onClick={() => void createBlank()} disabled={busyId === "new"}>
          {busyId === "new" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
          New blank form
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
          <CardDescription>
            Duplicate the volleyball form to customize fields for soccer or other sports, then
            link it from an event’s template dropdown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : forms.length === 0 ? (
            <p className="text-sm text-muted-foreground">No forms yet.</p>
          ) : (
            <ul className="space-y-2">
              {forms.map((form) => (
                <li
                  key={form.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {form.name}
                      {form.isSystem ? (
                        <span className="ml-2 text-xs text-muted-foreground font-normal">
                          system
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {form.fields.filter((f) => f.enabled).length} fields · slug{" "}
                      <span className="font-mono">{form.slug}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        href={`/admin/registration-forms/${form.id}/preview`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" /> View
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/admin/registration-forms/${form.id}`}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === form.id}
                      onClick={() => void duplicate(form.id)}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" /> Duplicate
                    </Button>
                    {!form.isSystem && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === form.id}
                        onClick={() => void remove(form)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
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
