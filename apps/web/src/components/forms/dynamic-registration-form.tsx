"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useSearchParams } from "next/navigation";
import SignatureCanvas from "react-signature-canvas";
import { useTheme } from "next-themes";
import { Loader2, Upload, X } from "lucide-react";
import { storage } from "@/lib/firebase/client";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  RegistrationFormField,
  RegistrationFormSection,
} from "@/lib/registration-forms/types";

type FormMeta = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  sections: RegistrationFormSection[];
  fields: RegistrationFormField[];
};

function buildZodSchema(fields: RegistrationFormField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    if (!field.enabled) continue;
    let schema: z.ZodTypeAny;
    switch (field.type) {
      case "email":
        schema = z.string().trim().email("Invalid email");
        break;
      case "number":
      case "rating":
        schema = z.coerce.number();
        if (field.min != null) schema = (schema as z.ZodNumber).min(field.min);
        if (field.max != null) schema = (schema as z.ZodNumber).max(field.max);
        break;
      case "checkbox":
        schema = z.boolean().optional();
        break;
      case "checkboxGroup":
        schema = z.array(z.string()).optional();
        break;
      case "skillsGrid": {
        const skills: Record<string, z.ZodTypeAny> = {};
        for (const s of field.skillKeys ?? []) {
          skills[s.key] = z.coerce.number().min(1).max(10);
        }
        schema = z.object(skills);
        break;
      }
      case "photo":
      case "signature":
        schema = field.required ? z.string().min(1, "Required") : z.string().optional();
        break;
      default:
        schema = z.string();
        if (field.required) schema = (schema as z.ZodString).min(1, "Required");
        else schema = schema.optional();
        break;
    }
    if (!field.required && field.type !== "checkbox" && field.type !== "checkboxGroup" && field.type !== "skillsGrid") {
      schema = schema.optional().or(z.literal(""));
    }
    shape[field.id] = schema;
  }
  return z.object(shape);
}

