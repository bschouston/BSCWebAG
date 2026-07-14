"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FIELD_TYPE_LABELS,
  type RegistrationFieldType,
  type RegistrationFormDoc,
  type RegistrationFormField,
  type RegistrationFormSection,
} from "@/lib/registration-forms/types";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";

const FIELD_TYPES = Object.keys(FIELD_TYPE_LABELS) as RegistrationFieldType[];

function newFieldId() {
  return `field_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export default function RegistrationFormEditorPage() {
  const params = useParams();
  const formId = params.formId as string;
  const { user } = useAuth();

  const [form, setForm] = useState<RegistrationFormDoc | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sections, setSections] = useState<RegistrationFormSection[]>([]);
  const [fields, setFields] = useState<RegistrationFormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/registration-forms/${formId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load");
      const f = data.form as RegistrationFormDoc;
      setForm(f);
      setName(f.name);
      setDescription(f.description ?? "");
      setSections([...f.sections].sort((a, b) => a.order - b.order));
      setFields([...f.fields].sort((a, b) => a.order - b.order));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user, formId]);

  useEffect(() => {
    if (user && formId) void load();
  }, [user, formId, load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/registration-forms/${formId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          sections: sections.map((s, i) => ({ ...s, order: i })),
          fields: fields.map((f, i) => ({ ...f, order: i })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Save failed");
      setForm(data.form);
      setNotice("Saved");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (index: number, patch: Partial<RegistrationFormField>) => {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const moveField = (index: number, dir: -1 | 1) => {
    setFields((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addField = () => {
    const sectionId = sections[0]?.id ?? "main";
    if (!sections.length) {
      setSections([{ id: "main", title: "Main", order: 0 }]);
    }
    setFields((prev) => [
      ...prev,
      {
        id: newFieldId(),
        sectionId,
        type: "text",
        label: "New field",
        required: false,
        enabled: true,
        order: prev.length,
      },
    ]);
  };

  const addSection = () => {
    const id = `sec_${Date.now().toString(36)}`;
    setSections((prev) => [...prev, { id, title: "New section", order: prev.length }]);
  };

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading form…</div>;
  }

  if (!form) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-destructive">{error ?? "Form not found"}</p>
        <Button variant="outline" asChild>
          <Link href="/admin/registration-forms">← Back</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="mb-1 -ml-2" asChild>
            <Link href="/admin/registration-forms">← Registration Forms</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Edit form</h1>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{form.slug}</p>
        </div>
        <Button onClick={() => void save()} disabled={saving || !name.trim()}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-green-600 dark:text-green-400">{notice}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Sections</CardTitle>
            <CardDescription>Group fields on the public form.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={addSection}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Section
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {sections.map((s, i) => (
            <div key={s.id} className="flex gap-2 items-center">
              <Input
                value={s.title}
                onChange={(e) =>
                  setSections((prev) =>
                    prev.map((x, idx) => (idx === i ? { ...x, title: e.target.value } : x))
                  )
                }
              />
              <Button
                variant="ghost"
                size="icon"
                disabled={sections.length <= 1}
                onClick={() => {
                  setSections((prev) => prev.filter((_, idx) => idx !== i));
                  setFields((prev) =>
                    prev.map((f) =>
                      f.sectionId === s.id
                        ? { ...f, sectionId: sections.find((x) => x.id !== s.id)?.id ?? "main" }
                        : f
                    )
                  );
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Fields</CardTitle>
            <CardDescription>Add, edit, hide, or delete. Keys are stored on event registrations.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={addField}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Field
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {fields.map((field, i) => (
            <div
              key={`${field.id}-${i}`}
              className="rounded-lg border p-3 space-y-3 bg-card"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[10rem]">
                  {field.id}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveField(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveField(i, 1)}
                    disabled={i === fields.length - 1}
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setFields((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="Delete field"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">Label</Label>
                  <Input
                    value={field.label}
                    onChange={(e) => updateField(i, { label: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={field.type}
                    onValueChange={(v) => updateField(i, { type: v as RegistrationFieldType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {FIELD_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Section</Label>
                  <Select
                    value={field.sectionId}
                    onValueChange={(v) => updateField(i, { sectionId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Field key</Label>
                  <Input
                    value={field.id}
                    onChange={(e) =>
                      updateField(i, {
                        id: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") || field.id,
                      })
                    }
                  />
                </div>
              </div>

              {(field.type === "select" || field.type === "checkboxGroup") && (
                <div className="space-y-1">
                  <Label className="text-xs">Options (comma-separated)</Label>
                  <Input
                    value={(field.options ?? []).join(", ")}
                    onChange={(e) =>
                      updateField(i, {
                        options: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={field.required}
                    onCheckedChange={(v) => updateField(i, { required: v === true })}
                  />
                  Required
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={field.enabled}
                    onCheckedChange={(v) => updateField(i, { enabled: v === true })}
                  />
                  Enabled (shown on form)
                </label>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
