import { NextResponse } from "next/server";
import { getRegistrationForm } from "@/lib/registration-forms/server";

export const dynamic = "force-dynamic";

/** Public read of an ACTIVE form definition for the dynamic register page. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ formId: string }> }
) {
  const { formId } = await params;
  try {
    const form = await getRegistrationForm(formId);
    if (!form || form.status !== "ACTIVE") {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }
    return NextResponse.json({
      form: {
        id: form.id,
        name: form.name,
        slug: form.slug,
        description: form.description,
        sections: form.sections,
        fields: form.fields.filter((f) => f.enabled),
        syncToGoogleSheet: form.syncToGoogleSheet,
      },
    });
  } catch (err) {
    console.error("Public form fetch failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
