"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

/** Section order first, then field order within the section. */
function sortFieldsBySection(
  fields: RegistrationFormField[],
  sections: RegistrationFormSection[]
): RegistrationFormField[] {
  const sectionOrder = new Map(sections.map((s, i) => [s.id, s.order ?? i]));
  return [...fields].sort((a, b) => {
    const sa = sectionOrder.get(a.sectionId) ?? Number.MAX_SAFE_INTEGER;
    const sb = sectionOrder.get(b.sectionId) ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return (a.order ?? 0) - (b.order ?? 0);
  });
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
      const sortedSections = [...f.sections].sort((a, b) => a.order - b.order);
      setSections(sortedSections);
      setFields(sortFieldsBySection(f.fields, sortedSections));
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
          fields: sortFieldsBySection(fields, sections).map((f, i) => ({ ...f, order: i })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Save failed");
      setForm(data.form);
      const saved = data.form as RegistrationFormDoc;
      const sortedSections = [...(saved.sections ?? sections)].sort((a, b) => a.order - b.order);
      setSections(sortedSections);
      setFields(sortFieldsBySection(saved.fields ?? fields, sortedSections));
      setNotice("Saved");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const sortedFields = useMemo(
    () => sortFieldsBySection(fields, sections),
    [fields, sections]
  );

  const fieldsBySection = useMemo(() => {
    const map = new Map<string, RegistrationFormField[]>();
    for (const s of sections) map.set(s.id, []);
    for (const f of sortedFields) {
      const list = map.get(f.sectionId);
      if (list) list.push(f);
      else {
        const orphan = map.get("__orphan__") ?? [];
        orphan.push(f);
        map.set("__orphan__", orphan);
      }
    }
    return map;
  }, [sortedFields, sections]);

  const updateField = (fieldId: string, patch: Partial<RegistrationFormField>) => {
    setFields((prev) => {
      const next = prev.map((f) => (f.id === fieldId ? { ...f, ...patch } : f));
      return patch.sectionId ? sortFieldsBySection(next, sections) : next;
    });
  };

  /** Reorder within the same section only. */
  const moveField = (fieldId: string, dir: -1 | 1) => {
    setFields((prev) => {
      const ordered = sortFieldsBySection(prev, sections);
      const index = ordered.findIndex((f) => f.id === fieldId);
      if (index < 0) return prev;
      const field = ordered[index];
      const target = index + dir;
      if (target < 0 || target >= ordered.length) return prev;
      if (ordered[target].sectionId !== field.sectionId) return prev;
      const next = [...ordered];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((f, i) => ({ ...f, order: i }));
    });
  };

  const addField = (sectionId?: string) => {
    const sid = sectionId ?? sections[0]?.id ?? "main";
    if (!sections.length) {
      setSections([{ id: "main", title: "Main", order: 0 }]);
    }
    setFields((prev) => {
      const inSection = prev.filter((f) => f.sectionId === sid);
      const maxOrder = inSection.reduce((m, f) => Math.max(m, f.order ?? 0), -1);
      return sortFieldsBySection(
        [
          ...prev,
          {
            id: newFieldId(),
            sectionId: sid,
            type: "text",
            label: "New field",
            required: false,
            enabled: true,
            order: maxOrder + 1,
          },
        ],
        sections.length ? sections : [{ id: "main", title: "Main", order: 0 }]
      );
    });
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
          <Button variant="outline" size="sm" onClick={() => addField()}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Field
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {sections.map((section) => {
            const sectionFields = fieldsBySection.get(section.id) ?? [];
            return (
              <div key={section.id} className="space-y-3">
                <div className="flex items-center justify-between gap-2 border-b pb-2">
                  <h3 className="text-sm font-semibold tracking-tight">{section.title}</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => addField(section.id)}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Field
                  </Button>
                </div>
                {sectionFields.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1">No fields in this section.</p>
                ) : (
                  sectionFields.map((field, iInSection) => {
                    const canUp = iInSection > 0;
                    const canDown = iInSection < sectionFields.length - 1;
                    return (
                      <div
                        key={field.id}
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
                              onClick={() => moveField(field.id, -1)}
                              disabled={!canUp}
                              aria-label="Move up"
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => moveField(field.id, 1)}
                              disabled={!canDown}
                              aria-label="Move down"
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setFields((prev) => prev.filter((f) => f.id !== field.id))
                              }
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
                              onChange={(e) => updateField(field.id, { label: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Type</Label>
                            <Select
                              value={field.type}
                              onValueChange={(v) =>
                                updateField(field.id, { type: v as RegistrationFieldType })
                              }
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
                              onValueChange={(v) => updateField(field.id, { sectionId: v })}
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
                                updateField(field.id, {
                                  id: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") || field.id,
                                })
                              }
                            />
                          </div>
                        </div>

                        {(field.type === "select" ||
                          field.type === "radio" ||
                          field.type === "checkboxGroup") && (
                          <div className="space-y-1">
                            <Label className="text-xs">Options (comma-separated)</Label>
                            <Input
                              value={(field.options ?? []).join(", ")}
                              onChange={(e) =>
                                updateField(field.id, {
                                  options: e.target.value
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                })
                              }
                            />
                          </div>
                        )}

                        {field.type === "matrix" && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-xs">
                                Rows (comma-separated labels; keys auto-slugified)
                              </Label>
                              <Input
                                value={(field.matrixRows ?? []).map((r) => r.label).join(", ")}
                                onChange={(e) =>
                                  updateField(field.id, {
                                    matrixRows: e.target.value
                                      .split(",")
                                      .map((s) => s.trim())
                                      .filter(Boolean)
                                      .map((label) => ({
                                        key: label
                                          .toLowerCase()
                                          .replace(/[^a-z0-9]+/g, "_")
                                          .replace(/^_|_$/g, ""),
                                        label,
                                      })),
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Columns (comma-separated)</Label>
                              <Input
                                value={(field.matrixColumns ?? []).map((c) => c.label).join(", ")}
                                onChange={(e) =>
                                  updateField(field.id, {
                                    matrixColumns: e.target.value
                                      .split(",")
                                      .map((s) => s.trim())
                                      .filter(Boolean)
                                      .map((label) => ({
                                        key: label
                                          .toLowerCase()
                                          .replace(/[^a-z0-9]+/g, "_")
                                          .replace(/^_|_$/g, ""),
                                        label,
                                      })),
                                  })
                                }
                              />
                            </div>
                          </div>
                        )}

                        {field.type === "skillsGrid" && (
                          <div className="space-y-1">
                            <Label className="text-xs">Skills (comma-separated labels)</Label>
                            <Input
                              value={(field.skillKeys ?? []).map((s) => s.label).join(", ")}
                              onChange={(e) =>
                                updateField(field.id, {
                                  skillKeys: e.target.value
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean)
                                    .map((label) => ({
                                      key: label
                                        .toLowerCase()
                                        .replace(/[^a-z0-9]+/g, "_")
                                        .replace(/^_|_$/g, ""),
                                      label,
                                    })),
                                })
                              }
                            />
                          </div>
                        )}

                        <div className="flex flex-wrap gap-4">
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={field.required}
                              onCheckedChange={(v) =>
                                updateField(field.id, { required: v === true })
                              }
                            />
                            Required
                          </label>
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={field.enabled}
                              onCheckedChange={(v) =>
                                updateField(field.id, { enabled: v === true })
                              }
                            />
                            Enabled (shown on form)
                          </label>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}

          {(fieldsBySection.get("__orphan__") ?? []).length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold tracking-tight text-destructive border-b pb-2">
                Unassigned section
              </h3>
              {(fieldsBySection.get("__orphan__") ?? []).map((field) => (
                <div key={field.id} className="rounded-lg border p-3 space-y-3 bg-card">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">{field.id}</span>
                    <Select
                      value={field.sectionId}
                      onValueChange={(v) => updateField(field.id, { sectionId: v })}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Assign section" />
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
                  <p className="text-sm">{field.label}</p>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
