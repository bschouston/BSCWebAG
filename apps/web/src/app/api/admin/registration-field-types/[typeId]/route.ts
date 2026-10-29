import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/server-auth";
import { isFieldBehavior } from "@/lib/registration-forms/field-types";
import {
  fieldTypeCatalogRef,
  getFieldTypeCatalog,
  listFormsUsingFieldType,
} from "@/lib/registration-forms/field-types-server";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(80),
  base: z.string().trim().min(1),
  sublabel: z.string().max(2000).optional(),
  example: z.string().max(200).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ typeId: string }> }
) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const { typeId } = await params;
  try {
    const parsed = PatchSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Name and behavior are required." }, { status: 400 });
    }
    if (!isFieldBehavior(parsed.data.base)) {
      return NextResponse.json({ error: "Choose a field behavior." }, { status: 400 });
    }

    const catalog = await getFieldTypeCatalog();
    const current = catalog.types.find((type) => type.id === typeId);
    if (!current) return NextResponse.json({ error: "Field type not found." }, { status: 404 });

    if (parsed.data.base !== current.base) {
      const forms = await listFormsUsingFieldType(typeId);
      if (forms.length) {
        return NextResponse.json(
          {
            error: "This type is used by a form, so its behavior cannot change.",
            forms,
          },
          { status: 409 }
        );
      }
    }

    const next = catalog.types.map((type) =>
      type.id === typeId
        ? {
            ...type,
            name: parsed.data.name.trim(),
            base: parsed.data.base,
            sublabel: parsed.data.sublabel?.trim() ?? "",
            example: parsed.data.example?.trim() ?? "",
          }
        : type
    );
    await fieldTypeCatalogRef().set({ types: next });
    return NextResponse.json({ types: next });
  } catch (err) {
    console.error("Update field type failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ typeId: string }> }
) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const { typeId } = await params;
  try {
    const catalog = await getFieldTypeCatalog();
    if (!catalog.types.some((type) => type.id === typeId)) {
      return NextResponse.json({ error: "Field type not found." }, { status: 404 });
    }

    const forms = await listFormsUsingFieldType(typeId);
    if (forms.length) {
      return NextResponse.json(
        {
          error: "This type is used by a registration form. Remove it from those forms before deleting.",
          forms,
        },
        { status: 409 }
      );
    }

    const next = catalog.types.filter((type) => type.id !== typeId);
    await fieldTypeCatalogRef().set({ types: next });
    return NextResponse.json({ types: next });
  } catch (err) {
    console.error("Delete field type failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
