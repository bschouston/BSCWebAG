import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/server-auth";
import {
  getFieldTypeCatalog,
  listFormsUsingFieldType,
} from "@/lib/registration-forms/field-types-server";

export const dynamic = "force-dynamic";

export async function GET(
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
    return NextResponse.json({ forms });
  } catch (err) {
    console.error("Field type usage check failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
