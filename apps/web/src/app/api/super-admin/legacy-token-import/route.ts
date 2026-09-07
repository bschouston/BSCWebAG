import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import {
  getLegacyMigrationConfig,
  goLiveLegacyMigration,
  listLegacyEntitlementsWithMatch,
  setLegacyMigrationRetired,
  stageLegacyTokenCsv,
} from "@/lib/legacy-token-migration";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;

  try {
    const data = await listLegacyEntitlementsWithMatch();
    return NextResponse.json(data);
  } catch (err) {
    console.error("GET legacy-token-import", err);
    return NextResponse.json({ error: "Failed to load migration data" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error, user } = await requireSuperAdmin(request);
  if (error || !user) return error;

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
      }
      const name = file.name || "upload.csv";
      if (!name.toLowerCase().endsWith(".csv")) {
        return NextResponse.json({ error: "File must be a .csv" }, { status: 400 });
      }
      const csvText = await file.text();
      const result = await stageLegacyTokenCsv({
        adminUid: user.uid,
        filename: name,
        csvText,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action;

    if (action === "go_live") {
      const config = await goLiveLegacyMigration(user.uid);
      return NextResponse.json({ ok: true, config });
    }
    if (action === "retire") {
      const config = await setLegacyMigrationRetired(user.uid, true);
      return NextResponse.json({ ok: true, config });
    }
    if (action === "unretire") {
      const config = await setLegacyMigrationRetired(user.uid, false);
      return NextResponse.json({ ok: true, config });
    }
    if (action === "status") {
      const config = await getLegacyMigrationConfig();
      return NextResponse.json({ config });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    console.error("POST legacy-token-import", err);
    const status =
      /locked|Go live|retired|header|CSV|duplicate|ITS|Tokens|empty|Upload/i.test(message)
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
