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
  FormDescription,
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
import { TEAM_OWNERSHIP_BLURB } from "@/lib/registration-forms/team-ownership-copy";
import {
  PARTICIPATION_AGREEMENT_BODY,
  PARTICIPATION_AGREEMENT_TITLE,
  WAIVER_BODY,
  WAIVER_TITLE,
} from "@/lib/registration-forms/legal-agreements";

function isParticipationAgreementField(field: RegistrationFormField) {
  return (
    field.id === "participationAgreementSignature" ||
    (field.type === "signature" && /participation|agreement/i.test(field.id) && !/waiver/i.test(field.id))
  );
}

function isWaiverField(field: RegistrationFormField) {
  return field.id === "waiverSignature" || (field.type === "signature" && /waiver/i.test(field.id));
}

/** Half-width fields stay paired; known full-bleed types span the row. */
function isFullWidthField(field: RegistrationFormField) {
  return (
    field.type === "textarea" ||
    field.type === "skillsGrid" ||
    field.type === "matrix" ||
    field.type === "photo" ||
    field.type === "signature" ||
    field.type === "checkboxGroup" ||
    field.type === "checkbox" ||
    field.type === "radio" ||
    field.id === "studentStatus" ||
    field.id === "organizedLeaguesOutside" ||
    field.id === "previousTournaments" ||
    field.id === "preferredPosition" ||
    field.id === "skillLevel"
  );
}

type FormMeta = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  sections: RegistrationFormSection[];
  fields: RegistrationFormField[];
};

const DOB_PATTERN = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;

/** Text fields that represent a date of birth entered as MM/DD/YYYY. */
function isDobTextField(field: RegistrationFormField) {
  return (
    field.type === "text" &&
    (field.id === "dateOfBirth" ||
      /date of birth/i.test(field.label) ||
      /MM\/DD\/YYYY/i.test(field.description ?? ""))
  );
}

/** ITS membership number — exactly 8 digits. */
function isItsField(field: RegistrationFormField) {
  return (
    field.type === "text" &&
    (field.id === "its" || /\bITS\b/i.test(field.label))
  );
}

