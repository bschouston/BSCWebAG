"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { DynamicRegistrationForm } from "@/components/forms/dynamic-registration-form";
import type { FieldTypeDefinition } from "@/lib/registration-forms/field-types";
import type { RegistrationFormDoc } from "@/lib/registration-forms/types";

function PreviewInner({
  form,
  fieldTypes,
}: {
  form: RegistrationFormDoc;
  fieldTypes: FieldTypeDefinition[];
}) {
  return (
    <DynamicRegistrationForm
      preview
      formDef={{
        id: form.id,
        name: form.name,
        description: form.description,
        sections: form.sections,
        fields: form.fields,
      }}
      eventTitle={form.name}
      fieldTypes={fieldTypes}
    />
  );
}

export default function RegistrationFormPreviewPage() {
  const params = useParams();
  const formId = params.formId as string;
  const { user } = useAuth();
  const [form, setForm] = useState<RegistrationFormDoc | null>(null);
  const [fieldTypes, setFieldTypes] = useState<FieldTypeDefinition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !formId) return;
    let mounted = true;
    void (async () => {
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [res, typesRes] = await Promise.all([
          fetch(`/api/admin/registration-forms/${formId}`, { headers }),
          fetch("/api/admin/registration-field-types", { headers }),
        ]);
        const data = await res.json().catch(() => ({}));
        const typesData = await typesRes.json().catch(() => ({}));
        if (!mounted) return;
        if (!res.ok) throw new Error(data?.error ?? "Failed to load form");
        setForm(data.form);
        if (typesRes.ok && Array.isArray(typesData.types)) setFieldTypes(typesData.types);
      } catch (e: unknown) {
        if (mounted) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user, formId]);

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading preview…</div>;
  }

  if (error || !form) {
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
    <div className="min-h-screen bg-muted/20 -mx-4 md:-mx-8 px-4 md:px-8 py-8">
      <div className="space-y-4 max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Button variant="ghost" size="sm" className="mb-1 -ml-2" asChild>
              <Link href="/admin/registration-forms">← Registration Forms</Link>
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">Preview</h1>
            <p className="text-sm text-muted-foreground">{form.name}</p>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/admin/registration-forms/${form.id}`}>Edit form</Link>
          </Button>
        </div>

        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          Preview only — nothing is submitted. This matches how the live registration form looks.
        </div>

        <Suspense fallback={<div className="text-muted-foreground p-4">Loading form…</div>}>
          <PreviewInner form={form} fieldTypes={fieldTypes} />
        </Suspense>
      </div>
    </div>
  );
}