export function DynamicRegistrationForm({
  formDef,
  registrationFee,
  eventTitle,
  registrationEndIso,
  registrationsClosedAtIso,
  registrationDeadline,
}: {
  formDef: FormMeta;
  registrationFee?: number;
  eventTitle?: string;
  registrationEndIso?: string;
  registrationsClosedAtIso?: string;
  registrationDeadline?: string;
}) {
  const searchParams = useSearchParams();
  const eventId = searchParams?.get("eventId");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<Record<string, File | null>>({});
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string | null>>({});
  const sigRefs = useRef<Record<string, SignatureCanvas | null>>({});
  const { resolvedTheme } = useTheme();
  const sigPenColor = resolvedTheme === "dark" ? "#ffffff" : "#000000";

  const enabledFields = useMemo(
    () => [...formDef.fields].filter((f) => f.enabled).sort((a, b) => a.order - b.order),
    [formDef.fields]
  );
  const sections = useMemo(
    () => [...formDef.sections].sort((a, b) => a.order - b.order),
    [formDef.sections]
  );
  const schema = useMemo(() => buildZodSchema(enabledFields), [enabledFields]);

  const defaults = useMemo(() => {
    const d: Record<string, unknown> = {};
    for (const f of enabledFields) {
      if (f.type === "checkbox") d[f.id] = false;
      else if (f.type === "checkboxGroup") d[f.id] = [];
      else if (f.type === "skillsGrid") {
        const skills: Record<string, number> = {};
        for (const s of f.skillKeys ?? []) skills[s.key] = 5;
        d[f.id] = skills;
      } else if (f.type === "number" || f.type === "rating") d[f.id] = f.min ?? 0;
      else d[f.id] = "";
    }
    return d;
  }, [enabledFields]);

  const form = useForm({
    resolver: zodResolver(schema) as any,
    defaultValues: defaults,
  });

  useEffect(() => {
    form.reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formDef.id]);

  const closed =
    !!registrationsClosedAtIso && Number.isFinite(Date.parse(registrationsClosedAtIso));
  const now = Date.now();
  const afterEnd =
    !closed &&
    ((registrationDeadline
      ? (() => {
          const m = registrationDeadline.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (!m) return false;
          return now >= new Date(+m[1], +m[2] - 1, +m[3], 23, 59).getTime();
        })()
      : false) ||
      (registrationEndIso ? now >= Date.parse(registrationEndIso) : false));

  const onSubmit = async (values: Record<string, unknown>) => {
    if (!eventId) {
      setFormError("Missing event. Open this form from an event registration link.");
      return;
    }
    if (closed) {
      setFormError("Registrations are closed for this event.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const payload: Record<string, unknown> = { ...values, eventId };

      for (const field of enabledFields) {
        if (field.type === "photo") {
          const file = photoFiles[field.id];
          if (file) {
            const path = `registrations/${eventId}/${Date.now()}_${file.name}`;
            const ref = storageRef(storage, path);
            await uploadBytes(ref, file);
            payload[field.id] = await getDownloadURL(ref);
          }
        }
        if (field.type === "signature") {
          const pad = sigRefs.current[field.id];
          if (pad && !pad.isEmpty()) {
            payload[field.id] = pad.getCanvas().toDataURL("image/png");
          } else if (field.required) {
            throw new Error(`Please sign: ${field.label}`);
          }
        }
      }

      const res = await fetch(`/api/events/${eventId}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Registration failed");
      setDone(true);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Registration received</CardTitle>
          <CardDescription>
            {afterEnd
              ? "You have been added to the waitlist."
              : "Thank you — your registration was submitted."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{formDef.name}</CardTitle>
        <CardDescription>
          {eventTitle ? `For ${eventTitle}` : formDef.description}
          {registrationFee != null ? ` · $${registrationFee}` : null}
          {afterEnd ? " · Waitlist mode" : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!eventId && (
          <p className="text-sm text-destructive mb-4">
            This form must be opened with an event link (?eventId=…).
          </p>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {sections.map((section) => {
              const sectionFields = enabledFields.filter((f) => f.sectionId === section.id);
              if (!sectionFields.length) return null;
              return (
                <div key={section.id} className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">{section.title}</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {sectionFields.map((field) => (
                      <div
                        key={field.id}
                        className={
                          field.type === "textarea" ||
                          field.type === "skillsGrid" ||
                          field.type === "photo" ||
                          field.type === "signature" ||
                          field.type === "checkboxGroup"
                            ? "sm:col-span-2"
                            : undefined
                        }
                      >
                        {renderField(field)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <Button type="submit" disabled={isSubmitting || !eventId || closed} className="w-full">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Submitting…
                </>
              ) : afterEnd ? (
                "Join waitlist"
              ) : (
                "Submit registration"
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );

  function renderField(field: RegistrationFormField) {
    if (field.type === "photo") {
      return (
        <div className="space-y-2">
          <FormLabel>
            {field.label}
            {field.required ? " *" : ""}
          </FormLabel>
          {photoPreviews[field.id] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoPreviews[field.id]!}
              alt=""
              className="h-32 w-32 object-cover rounded-md border"
            />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" asChild>
              <label className="cursor-pointer">
                <Upload className="h-4 w-4 mr-1" /> Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setPhotoFiles((p) => ({ ...p, [field.id]: file }));
                    if (file) {
                      const url = URL.createObjectURL(file);
                      setPhotoPreviews((p) => ({ ...p, [field.id]: url }));
                      form.setValue(field.id as any, "pending");
                    }
                  }}
                />
              </label>
            </Button>
            {photoPreviews[field.id] && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPhotoFiles((p) => ({ ...p, [field.id]: null }));
                  setPhotoPreviews((p) => ({ ...p, [field.id]: null }));
                  form.setValue(field.id as any, "");
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      );
    }

    if (field.type === "signature") {
      return (
        <div className="space-y-2">
          <FormLabel>
            {field.label}
            {field.required ? " *" : ""}
          </FormLabel>
          <div className="rounded-md border bg-background overflow-hidden">
            <SignatureCanvas
              ref={(r) => {
                sigRefs.current[field.id] = r;
              }}
              penColor={sigPenColor}
              canvasProps={{ className: "w-full h-40" }}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => sigRefs.current[field.id]?.clear()}
          >
            Clear
          </Button>
        </div>
      );
    }

    if (field.type === "skillsGrid") {
      return (
        <FormField
          control={form.control}
          name={field.id as any}
          render={() => (
            <FormItem>
              <FormLabel>
                {field.label}
                {field.required ? " *" : ""}
              </FormLabel>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {(field.skillKeys ?? []).map((s) => (
                  <FormField
                    key={s.key}
                    control={form.control}
                    name={`${field.id}.${s.key}` as any}
                    render={({ field: sf }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{s.label}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            name={sf.name}
                            onBlur={sf.onBlur}
                            ref={sf.ref}
                            value={typeof sf.value === "number" ? sf.value : Number(sf.value) || ""}
                            onChange={(e) => sf.onChange(e.target.valueAsNumber)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }

    if (field.type === "checkbox") {
      return (
        <FormField
          control={form.control}
          name={field.id as any}
          render={({ field: f }) => (
            <FormItem className="flex items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={!!f.value} onCheckedChange={f.onChange} />
              </FormControl>
              <FormLabel className="font-normal cursor-pointer">{field.label}</FormLabel>
            </FormItem>
          )}
        />
      );
    }

    if (field.type === "checkboxGroup") {
      return (
        <FormField
          control={form.control}
          name={field.id as any}
          render={({ field: f }) => (
            <FormItem>
              <FormLabel>{field.label}</FormLabel>
              <div className="space-y-2">
                {(field.options ?? []).map((opt) => {
                  const checked = Array.isArray(f.value) && f.value.includes(opt);
                  return (
                    <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const cur = Array.isArray(f.value) ? [...f.value] : [];
                          if (v === true) f.onChange([...cur, opt]);
                          else f.onChange(cur.filter((x) => x !== opt));
                        }}
                      />
                      {opt}
                    </label>
                  );
                })}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }

    if (field.type === "select") {
      return (
        <FormField
          control={form.control}
          name={field.id as any}
          render={({ field: f }) => (
            <FormItem>
              <FormLabel>
                {field.label}
                {field.required ? " *" : ""}
              </FormLabel>
              <Select
                onValueChange={f.onChange}
                value={typeof f.value === "string" && f.value ? f.value : undefined}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(field.options ?? []).map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }

    if (field.type === "textarea") {
      return (
        <FormField
          control={form.control}
          name={field.id as any}
          render={({ field: f }) => (
            <FormItem>
              <FormLabel>
                {field.label}
                {field.required ? " *" : ""}
              </FormLabel>
              <FormControl>
                <Textarea
                  name={f.name}
                  onBlur={f.onBlur}
                  ref={f.ref}
                  rows={3}
                  value={typeof f.value === "string" ? f.value : String(f.value ?? "")}
                  onChange={(e) => f.onChange(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }

    return (
      <FormField
        control={form.control}
        name={field.id as any}
        render={({ field: f }) => (
          <FormItem>
            <FormLabel>
              {field.label}
              {field.required ? " *" : ""}
            </FormLabel>
            <FormControl>
              <Input
                type={
                  field.type === "email"
                    ? "email"
                    : field.type === "tel"
                      ? "tel"
                      : field.type === "number" || field.type === "rating"
                        ? "number"
                        : field.type === "date"
                          ? "date"
                          : "text"
                }
                name={f.name}
                onBlur={f.onBlur}
                ref={f.ref}
                value={
                  field.type === "number" || field.type === "rating"
                    ? typeof f.value === "number"
                      ? f.value
                      : Number(f.value) || ""
                    : typeof f.value === "string"
                      ? f.value
                      : String(f.value ?? "")
                }
                onChange={(e) =>
                  field.type === "number" || field.type === "rating"
                    ? f.onChange(e.target.valueAsNumber)
                    : f.onChange(e.target.value)
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }
}
