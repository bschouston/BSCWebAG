import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { defaultFantasyConfig } from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireFantasyAdmin, requireFantasyUser } from "@/lib/server-auth";
import type { Firestore } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

function configRef(adminDb: Firestore, tournamentId: string) {
  return adminDb.collection("tournaments").doc(tournamentId).collection("fantasy").doc("config");
}

function parsePlayerValues(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : Number(v);
    if (!id || !Number.isFinite(n) || n < 0) continue;
    if (n === 0) continue; // omit free / zero to keep the map lean
    out[id] = n;
  }
  return out;
}

function parseMaxBudget(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const auth = await requireFantasyUser(req);
  if (auth.error) return auth.error;
  const { tournamentId } = await params;
  const snap = await configRef(getAdminDb(), tournamentId).get();
  const config = snap.exists
    ? { ...defaultFantasyConfig(), ...(snap.data() as object) }
    : defaultFantasyConfig();
  return NextResponse.json({ config });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const auth = await requireFantasyAdmin(req);
  if (auth.error) return auth.error;
  const { tournamentId } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const teamSize = Math.min(50, Math.max(1, Number(body.teamSize ?? 7) || 7));
  const eligiblePlayerIds = Array.isArray(body.eligiblePlayerIds)
    ? body.eligiblePlayerIds.map(String)
    : [];
  const eligibleTeamIds = Array.isArray(body.eligibleTeamIds)
    ? body.eligibleTeamIds.map(String)
    : [];
  const teamsLockedGlobal = body.teamsLockedGlobal === true;
  const maxBudget = parseMaxBudget(body.maxBudget);
  const playerValues = parsePlayerValues(body.playerValues);

  const config = {
    teamSize,
    eligiblePlayerIds,
    eligibleTeamIds,
    teamsLockedGlobal,
    maxBudget,
    playerValues,
    updatedAt: Timestamp.now().toDate().toISOString(),
    updatedBy: auth.user.uid,
  };

  await configRef(getAdminDb(), tournamentId).set(config);
  return NextResponse.json({ config });
}
