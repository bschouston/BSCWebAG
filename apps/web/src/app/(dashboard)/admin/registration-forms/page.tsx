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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Eye, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

type UsageEvent = { id: string; title: string; status: string };

type DeleteDialog =
  | { form: RegistrationFormDoc; phase: "checking" }
  | { form: RegistrationFormDoc; phase: "blocked"; events: UsageEvent[] }
  | { form: RegistrationFormDoc; phase: "confirm" }
  | { form: RegistrationFormDoc; phase: "deleting" };

export default function RegistrationFormsPage() {
  const { user } = useAuth();
  const [forms, setForms] = useState<RegistrationFormDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialog | null>(null);

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

  const openDelete = async (form: RegistrationFormDoc) => {
    setDeleteDialog({ form, phase: "checking" });
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/registration-forms/${form.id}/usage`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Could not check whether this form is in use");
      const events = Array.isArray(data?.events) ? (data.events as UsageEvent[]) : [];
      setDeleteDialog(
        events.length > 0
          ? { form, phase: "blocked", events }
          : { form, phase: "confirm" }
      );
    } catch (e: unknown) {
      setDeleteDialog(null);
      setError(e instanceof Error ? e.message : "Could not check whether this form is in use");
    }
  };

  const confirmDelete = async () => {
    if (!deleteDialog || deleteDialog.phase !== "confirm") return;
    const form = deleteDialog.form;
    setDeleteDialog({ form, phase: "deleting" });
    setBusyId(form.id);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/registration-forms/${form.id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && Array.isArray(data?.events) && data.events.length > 0) {
        setDeleteDialog({ form, phase: "blocked", events: data.events as UsageEvent[] });
        return;
      }
      if (!res.ok) throw new Error(data?.error ?? "Delete failed");
      setForms((prev) => prev.filter((f) => f.id !== form.id));
      setDeleteDialog(null);
    } catch (e: unknown) {
      setDeleteDialog(null);
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
            Reusable templates for featured events. Submissions always save on the
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
            Duplicate a form to customize its fields, then link it from an event’s template dropdown.
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
                    <div className="font-medium truncate">{form.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {form.fields.filter((f) => f.enabled).length} fields
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
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${form.name}`}
                      disabled={busyId === form.id}
                      onClick={() => void openDelete(form)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={deleteDialog !== null}
        onOpenChange={(open) => {
          if (!open && deleteDialog?.phase !== "deleting") setDeleteDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteDialog?.phase === "blocked" ? "Form is in use" : "Delete registration form"}
            </DialogTitle>
            <DialogDescription>
              {deleteDialog?.phase === "checking" && "Checking whether any events use this form."}
              {deleteDialog?.phase === "blocked" &&
                `“${deleteDialog.form.name}” is attached to ${deleteDialog.events.length === 1 ? "an event" : `${deleteDialog.events.length} events`}. Remove it from the event template dropdown before deleting.`}
              {(deleteDialog?.phase === "confirm" || deleteDialog?.phase === "deleting") &&
                `Delete “${deleteDialog.form.name}”? This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>

          {deleteDialog?.phase === "blocked" && (
            <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
              {deleteDialog.events.map((event) => (
                <li key={event.id}>
                  <Link
                    href={`/admin/events/${event.id}`}
                    className="text-[#1a3556] underline underline-offset-2 dark:text-foreground"
                  >
                    {event.title}
                  </Link>
                  {event.status ? (
                    <span className="text-muted-foreground"> · {event.status}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            {deleteDialog?.phase === "checking" || deleteDialog?.phase === "deleting" ? (
              <Button
                variant="outline"
                disabled
                className="disabled:bg-muted disabled:text-foreground disabled:opacity-100"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                {deleteDialog.phase === "checking" ? "Checking" : "Deleting"}
              </Button>
            ) : deleteDialog?.phase === "blocked" ? (
              <Button variant="outline" onClick={() => setDeleteDialog(null)}>
                Close
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setDeleteDialog(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => void confirmDelete()}>
                  Delete form
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
