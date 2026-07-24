import { NextRequest, NextResponse } from "next/server";
import type { DocumentReference, DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireFantasyUser } from "@/lib/server-auth";
import {
  hasCachedPublicProfile,
  parseCachedSkills,
  publicProfileFromRegistration,
} from "@/lib/registration-profile";

export const dynamic = "force-dynamic";

async function getAllChunked(
  adminDb: Firestore,
  refs: DocumentReference[]
): Promise<DocumentSnapshot[]> {
  const out: DocumentSnapshot[] = [];
  for (let i = 0; i < refs.length; i += 100) {
    const chunk = refs.slice(i, i + 100);
    if (!chunk.length) continue;
    out.push(...(await adminDb.getAll(...chunk)));
  }
  return out;
}

/**
 * Warm player docs with public registration profile fields (photo, height, DOB, skills)
 * so the fantasy roster picker can show them via live Firestore snapshots.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const auth = await requireFantasyUser(req);
  if (auth.error) return auth.error;

  const { tournamentId } = await params;
  const adminDb = getAdminDb();
  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const tournamentSnap = await tournamentRef.get();
  if (!tournamentSnap.exists) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  const tournament = tournamentSnap.data() as Record<string, unknown>;
  const eventId =
    typeof tournament.eventId === "string" && tournament.eventId.trim()
      ? tournament.eventId.trim()
      : null;
  if (!eventId) {
    return NextResponse.json({ ok: true, enriched: 0, reason: "no_event" });
  }

  const playersSnap = await tournamentRef.collection("players").get();
  const needs = playersSnap.docs.filter(
    (d) => !hasCachedPublicProfile(d.data() as Record<string, unknown>)
  );
  if (!needs.length) {
    return NextResponse.json({ ok: true, enriched: 0 });
  }

  const [regsSnap, privateSnaps] = await Promise.all([
    adminDb.collection("events").doc(eventId).collection("event_registrations").get(),
    getAllChunked(
      adminDb,
      needs.map((d) => tournamentRef.collection("playersPrivate").doc(d.id))
    ),
  ]);

  const regsById = new Map(
    regsSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>])
  );
  const privateByPlayerId = new Map<string, string | undefined>();
  for (const snap of privateSnaps) {
    if (!snap.exists) continue;
    const source = (snap.data() as { source?: { registrationId?: string } } | undefined)?.source;
    privateByPlayerId.set(snap.id, source?.registrationId);
  }

  let batch = adminDb.batch();
  let ops = 0;
  let enriched = 0;
  const commits: Promise<unknown>[] = [];

  for (const doc of needs) {
    const data = doc.data() as Record<string, unknown>;
    const registrationId = privateByPlayerId.get(doc.id) ?? doc.id;
    const reg = regsById.get(String(registrationId));
    if (!reg) continue;

    const profile = publicProfileFromRegistration(reg);
    let photoUrl =
      typeof data.photoUrl === "string" && data.photoUrl.trim()
        ? data.photoUrl.trim()
        : profile.photoUrl;
    let height =
      typeof data.height === "string" && data.height.trim()
        ? data.height.trim()
        : profile.height;
    let dateOfBirth =
      typeof data.dateOfBirth === "string" && data.dateOfBirth.trim()
        ? data.dateOfBirth.trim()
        : profile.dateOfBirth;
    let skills = parseCachedSkills(data.skills);
    if (!skills.length) skills = profile.skills;

    const patch: Record<string, unknown> = {
      ...(photoUrl ? { photoUrl } : {}),
      ...(height ? { height } : {}),
      ...(dateOfBirth ? { dateOfBirth } : {}),
      ...(skills.length ? { skills } : {}),
    };
    if (!Object.keys(patch).length) continue;

    batch.set(doc.ref, patch, { merge: true });
    ops += 1;
    enriched += 1;
    if (ops >= 400) {
      commits.push(batch.commit());
      batch = adminDb.batch();
      ops = 0;
    }
  }

  if (ops > 0) commits.push(batch.commit());
  await Promise.all(commits);

  return NextResponse.json({ ok: true, enriched });
}
