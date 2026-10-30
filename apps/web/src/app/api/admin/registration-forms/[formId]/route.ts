import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/server-auth";
import { getFieldTypeCatalog } from "@/lib/registration-forms/field-types-server";
import {
  getRegistrationForm,
  listEventsUsingRegistrationForm,
  registrationFormsRef,
} from "@/lib/registration-forms/server";

export const dynamic = "force-dynamic";

const FieldSchema = z.object({
  id: z.string().min(1),
  sectionId: z.string().min(1),
  type: z.string().trim().min(1).max(40),
  label: z.string().min(1),
  description: z.string().optional(),
  agreementText: z.string().max(50000).optional(),
  required: z.boolean(),
  enabled: z.boolean(),
  order: z.number(),
  options: z.array(z.string()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  skillKeys: z.array(z.object({ key: z.string(), label: z.string() })).optional(),
  matrixRows: z.array(z.object({ key: z.string(), label: z.string() })).optional(),
  matrixColumns: z.array(z.object({ key: z.string(), label: z.string() })).optional(),
});

const PatchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  sections: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        order: z.number(),
        body: z.string().max(20000).optional(),
        color: z
          .string()
          .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
          .optional(),
      })
    )
    .optional(),
  fields: z.array(FieldSchema).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> }
) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const { formId } = await params;
  try {
    const form = await getRegistrationForm(formId);
    if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });
    return NextResponse.json({ form });
  } catch (err) {
    console.error("Get registration form failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> }
) {
  const { error, user } = await requireAdmin(request);
  if (error) return error;

  const { formId } = await params;
  try {
    const ref = registrationFormsRef().doc(formId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Form not found" }, { status: 404 });

    const parsed = PatchSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (parsed.data.fields) {
      const catalog = await getFieldTypeCatalog();
      const known = new Set(catalog.types.map((type) => type.id));
      const unknown = parsed.data.fields.find((field) => !known.has(field.type));
      if (unknown) {
        return NextResponse.json(
          { error: `Unknown field type “${unknown.type}”. Add it under Field types first.` },
          { status: 400 }
        );
      }
    }

    const updates: Record<string, unknown> = {
      ...parsed.data,
      updatedAt: Timestamp.now(),
      updatedBy: user.uid,
    };

    await ref.set(updates, { merge: true });
    const form = await getRegistrationForm(formId);
    return NextResponse.json({ form });
  } catch (err) {
    console.error("Patch registration form failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> }
) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const { formId } = await params;
  try {
    const ref = registrationFormsRef().doc(formId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Form not found" }, { status: 404 });

    const events = await listEventsUsingRegistrationForm(formId);
    if (events.length > 0) {
      return NextResponse.json(
        {
          error:
            "This form is attached to one or more events. Remove it from those events before deleting.",
          events,
        },
        { status: 409 }
      );
    }

    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete registration form failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
