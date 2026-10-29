import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/server-auth";
import {
  getRegistrationForm,
  listEventsUsingRegistrationForm,
} from "@/lib/registration-forms/server";

export const dynamic = "force-dynamic";

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

    const events = await listEventsUsingRegistrationForm(formId);
    return NextResponse.json({ events });
  } catch (err) {
    console.error("Registration form usage check failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
