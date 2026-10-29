import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/server-auth";
import { isFieldBehavior, slugifyFieldTypeId } from "@/lib/registration-forms/field-types";
import {
  fieldTypeCatalogRef,
  getFieldTypeCatalog,
} from "@/lib/registration-forms/field-types-server";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  id: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  base: z.string().trim().min(1),
  sublabel: z.string().max(2000).optional(),
  example: z.string().max(200).optional(),
});

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  try {
    const catalog = await getFieldTypeCatalog();
    return NextResponse.json(catalog);
  } catch (err) {
    console.error("List field types failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  try {
    const parsed = CreateSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Name and behavior are required." }, { status: 400 });
    }
    const id = slugifyFieldTypeId(parsed.data.id);
    if (!id || !/^[a-z][a-z0-9_]*$/.test(id)) {
      return NextResponse.json(
        { error: "Type id must start with a letter and use only letters, numbers, and underscores." },
        { status: 400 }
      );
    }
    if (!isFieldBehavior(parsed.data.base)) {
      return NextResponse.json({ error: "Choose a field behavior." }, { status: 400 });
    }

    const catalog = await getFieldTypeCatalog();
    if (catalog.types.some((type) => type.id === id)) {
      return NextResponse.json({ error: "A field type with that id already exists." }, { status: 409 });
    }

    const next = [
      ...catalog.types,
      {
        id,
        name: parsed.data.name.trim(),
        base: parsed.data.base,
        sublabel: parsed.data.sublabel?.trim() ?? "",
        example: parsed.data.example?.trim() ?? "",
      },
    ];
    await fieldTypeCatalogRef().set({ types: next });
    return NextResponse.json({ types: next });
  } catch (err) {
    console.error("Create field type failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
