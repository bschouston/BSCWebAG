import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth/server-auth";
import { getRegistrationForm, registrationFormsRef } from "@/lib/registration-forms/server";
import { slugifyFormName } from "@/lib/registration-forms/volleyball-seed";

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
    let slug = slugifyFormName(name) || `form-${Date.now()}`;
    const col = registrationFormsRef();
    const existing = await col.where("slug", "==", slug).limit(1).get();
    if (!existing.empty) slug = `${slug}-${Date.now().toString(36)}`;

    const ref = col.doc();
    const doc = {
      name,
      slug,
      description: source.description ?? "",
      status: "ACTIVE" as const,
      isSystem: false,
      syncToGoogleSheet: false,
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
