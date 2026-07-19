import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import { RoundRobinScheduleConfigSchema } from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import {
  generateOriginalRoundRobinSchedule,
  type RoundRobinInputConfig,
  type SchedulerDivision,
  type SchedulerTeam,
} from "@/lib/round-robin-scheduler";
import { deleteUpcomingMatchesBulk } from "@/lib/tournament-stats-rebuild";

export const dynamic = "force-dynamic";

type Body = {
  action?: "preview" | "apply";
  config?: unknown;
};

function parseConfig(raw: unknown): RoundRobinInputConfig | { error: string } {
  const parsed = RoundRobinScheduleConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid schedule config" };
  }
  return parsed.data;
}

async function loadTeamsAndDivisions(tournamentId: string): Promise<
  | { ok: true; teams: SchedulerTeam[]; divisions: SchedulerDivision[]; tournament: Record<string, unknown> }
  | { ok: false; error: string; status: number }
> {
  const adminDb = getAdminDb();
  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const tournamentSnap = await tournamentRef.get();
  if (!tournamentSnap.exists) {
    return { ok: false, error: "Tournament not found", status: 404 };
  }

  const [teamsSnap, divisionsSnap] = await Promise.all([
    tournamentRef.collection("teams").get(),
    tournamentRef.collection("divisions").get(),
  ]);

  const divisions: SchedulerDivision[] = divisionsSnap.docs.map((d) => {
    const data = d.data() as { name?: string };
    return { id: d.id, name: String(data.name ?? d.id) };
  });
  const divisionIds = new Set(divisions.map((d) => d.id));

  const teams: SchedulerTeam[] = [];
  for (const doc of teamsSnap.docs) {
    const data = doc.data() as { name?: string; divisionId?: string | null };
    const divisionId = data.divisionId ? String(data.divisionId) : "";
    if (!divisionId || !divisionIds.has(divisionId)) {
      continue; // filtered later with a clearer error if any remain unassigned
    }
    teams.push({
      id: doc.id,
      name: String(data.name ?? doc.id),
      divisionId,
    });
  }

  // Surface teams that exist but lack a valid division.
  const unassigned = teamsSnap.docs
    .filter((d) => {
      const divisionId = (d.data() as { divisionId?: string | null }).divisionId;
      return !divisionId || !divisionIds.has(String(divisionId));
    })
    .map((d) => String((d.data() as { name?: string }).name ?? d.id));

  if (unassigned.length) {
    return {
      ok: false,
      error: `Every team must belong to a division before generating a schedule. Unassigned: ${unassigned.join(", ")}`,
      status: 400,
    };
  }

  if (!teams.length) {
    return { ok: false, error: "No teams found for this tournament.", status: 400 };
  }

  if (!divisions.length) {
    return {
      ok: false,
      error: "Create divisions and assign teams before generating a schedule.",
      status: 400,
    };
  }

  return {
    ok: true,
    teams,
    divisions,
    tournament: tournamentSnap.data() as Record<string, unknown>,
  };
}

function seedFor(tournamentId: string, config: RoundRobinInputConfig, teams: SchedulerTeam[]) {
  return [
    tournamentId,
    config.scheduleDate,
    config.startTime,
    config.lunchStart,
    config.lunchEnd,
    config.numberOfCourts,
    config.timePerMatchMinutes,
    config.gamesPerTeam,
    ...teams.map((t) => `${t.id}:${t.divisionId}`).sort(),
  ].join("|");
}