function buildZodSchema(fields: RegistrationFormField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    if (!field.enabled) continue;
    let schema: z.ZodTypeAny;
    switch (field.type) {
      case "email":
        schema = z.string().trim().email("Invalid email");
        break;
      case "tel":
        schema = z
          .string()
          .trim()
          .refine((v) => {
            const digits = v.replace(/\D/g, "");
            return digits.length >= 10 && digits.length <= 15;
          }, "Enter a valid phone number, e.g. (123) 456-7890");
        break;
      case "date":
        schema = z
          .string()
          .trim()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
          .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date");
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
      case "matrix": {
        const rows: Record<string, z.ZodTypeAny> = {};
        for (const row of field.matrixRows ?? []) {
          rows[row.key] = field.required
            ? z.string().min(1, "Required")
            : z.string().optional();
        }
        schema = z.object(rows);
        break;
      }
      case "photo":
      case "signature":
        schema = field.required ? z.string().min(1, "Required") : z.string().optional();
        break;
      default:
        if (isDobTextField(field)) {
          schema = z
            .string()
            .trim()
            .regex(DOB_PATTERN, "Enter date as MM/DD/YYYY, e.g. 03/27/2001")
            .refine((v) => {
              const [m, d, y] = v.split("/").map(Number);
              const date = new Date(y, m - 1, d);
              return (
                date.getFullYear() === y &&
                date.getMonth() === m - 1 &&
                date.getDate() === d &&
                date <= new Date()
              );
            }, "Enter a real past date as MM/DD/YYYY");
        } else if (isItsField(field)) {
          schema = z.string().trim().regex(/^\d{8}$/, "ITS number must be exactly 8 digits");
        } else {
          schema = z.string();
          if (field.required) schema = (schema as z.ZodString).min(1, "Required");
          else schema = schema.optional();
        }
        break;
    }
    if (
      !field.required &&
      field.type !== "checkbox" &&
      field.type !== "checkboxGroup" &&
      field.type !== "skillsGrid" &&
      field.type !== "matrix"
    ) {
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
  preview = false,
}: {
  formDef: FormMeta;
  registrationFee?: number;
  eventTitle?: string;
  registrationEndIso?: string;
  registrationsClosedAtIso?: string;
  registrationDeadline?: string;
  /** Admin template preview — no event required, submit disabled */
  preview?: boolean;
}) {
  const searchParams = useSearchParams();
  const eventId = preview ? null : searchParams?.get("eventId");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [previewAck, setPreviewAck] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<Record<string, File | null>>({});
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string | null>>({});
  const sigRefs = useRef<Record<string, SignatureCanvas | null>>({});
  const { resolvedTheme } = useTheme();
  const sigPenColor = resolvedTheme === "dark" ? "#ffffff" : "#000000";
  const sigCanvasBg = resolvedTheme === "dark" ? "#18181b" : "#ffffff";

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
      } else if (f.type === "matrix") {
        const matrix: Record<string, string> = {};
        for (const row of f.matrixRows ?? []) matrix[row.key] = "";
        d[f.id] = matrix;
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

  const onInvalid = (errors: Record<string, unknown>) => {
    const firstErrorId = Object.keys(errors)[0];
    setFormError("Please fix the highlighted fields before submitting.");
    if (firstErrorId) {
      const el =
        document.getElementById(`photo-${firstErrorId}`) ??
        document.querySelector(`[name="${firstErrorId}"], [name^="${firstErrorId}."]`);
      (el as HTMLElement | null)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const onSubmit = async (values: Record<string, unknown>) => {
    if (preview) {
      setPreviewAck(true);
      setFormError(null);
      return;
    }
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

  if (previewAck) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Preview check passed</CardTitle>
          <CardDescription>
            Validation succeeded. No data was saved — this is only a template preview.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={() => setPreviewAck(false)}>
            Back to form
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-12 max-w-4xl mx-auto">
      <div className="text-center space-y-4 mb-4">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">Registration</h1>
        <h2 className="text-2xl text-muted-foreground">{eventTitle || formDef.name}</h2>
        <p className="text-muted-foreground">
          {preview
            ? "Hi there, please fill out and submit this form."
            : formDef.description || "Hi there, please fill out and submit this form."}
          {!preview && registrationFee != null ? ` Registration fee: $${registrationFee}.` : ""}
          {!preview && afterEnd ? " Waitlist mode." : ""}
        </p>
        {!preview && !eventId && (
          <p className="text-sm text-destructive">
            This form must be opened with an event link (?eventId=…).
          </p>
        )}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-8">
          {sections.map((section) => {
            const sectionFields = enabledFields.filter((f) => f.sectionId === section.id);
            if (!sectionFields.length) return null;

            const isOwnership =
              section.id === "ownership" ||
              sectionFields.some((f) => f.id === "interestedInTeamOwnership");

            const agreementField = sectionFields.find(isParticipationAgreementField);
            const waiverField = sectionFields.find(isWaiverField);
            const photoFields = sectionFields.filter((f) => f.type === "photo");
            const mainFields = sectionFields.filter(
              (f) =>
                f.type !== "photo" &&
                !isParticipationAgreementField(f) &&
                !isWaiverField(f)
            );

            if (isOwnership) {
              return (
                <Card
                  key={section.id}
                  className="border-2 border-primary/20 bg-primary/5"
                >
                  <CardHeader>
                    <CardTitle>{section.title}</CardTitle>
                    <CardDescription>{TEAM_OWNERSHIP_BLURB.subtitle}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4 text-sm">
                      <div className="space-y-3 text-muted-foreground leading-relaxed">
                        {TEAM_OWNERSHIP_BLURB.paragraphs.map((p) => (
                          <p key={p.label}>
                            <span className="font-semibold text-foreground">{p.label}</span>{" "}
                            {p.body}
                          </p>
                        ))}
                        {TEAM_OWNERSHIP_BLURB.notes.map((n) => (
                          <p key={n.slice(0, 32)}>{n}</p>
                        ))}
                        <p className="text-xs italic">{TEAM_OWNERSHIP_BLURB.footnote}</p>
                      </div>
                      {sectionFields.map((field) => (
                        <div key={field.id}>{renderField(field)}</div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            }

            return (
              <div key={section.id} className="space-y-8">
                {mainFields.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>{section.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {renderFieldGrid(mainFields)}
                    </CardContent>
                  </Card>
                ) : null}

                {photoFields.map((field) => (
                  <Card key={field.id} id={`photo-${field.id}`}>
                    <CardHeader>
                      <CardTitle>Player Photo{field.required ? "*" : ""}</CardTitle>
                      <CardDescription>
                        {field.description ||
                          "Please upload a clear, recent photo of yourself for your player profile."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>{renderField(field)}</CardContent>
                  </Card>
                ))}

                {agreementField
                  ? renderLegalSignatureCard(
                      agreementField,
                      PARTICIPATION_AGREEMENT_TITLE,
                      PARTICIPATION_AGREEMENT_BODY,
                      "sig-agreement"
                    )
                  : null}

                {waiverField
                  ? renderLegalSignatureCard(
                      waiverField,
                      WAIVER_TITLE,
                      WAIVER_BODY,
                      "sig-waiver"
                    )
                  : null}
              </div>
            );
          })}

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <div className="flex items-center justify-end gap-3 w-full pt-2">
            <Button
              type="submit"
              size="sm"
              className="h-10 min-w-[120px] px-5 font-semibold text-sm"
              disabled={isSubmitting || (!preview && (!eventId || closed))}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit →"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );

  function renderFieldGrid(fields: RegistrationFormField[]) {
    const title = fields.find((f) => f.id === "title");
    const firstName = fields.find((f) => f.id === "firstName");
    const lastName = fields.find((f) => f.id === "lastName");
    const useNameRow = !!(title && firstName && lastName);
    const rest = useNameRow
      ? fields.filter((f) => !["title", "firstName", "lastName"].includes(f.id))
      : fields;

    return (
      <div className="space-y-6">
        {useNameRow ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-6 items-start">
            <div>{renderField(title!)}</div>
            <div>{renderField(firstName!)}</div>
            <div>{renderField(lastName!)}</div>
          </div>
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6 items-start">
          {rest.map((field) => (
            <div key={field.id} className={isFullWidthField(field) ? "md:col-span-2" : "min-w-0"}>
              {renderField(field)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderLegalSignatureCard(
    field: RegistrationFormField,
    title: string,
    body: string,
    anchorId: string
  ) {
    return (
      <Card key={field.id} id={anchorId}>
        <CardHeader>
          <CardTitle className="text-destructive">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <div className="max-h-64 overflow-y-auto p-4 border rounded-md whitespace-pre-wrap leading-relaxed text-muted-foreground bg-muted/30">
            {body}
          </div>
          <div
            className="border-2 border-dashed border-primary/20 bg-background rounded-md relative touch-none"
            style={{ height: 200 }}
          >
            <SignatureCanvas
              key={`${field.id}-${resolvedTheme ?? "light"}`}
              ref={(r) => {
                sigRefs.current[field.id] = r;
              }}
              penColor={sigPenColor}
              canvasProps={{
                className: "w-full h-full absolute inset-0 cursor-crosshair rounded-md",
                style: { backgroundColor: sigCanvasBg },
              }}
              onEnd={() => {
                const pad = sigRefs.current[field.id];
                if (pad && !pad.isEmpty()) {
                  form.setValue(field.id as any, "signed", { shouldValidate: true });
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="absolute top-2 right-2 text-xs h-7"
              onClick={() => {
                sigRefs.current[field.id]?.clear();
                form.setValue(field.id as any, "", { shouldValidate: true });
              }}
            >
              Clear
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Please sign your name inside the box above to accept the terms.
          </p>
          <FormField
            control={form.control}
            name={field.id as any}
            render={() => <FormMessage />}
          />
        </CardContent>
      </Card>
    );
  }

  function renderField(field: RegistrationFormField) {
    if (field.type === "photo") {
      return (
        <div className="flex flex-col md:flex-row gap-4 items-start">
          <div className="flex-1 space-y-2">
            <FormLabel>Upload Photo{field.required ? "*" : ""}</FormLabel>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  const input = document.getElementById(
                    `photo-input-${field.id}`
                  ) as HTMLInputElement | null;
                  input?.click();
                }}
              >
                <Upload className="h-4 w-4" />
                Choose Photo
              </Button>
              <input
                id={`photo-input-${field.id}`}
                type="file"
                accept="image/*,.pdf,.heic,.heif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setPhotoFiles((p) => ({ ...p, [field.id]: file }));
                  if (file) {
                    const url = URL.createObjectURL(file);
                    setPhotoPreviews((p) => ({ ...p, [field.id]: url }));
                    form.setValue(field.id as any, "pending", { shouldValidate: true });
                  } else {
                    setPhotoPreviews((p) => ({ ...p, [field.id]: null }));
                    form.setValue(field.id as any, "", { shouldValidate: true });
                  }
                }}
              />
              {(photoFiles[field.id] || photoPreviews[field.id]) && (
                <Button
                  type="button"
                  variant="ghost"
                  className="gap-2 text-muted-foreground"
                  onClick={() => {
                    setPhotoFiles((p) => ({ ...p, [field.id]: null }));
                    setPhotoPreviews((p) => ({ ...p, [field.id]: null }));
                    form.setValue(field.id as any, "");
                  }}
                >
                  <X className="h-4 w-4" /> Clear
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Supports jpeg, png, heic, pdf, and other common file types (max 20MB).
            </p>
            <FormField
              control={form.control}
              name={field.id as any}
              render={() => <FormMessage />}
            />
          </div>
          <div className="h-28 w-28 rounded-md border bg-muted/40 flex items-center justify-center overflow-hidden text-xs text-muted-foreground shrink-0">
            {photoPreviews[field.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoPreviews[field.id]!}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              "No file selected"
            )}
          </div>
        </div>
      );
    }

    if (field.type === "signature") {
      // Legal agreement / waiver signatures are rendered as dedicated cards.
      if (isParticipationAgreementField(field) || isWaiverField(field)) {
        return null;
      }
      return (
        <div className="space-y-2 w-full">
          <FormLabel>
            {field.label}
            {field.required ? " *" : ""}
          </FormLabel>
          <div
            className="border-2 border-dashed border-primary/20 bg-background rounded-md relative touch-none overflow-hidden"
            style={{ height: 160 }}
          >
            <SignatureCanvas
              ref={(r) => {
                sigRefs.current[field.id] = r;
              }}
              penColor={sigPenColor}
              canvasProps={{
                className: "w-full h-full absolute inset-0 cursor-crosshair rounded-md",
                style: { backgroundColor: sigCanvasBg },
              }}
              onEnd={() => {
                const pad = sigRefs.current[field.id];
                if (pad && !pad.isEmpty()) {
                  form.setValue(field.id as any, "signed", { shouldValidate: true });
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="absolute top-2 right-2 text-xs h-7"
              onClick={() => {
                sigRefs.current[field.id]?.clear();
                form.setValue(field.id as any, "", { shouldValidate: true });
              }}
            >
              Clear
            </Button>
          </div>
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

    if (field.type === "matrix") {
      const columns = field.matrixColumns ?? [];
      const rows = field.matrixRows ?? [];
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
              {field.description ? (
                <p className="text-xs text-muted-foreground">{field.description}</p>
              ) : null}
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm min-w-[28rem]">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left p-2 font-medium w-32" />
                      {columns.map((col) => (
                        <th key={col.key} className="p-2 font-medium text-center whitespace-nowrap">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <FormField
                        key={row.key}
                        control={form.control}
                        name={`${field.id}.${row.key}` as any}
                        render={({ field: rf }) => (
                          <tr className="border-b last:border-0">
                            <td className="p-2 font-medium whitespace-nowrap">{row.label}</td>
                            {columns.map((col) => (
                              <td key={col.key} className="p-2 text-center">
                                <input
                                  type="radio"
                                  className="h-4 w-4 accent-primary"
                                  name={`${field.id}-${row.key}`}
                                  value={col.key}
                                  checked={rf.value === col.key}
                                  onChange={() => rf.onChange(col.key)}
                                  onBlur={rf.onBlur}
                                  aria-label={`${row.label}: ${col.label}`}
                                />
                              </td>
                            ))}
                          </tr>
                        )}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }

    if (field.type === "checkbox") {
      const ownershipLabel =
        field.id === "interestedInTeamOwnership"
          ? TEAM_OWNERSHIP_BLURB.checkboxLabel
          : field.label;
      return (
        <FormField
          control={form.control}
          name={field.id as any}
          render={({ field: f }) => (
            <FormItem
              className={
                field.id === "interestedInTeamOwnership"
                  ? "flex items-start gap-3 rounded-lg border bg-background p-4 space-y-0"
                  : "flex items-center gap-2 space-y-0"
              }
            >
              <FormControl>
                <Checkbox checked={!!f.value} onCheckedChange={f.onChange} />
              </FormControl>
              <FormLabel className="font-normal cursor-pointer">{ownershipLabel}</FormLabel>
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
            <FormItem className="space-y-2 w-full">
              <FormLabel>
                {field.label}
                {field.required ? " *" : ""}
              </FormLabel>
              <Select
                onValueChange={f.onChange}
                value={typeof f.value === "string" && f.value ? f.value : undefined}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
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

    if (field.type === "radio") {
      return (
        <FormField
          control={form.control}
          name={field.id as any}
          render={({ field: f }) => (
            <FormItem className="space-y-3 w-full">
              <FormLabel>
                {field.label}
                {field.required ? " *" : ""}
              </FormLabel>
              {field.description ? <FormDescription>{field.description}</FormDescription> : null}
              <FormControl>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {(field.options ?? []).map((opt) => {
                    const inputId = `${field.id}-${opt}`;
                    return (
                      <label
                        key={opt}
                        htmlFor={inputId}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <input
                          id={inputId}
                          type="radio"
                          className="h-4 w-4 accent-primary"
                          name={field.id}
                          value={opt}
                          checked={f.value === opt}
                          onChange={() => f.onChange(opt)}
                          onBlur={f.onBlur}
                        />
                        {opt}
                      </label>
                    );
                  })}
                </div>
              </FormControl>
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
            <FormItem className="space-y-2 w-full">
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
                  placeholder={
                    field.id === "studentStatus"
                      ? "e.g. University of Houston"
                      : field.id === "email"
                        ? "example@example.com"
                        : field.id === "whatsappNumber"
                          ? "(###) ###-####"
                          : undefined
                  }
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
              {field.description ? (
                <FormDescription>{field.description}</FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
        )}
      />
    );
  }
}
