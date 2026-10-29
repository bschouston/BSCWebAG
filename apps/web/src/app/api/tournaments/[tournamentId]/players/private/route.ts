import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

type ProfileLine = { id: string; label: string; value: string };

function profileLines(value: unknown): ProfileLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((line) => {
    if (!line || typeof line !== "object") return [];
    const row = line as { id?: unknown; label?: unknown; value?: unknown };
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const text = typeof row.value === "string" ? row.value.trim() : "";
    if (!label || !text) return [];
    return [{ id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : label, label, value: text }];
  });
}

/** Admin-only private profile lines. playersPrivate is not readable from the client. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { tournamentId } = await params;
  const snap = await getAdminDb()
    .collection("tournaments")
    .doc(tournamentId)
    .collection("playersPrivate")
    .get();

  const players: Record<string, ProfileLine[]> = {};
  for (const doc of snap.docs) {
    const lines = profileLines((doc.data() as { profile?: unknown }).profile);
    if (lines.length) players[doc.id] = lines;
  }

  return NextResponse.json({ players });
}
