"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  FIELD_BEHAVIOR_LABELS,
  FIELD_BEHAVIORS,
  slugifyFieldTypeId,
  type FieldTypeDefinition,
} from "@/lib/registration-forms/field-types";
import type { RegistrationFieldType } from "@/lib/registration-forms/types";

type UsageForm = { id: string; name: string };

type EditorState = {
  mode: "create" | "edit";
  id: string;
  name: string;
  base: RegistrationFieldType;
  sublabel: string;
  example: string;
  behaviorLocked: boolean;
};

type DeleteState =
  | { type: FieldTypeDefinition; phase: "checking" }
  | { type: FieldTypeDefinition; phase: "blocked"; forms: UsageForm[] }
  | { type: FieldTypeDefinition; phase: "confirm" }
  | { type: FieldTypeDefinition; phase: "deleting" };

async function authHeaders(token: string | undefined, json = false): Promise<HeadersInit> {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export function FieldTypesCard() {
  const { user } = useAuth();
  const [types, setTypes] = useState<FieldTypeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/admin/registration-field-types", {
        headers: await authHeaders(token),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load field types");
      setTypes(data.types ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load field types");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const openCreate = () => {
    setError(null);
    setEditor({
      mode: "create",
      id: "",
      name: "",
      base: "text",
      sublabel: "",
      example: "",
      behaviorLocked: false,
    });
  };

  const openEdit = async (type: FieldTypeDefinition) => {
    setError(null);
    setEditor({
      mode: "edit",
      id: type.id,
      name: type.name,
      base: type.base,
      sublabel: type.sublabel,
      example: type.example,
      behaviorLocked: false,
    });
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/registration-field-types/${type.id}/usage`, {
        headers: await authHeaders(token),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.forms) && data.forms.length) {
        setEditor((current) =>
          current && current.id === type.id ? { ...current, behaviorLocked: true } : current
        );
      }
    } catch {
      // The server still refuses a behavior change when the type is in use.
    }
  };

  const save = async () => {
    if (!editor) return;
    setSaving(true);
    setError(null);
    try {
      const token = await user?.getIdToken();
      const id = editor.mode === "create" ? slugifyFieldTypeId(editor.id || editor.name) : editor.id;
      const body = {
        id,
        name: editor.name.trim(),
        base: editor.base,
        sublabel: editor.sublabel,
        example: editor.example,
      };
      const res = await fetch(
        editor.mode === "create"
          ? "/api/admin/registration-field-types"
          : `/api/admin/registration-field-types/${editor.id}`,
        {
          method: editor.mode === "create" ? "POST" : "PATCH",
          headers: await authHeaders(token, true),
          body: JSON.stringify(body),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Save failed");
      setTypes(data.types ?? []);
      setEditor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const openDelete = async (type: FieldTypeDefinition) => {
    setDeleteState({ type, phase: "checking" });
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/registration-field-types/${type.id}/usage`, {
        headers: await authHeaders(token),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Could not check where this type is used");
      const forms = (data.forms ?? []) as UsageForm[];
      setDeleteState(forms.length ? { type, phase: "blocked", forms } : { type, phase: "confirm" });
    } catch (err) {
      setDeleteState(null);
      setError(err instanceof Error ? err.message : "Could not check where this type is used");
    }
  };

  const confirmDelete = async () => {
    if (!deleteState || deleteState.phase !== "confirm") return;
    const type = deleteState.type;
    setDeleteState({ type, phase: "deleting" });
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/registration-field-types/${type.id}`, {
        method: "DELETE",
        headers: await authHeaders(token),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && Array.isArray(data.forms)) {
          setDeleteState({ type, phase: "blocked", forms: data.forms as UsageForm[] });
          return;
        }
        throw new Error(data?.error ?? "Delete failed");
      }
      setTypes(data.types ?? []);
      setDeleteState(null);
    } catch (err) {
      setDeleteState(null);
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Field types</CardTitle>
          <CardDescription>
            Optional sublabel and example for every field of that type. A new type uses an existing input.
          </CardDescription>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" />
          Add type
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : types.length === 0 ? (
          <p className="text-sm text-muted-foreground">No field types yet.</p>
        ) : (
          <ul className="space-y-2">
            {types.map((type) => (
              <li key={type.id} className="rounded-md border px-3 py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">{type.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {FIELD_BEHAVIOR_LABELS[type.base]} · {type.id}
                    </div>
                    {type.sublabel ? (
                      <p className="mt-1 text-sm text-foreground">{type.sublabel}</p>
                    ) : null}
                    {type.example ? (
                      <p className="text-sm text-muted-foreground">Example: {type.example}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button type="button" variant="outline" size="sm" onClick={() => void openEdit(type)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${type.name}`}
                      onClick={() => void openDelete(type)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={editor !== null} onOpenChange={(open) => { if (!open && !saving) setEditor(null); }}>
        <DialogContent className="text-foreground">
          <DialogHeader>
            <DialogTitle>{editor?.mode === "create" ? "Add field type" : "Edit field type"}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Sublabel and example are optional. Every field of this type uses them.
            </DialogDescription>
          </DialogHeader>
          {editor ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-foreground">Name</Label>
                <Input
                  className="text-foreground"
                  value={editor.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setEditor((current) =>
                      current
                        ? {
                            ...current,
                            name,
                            id: current.mode === "create" ? slugifyFieldTypeId(name) : current.id,
                          }
                        : current
                    );
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-foreground">Id</Label>
                <Input className="text-foreground" value={editor.id} readOnly disabled />
              </div>
              <div className="space-y-1">
                <Label className="text-foreground">Behavior</Label>
                <Select
                  value={editor.base}
                  onValueChange={(value) =>
                    setEditor((current) =>
                      current ? { ...current, base: value as RegistrationFieldType } : current
                    )
                  }
                  disabled={editor.behaviorLocked}
                >
                  <SelectTrigger className="text-foreground disabled:bg-muted disabled:text-foreground disabled:opacity-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_BEHAVIORS.map((behavior) => (
                      <SelectItem key={behavior} value={behavior}>
                        {FIELD_BEHAVIOR_LABELS[behavior]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editor.behaviorLocked ? (
                  <p className="text-xs text-muted-foreground">
                    Behavior stays locked while a form uses this type.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label className="text-foreground">Sublabel</Label>
                <Textarea
                  className="min-h-20 text-foreground"
                  value={editor.sublabel}
                  onChange={(e) =>
                    setEditor((current) => (current ? { ...current, sublabel: e.target.value } : current))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-foreground">Example</Label>
                <Input
                  className="text-foreground"
                  value={editor.example}
                  onChange={(e) =>
                    setEditor((current) => (current ? { ...current, example: e.target.value } : current))
                  }
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditor(null)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void save()}
              disabled={saving || !editor?.name.trim()}
              className="disabled:bg-muted disabled:text-foreground disabled:opacity-100"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteState !== null}
        onOpenChange={(open) => {
          if (!open && deleteState?.phase !== "deleting") setDeleteState(null);
        }}
      >
        <DialogContent className="text-foreground">
          <DialogHeader>
            <DialogTitle>
              {deleteState?.phase === "blocked" ? "Field type is in use" : "Delete field type"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {deleteState?.phase === "checking" && "Checking whether any forms use this type."}
              {deleteState?.phase === "blocked" &&
                `“${deleteState.type.name}” is used on ${deleteState.forms.length === 1 ? "a form" : `${deleteState.forms.length} forms`}. Change those fields before deleting.`}
              {(deleteState?.phase === "confirm" || deleteState?.phase === "deleting") &&
                `Delete “${deleteState.type.name}”? This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          {deleteState?.phase === "blocked" ? (
            <ul className="max-h-48 space-y-1 overflow-y-auto text-sm text-foreground">
              {deleteState.forms.map((form) => (
                <li key={form.id}>
                  <Link
                    href={`/admin/registration-forms/${form.id}`}
                    className="text-[#1a3556] underline underline-offset-2 dark:text-foreground"
                  >
                    {form.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <DialogFooter>
            {deleteState?.phase === "checking" || deleteState?.phase === "deleting" ? (
              <Button
                type="button"
                variant="outline"
                disabled
                className="disabled:bg-muted disabled:text-foreground disabled:opacity-100"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                {deleteState.phase === "checking" ? "Checking" : "Deleting"}
              </Button>
            ) : deleteState?.phase === "blocked" ? (
              <Button type="button" variant="outline" onClick={() => setDeleteState(null)}>
                Close
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setDeleteState(null)}>
                  Cancel
                </Button>
                <Button type="button" variant="destructive" onClick={() => void confirmDelete()}>
                  Delete type
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
