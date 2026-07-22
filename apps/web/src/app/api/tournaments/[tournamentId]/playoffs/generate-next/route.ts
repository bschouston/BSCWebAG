import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import {
  expandRoundKeysToMatchIds,
  flattenPlayoffSlots,
  isRoundFullyPopulated,
  isSlotReady,
  listAllBracketMatches,
  resolvePlayoffConfig,
  resolveScheduleConfig,
  scheduleReadyPlayoffMatches,
  type PlayoffBracketDoc,
  type ScheduledPlayoffBlock,
} from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

type Body = {
  /** @deprecated Prefer sending matchIds and/or roundKeys together. */
  mode?: "match" | "round";
  matchIds?: string[];
  roundKeys?: string[];
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { tournamentId } = await params;
  const body = (await req.json().catch(() => ({}))) as Body;

  const adminDb = getAdminDb();
  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const tournamentSnap = await tournamentRef.get();
  if (!tournamentSnap.exists) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  const tournament = tournamentSnap.data() as Record<string, unknown>;
  const bracket = tournament.playoffBracket as PlayoffBracketDoc | undefined;
  if (!bracket?.structure) {
    return NextResponse.json({ error: "Save a playoff bracket before generating matches" }, { status: 400 });
  }
  const structure = bracket.structure;
  const config = resolvePlayoffConfig(tournament.playoffConfig);
  const scheduleCfg = resolveScheduleConfig(config);

  const matchIds = Array.isArray(body.matchIds) ? body.matchIds : [];
  const roundKeys = Array.isArray(body.roundKeys) ? body.roundKeys : [];

  // Backward compat: old clients that only sent mode=round/match
  if (!matchIds.length && !roundKeys.length && body.mode === "round") {
    return NextResponse.json({ error: "roundKeys required" }, { status: 400 });
  }
  if (!matchIds.length && !roundKeys.length && body.mode === "match") {
    return NextResponse.json({ error: "matchIds required" }, { status: 400 });
  }
  if (!matchIds.length && !roundKeys.length) {
    return NextResponse.json(
      { error: "Select at least one match or round (matchIds and/or roundKeys)" },
      { status: 400 }
    );
  }

  const requested = new Set<string>();

  if (roundKeys.length) {
    for (const key of roundKeys) {
      const roundMatches = expandRoundKeysToMatchIds(structure, [key]);
      if (!roundMatches.length) {
        return NextResponse.json({ error: `Unknown round ${key}` }, { status: 400 });
      }
      if (!isRoundFullyPopulated(structure, key)) {
        return NextResponse.json(
          { error: `Round ${key} is not fully populated with teams` },
          { status: 400 }
        );
      }
    }
    for (const id of expandRoundKeysToMatchIds(structure, roundKeys)) {
      requested.add(id);
    }
  }

  for (const id of matchIds) {
    requested.add(id);
  }

  const requestedIds = [...requested];

  const allMatches = listAllBracketMatches(structure);
  const byId = new Map(allMatches.map((m) => [m.id, m]));
  for (const id of requestedIds) {
    const m = byId.get(id);
    if (!m) {
      return NextResponse.json({ error: `Unknown bracket match ${id}` }, { status: 400 });
    }
    if (!isSlotReady(m)) {
      return NextResponse.json(
        { error: `Match ${id} does not have both teams assigned yet` },
        { status: 400 }
      );
    }
  }

  const matchesSnap = await tournamentRef.collection("matches").get();
  const existingPlayoff = matchesSnap.docs.filter((d) => {
    const data = d.data() as { phase?: string; bracketMatchId?: string };
    return data.phase === "PLAYOFF" && data.bracketMatchId;
  });

  const alreadyPublished = new Set(
    existingPlayoff.map((d) => String((d.data() as { bracketMatchId: string }).bracketMatchId))
  );

  const toCreate = requestedIds.filter((id) => !alreadyPublished.has(id));
  if (!toCreate.length) {
    return NextResponse.json({
      ok: true,
      created: 0,
      message: "All selected matches are already published",
      assignments: [],
    });
  }

  // Block if any selected already exists and has progress
  for (const doc of existingPlayoff) {
    const data = doc.data() as {
      bracketMatchId?: string;
      status?: string;
      playSeq?: number;
      startedAt?: unknown;
    };
    if (!toCreate.includes(String(data.bracketMatchId))) continue;
    if (
      data.status === "IN_PROGRESS" ||
      data.status === "COMPLETED" ||
      (typeof data.playSeq === "number" && data.playSeq > 0) ||
      data.startedAt
    ) {
      return NextResponse.json(
        { error: `Playoff match ${data.bracketMatchId} already has progress` },
        { status: 409 }
      );
    }
  }

  const existingBlocks: ScheduledPlayoffBlock[] = [];
  for (const doc of existingPlayoff) {
    const data = doc.data() as {
      bracketMatchId?: string;
      courtNumber?: number;
      scheduledAt?: { toDate?: () => Date } | string;
      teamAId?: string;
      teamBId?: string;
      status?: string;
    };
    if (!data.bracketMatchId || !data.courtNumber || !data.scheduledAt) continue;
    const start =
      typeof data.scheduledAt === "string"
        ? new Date(data.scheduledAt)
        : data.scheduledAt.toDate?.() ?? null;
    if (!start || Number.isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + scheduleCfg.matchDurationMinutes * 60_000);
    existingBlocks.push({
      bracketMatchId: data.bracketMatchId,
      courtNumber: data.courtNumber,
      scheduledAt: start.toISOString(),
      endAt: end.toISOString(),
      teamAId: String(data.teamAId ?? ""),
      teamBId: String(data.teamBId ?? ""),
    });
  }

  const readySlots = flattenPlayoffSlots(structure).filter((s) =>
    toCreate.includes(s.bracketMatchId)
  );

  const assignments = scheduleReadyPlayoffMatches({
    slots: readySlots,
    existingBlocks,
    ...scheduleCfg,
  });

  if (assignments.length !== readySlots.length) {
    return NextResponse.json(
      {
        error: "Could not schedule all selected matches (court/team conflicts or missing deps)",
        scheduled: assignments.length,
        requested: readySlots.length,
      },
      { status: 409 }
    );
  }

  const playoffGenerationId = randomUUID();
  const batch = adminDb.batch();

  for (const a of assignments) {
    const ref = tournamentRef.collection("matches").doc();
    batch.set(ref, {
      teamAId: a.teamAId,
      teamBId: a.teamBId,
      scheduledAt: Timestamp.fromDate(new Date(a.scheduledAt)),
      status: "UPCOMING",
      scoreA: 0,
      scoreB: 0,
      currentSet: 1,
      setScores: [{ a: 0, b: 0 }],
      playSeq: 0,
      startedAt: null,
      completedAt: null,
      winnerTeamId: null,
      lastPlayAt: null,
      phase: "PLAYOFF",
      bracketMatchId: a.bracketMatchId,
      dependsOnBracketMatchIds: a.dependsOnBracketMatchIds,
      courtNumber: a.courtNumber,
      playoffGenerationId,
      createdAt: Timestamp.now(),
    });
  }

  batch.set(
    tournamentRef,
    {
      lastPlayoffGenerateAt: Timestamp.now(),
      lastPlayoffGenerationId: playoffGenerationId,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );

  await batch.commit();

  return NextResponse.json({
    ok: true,
    created: assignments.length,
    playoffGenerationId,
    assignments,
  });
}
