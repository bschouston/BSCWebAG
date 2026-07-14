import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/server-auth";
import {
  listRegistrationFormsEnsuringSeed,
  registrationFormsRef,
} from "@/lib/registration-forms/server";
import { slugifyFormName } from "@/lib/registration-forms/volleyball-seed";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  try {
    const forms = await listRegistrationFormsEnsuringSeed();
    return NextResponse.json({ forms });
  } catch (err) {
    console.error("List registration forms failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

const CreateSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const { error, user } = await requireAdmin(request);
  if (error) return error;

  try {
    const parsed = CreateSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const name = parsed.data.name.trim();
    let slug = slugifyFormName(name) || `form-${Date.now()}`;
    const col = registrationFormsRef();
    const existing = await col.where("slug", "==", slug).limit(1).get();
    if (!existing.empty) slug = `${slug}-${Date.now().toString(36)}`;

    const ref = col.doc();
    const doc = {
      name,
      slug,
      description: parsed.data.description ?? "",
      status: "ACTIVE" as const,
      isSystem: false,
      syncToGoogleSheet: false,
      sections: [{ id: "main", title: "Main", order: 0 }],
      fields: [],
      duplicatedFrom: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      updatedBy: user.uid,
    };
    await ref.set(doc);
    return NextResponse.json({
      form: {
        id: ref.id,
        ...doc,
        createdAt: doc.createdAt.toDate().toISOString(),
        updatedAt: doc.updatedAt.toDate().toISOString(),
      },
    });
  } catch (err) {
    console.error("Create registration form failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
