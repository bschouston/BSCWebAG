import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth/server-auth";
import { getRegistrationForm, registrationFormsRef } from "@/lib/registration-forms/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> }
) {
  const { error, user } = await requireAdmin(request);
  if (error) return error;

  const { formId } = await params;
  try {
    const source = await getRegistrationForm(formId);
    if (!source) return NextResponse.json({ error: "Form not found" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const name = (body.name?.trim() || `Copy of ${source.name}`).slice(0, 80);
    const ref = registrationFormsRef().doc();
    const doc = {
      name,
      description: source.description ?? "",
      status: "ACTIVE" as const,
      sections: source.sections.map((s) => ({ ...s })),
      fields: source.fields.map((f) => ({ ...f })),
      duplicatedFrom: source.id,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      updatedBy: user.uid,
    };
    await ref.set(doc);

    const form = await getRegistrationForm(ref.id);
    return NextResponse.json({ form });
  } catch (err) {
    console.error("Duplicate registration form failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