function formatPreview(
  result: Exclude<ReturnType<typeof generateOriginalRoundRobinSchedule>, { ok: false }>,
  teams: SchedulerTeam[],
  divisions: SchedulerDivision[]
) {
  const teamName = Object.fromEntries(teams.map((t) => [t.id, t.name]));
  const divisionName = Object.fromEntries(divisions.map((d) => [d.id, d.name]));

  return {
    matches: result.matches.map((m) => ({
      ...m,
      teamAName: teamName[m.teamAId] ?? m.teamAId,
      teamBName: teamName[m.teamBId] ?? m.teamBId,
      divisionName:
        m.pairingType === "CROSS"
          ? "Cross"
          : m.divisionId
            ? divisionName[m.divisionId] ?? m.divisionLabel
            : m.divisionLabel,
    })),
    diagnostics: {
      ...result.diagnostics,
      gamesPerTeam: Object.fromEntries(
        Object.entries(result.diagnostics.gamesPerTeam).map(([id, count]) => [
          teamName[id] ?? id,
          count,
        ])
      ),
    },
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { tournamentId } = await params;
  const body = (await req.json().catch(() => ({}))) as Body;
  const action = body.action === "apply" ? "apply" : "preview";
  const configParsed = parseConfig(body.config);
  if ("error" in configParsed) {
    return NextResponse.json({ error: configParsed.error }, { status: 400 });
  }

  const loaded = await loadTeamsAndDivisions(tournamentId);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const config: RoundRobinInputConfig = {
    ...configParsed,
    seed: seedFor(tournamentId, configParsed, loaded.teams),
  };

  const schedule = generateOriginalRoundRobinSchedule({
    teams: loaded.teams,
    divisions: loaded.divisions,
    config,
  });

  if (!schedule.ok) {
    return NextResponse.json({ error: schedule.error }, { status: 400 });
  }

  const preview = formatPreview(schedule, loaded.teams, loaded.divisions);

  if (action === "preview") {
    return NextResponse.json({
      ok: true,
      action: "preview",
      ...preview,
      replaceableMatchCount: await countReplaceableMatches(tournamentId),
    });
  }

  // APPLY
  const adminDb = getAdminDb();
  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const matchesSnap = await tournamentRef.collection("matches").get();

  const blocked: string[] = [];
  const replaceableIds: string[] = [];

  for (const doc of matchesSnap.docs) {
    const data = doc.data() as {
      status?: string;
      playSeq?: number;
      startedAt?: unknown;
      teamAId?: string;
      teamBId?: string;
    };
    const hasProgress =
      data.status === "IN_PROGRESS" ||
      data.status === "COMPLETED" ||
      (data.playSeq ?? 0) > 0 ||
      data.startedAt != null;

    if (hasProgress) {
      blocked.push(doc.id);
    } else {
      replaceableIds.push(doc.id);
    }
  }

  if (blocked.length) {
    return NextResponse.json(
      {
        error:
          "Cannot replace the schedule because one or more matches have already started or have recorded plays. Delete those matches manually first, or wait until the tournament is reset.",
        blockedMatchCount: blocked.length,
      },
      { status: 409 }
    );
  }

  // Unplayed upcoming matches contribute no stats — skip expensive rebuild.
  await deleteUpcomingMatchesBulk(adminDb, tournamentId, replaceableIds, {
    rebuild: false,
  });

  const generationId = randomUUID();
  const now = Timestamp.now();
  let batch = adminDb.batch();
  let ops = 0;
  let created = 0;

  for (const match of schedule.matches) {
    const ref = tournamentRef.collection("matches").doc();
    batch.set(ref, {
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      scheduledAt: Timestamp.fromDate(new Date(match.scheduledAt)),
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
      divisionId: match.divisionId,
      pairingType: match.pairingType,
      courtNumber: match.courtNumber,
      slotIndex: match.slotIndex,
      scheduleGenerationId: generationId,
      createdAt: now,
    });
    created += 1;
    ops += 1;
    if (ops >= 450) {
      await batch.commit();
      batch = adminDb.batch();
      ops = 0;
    }
  }

  batch.set(
    tournamentRef,
    {
      roundRobinScheduleConfig: {
        numberOfCourts: configParsed.numberOfCourts,
        timePerMatchMinutes: configParsed.timePerMatchMinutes,
        scheduleDate: configParsed.scheduleDate,
        startTime: configParsed.startTime,
        lunchStart: configParsed.lunchStart,
        lunchEnd: configParsed.lunchEnd,
        gamesPerTeam: configParsed.gamesPerTeam,
      },
      lastScheduleGenerationId: generationId,
      lastScheduleGeneratedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );
  ops += 1;

  if (ops > 0) await batch.commit();

  return NextResponse.json({
    ok: true,
    action: "apply",
    generationId,
    matchesCreated: created,
    matchesReplaced: replaceableIds.length,
    ...preview,
  });
}

async function countReplaceableMatches(tournamentId: string): Promise<number> {
  const snap = await getAdminDb()
    .collection("tournaments")
    .doc(tournamentId)
    .collection("matches")
    .get();
  let count = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as {
      status?: string;
      playSeq?: number;
      startedAt?: unknown;
    };
    const hasProgress =
      data.status === "IN_PROGRESS" ||
      data.status === "COMPLETED" ||
      (data.playSeq ?? 0) > 0 ||
      data.startedAt != null;
    if (!hasProgress) count += 1;
  }
  return count;
}
