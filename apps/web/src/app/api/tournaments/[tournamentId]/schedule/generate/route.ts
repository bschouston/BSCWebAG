import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import { z } from "zod";
import {
  RoundRobinScheduleConfigSchema,
  isMatchReplaceableBySchedule,
  isSavedPlayoffBracket,
} from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import {
  generateOriginalRoundRobinSchedule,
  type RoundRobinInputConfig,
  type ScheduledMatch,
  type SchedulerDivision,
  type SchedulerTeam,
} from "@/lib/round-robin-scheduler";
import { deleteUpcomingMatchesBulk } from "@/lib/tournament-stats-rebuild";

export const dynamic = "force-dynamic";

const ApplyPreviewMatchSchema = z.object({
  teamAId: z.string().min(1),
  teamBId: z.string().min(1),
  divisionId: z.string().nullable().optional(),
  pairingType: z.enum(["DIVISION", "CROSS"]),
  courtNumber: z.number().int().min(1),
  slotIndex: z.number().int().min(0),
  scheduledAt: z.string().min(1),
});

type Body = {
  action?: "preview" | "apply";
  config?: unknown;
  /** Optional nonce so preview/apply can reshuffle without changing config. */
  shuffleNonce?: string;
  /**
   * When applying, optional edited preview matches (e.g. after timeslot swaps).
   * If omitted, the schedule is regenerated from config + shuffleNonce.
   */
  matches?: unknown;
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

function seedFor(
  tournamentId: string,
  config: RoundRobinInputConfig,
  teams: SchedulerTeam[],
  shuffleNonce?: string
) {
  return [
    tournamentId,
    config.scheduleDate,
    config.startTime,
    config.lunchStart,
    config.lunchEnd,
    config.numberOfCourts,
    config.timePerMatchMinutes,
    config.gamesPerTeam,
    shuffleNonce?.trim() || "default",
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

function parseApplyMatches(
  raw: unknown,
  teams: SchedulerTeam[]
): { ok: true; matches: ScheduledMatch[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "Apply matches must be a non-empty array." };
  }
  const teamIds = new Set(teams.map((t) => t.id));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const matches: ScheduledMatch[] = [];

  for (let i = 0; i < raw.length; i++) {
    const parsed = ApplyPreviewMatchSchema.safeParse(raw[i]);
    if (!parsed.success) {
      return {
        ok: false,
        error: `Invalid apply match at index ${i}: ${parsed.error.issues[0]?.message ?? "invalid"}`,
      };
    }
    const m = parsed.data;
    if (!teamIds.has(m.teamAId) || !teamIds.has(m.teamBId)) {
      return { ok: false, error: `Apply match ${i} references an unknown team.` };
    }
    if (m.teamAId === m.teamBId) {
      return { ok: false, error: `Apply match ${i} has the same team twice.` };
    }
    const scheduled = new Date(m.scheduledAt);
    if (Number.isNaN(scheduled.getTime())) {
      return { ok: false, error: `Apply match ${i} has an invalid scheduledAt.` };
    }
    const teamA = teamById.get(m.teamAId)!;
    const teamB = teamById.get(m.teamBId)!;
    matches.push({
      teamAId: m.teamAId,
      teamBId: m.teamBId,
      divisionId: m.divisionId ?? null,
      divisionLabel:
        m.pairingType === "CROSS"
          ? "Cross"
          : teamA.divisionId === teamB.divisionId
            ? teamA.divisionId
            : "Division",
      pairingType: m.pairingType,
      courtNumber: m.courtNumber,
      slotIndex: m.slotIndex,
      scheduledAt: scheduled.toISOString(),
    });
  }

  return { ok: true, matches };
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

  const playoffBracket = loaded.tournament.playoffBracket;
  const hasSavedPlayoffs = isSavedPlayoffBracket(playoffBracket);

  if (hasSavedPlayoffs) {
    return NextResponse.json(
      {
        error:
          "Round-robin schedule generation is disabled after playoffs are saved. Delete Playoffs on the Playoffs tab before regenerating the pool schedule.",
        playoffsLocked: true,
      },
      { status: 409 }
    );
  }

  const adminDbEarly = getAdminDb();
  const anyPlayoffMatch = (
    await adminDbEarly.collection("tournaments").doc(tournamentId).collection("matches").get()
  ).docs.some((d) => (d.data() as { phase?: string }).phase === "PLAYOFF");
  if (anyPlayoffMatch) {
    return NextResponse.json(
      {
        error:
          "Round-robin schedule generation is disabled while published playoff matches exist. Delete Playoffs on the Playoffs tab first.",
        playoffsLocked: true,
      },
      { status: 409 }
    );
  }

  const shuffleNonce =
    typeof body.shuffleNonce === "string" && body.shuffleNonce.trim()
      ? body.shuffleNonce.trim()
      : undefined;

  const config: RoundRobinInputConfig = {
    ...configParsed,
    seed: seedFor(tournamentId, configParsed, loaded.teams, shuffleNonce),
  };

  let scheduleMatches: ScheduledMatch[];
  let preview: ReturnType<typeof formatPreview>;

  if (action === "apply" && body.matches != null) {
    const parsedMatches = parseApplyMatches(body.matches, loaded.teams);
    if (!parsedMatches.ok) {
      return NextResponse.json({ error: parsedMatches.error }, { status: 400 });
    }
    scheduleMatches = parsedMatches.matches;
    const gamesPerTeam: Record<string, number> = Object.fromEntries(
      loaded.teams.map((t) => [t.id, 0])
    );
    for (const m of scheduleMatches) {
      gamesPerTeam[m.teamAId] = (gamesPerTeam[m.teamAId] ?? 0) + 1;
      gamesPerTeam[m.teamBId] = (gamesPerTeam[m.teamBId] ?? 0) + 1;
    }
    const times = scheduleMatches.map((m) => new Date(m.scheduledAt).getTime());
    const maxTime = times.length ? Math.max(...times) : Date.now();
    preview = formatPreview(
      {
        ok: true,
        matches: scheduleMatches,
        diagnostics: {
          totalMatches: scheduleMatches.length,
          totalSlots: new Set(scheduleMatches.map((m) => m.slotIndex)).size,
          endTimeIso: new Date(
            maxTime + configParsed.timePerMatchMinutes * 60_000
          ).toISOString(),
          avoidablePartialRounds: 0,
          avoidableWaste: 0,
          restScore: 0,
          gamesPerTeam,
        },
      },
      loaded.teams,
      loaded.divisions
    );
  } else {
    const schedule = generateOriginalRoundRobinSchedule({
      teams: loaded.teams,
      divisions: loaded.divisions,
      config,
    });

    if (!schedule.ok) {
      return NextResponse.json({ error: schedule.error }, { status: 400 });
    }

    scheduleMatches = schedule.matches;
    preview = formatPreview(schedule, loaded.teams, loaded.divisions);
  }

  if (action === "preview") {
    return NextResponse.json({
      ok: true,
      action: "preview",
      ...preview,
      shuffleNonce: shuffleNonce ?? null,
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
      completedAt?: unknown;
      lastPlayAt?: unknown;
      winnerTeamId?: string | null;
      teamAId?: string;
      teamBId?: string;
      phase?: string;
    };
    // Never replace playoff matches when regenerating the pool schedule.
    if (data.phase === "PLAYOFF") {
      continue;
    }
    if (isMatchReplaceableBySchedule(data)) {
      replaceableIds.push(doc.id);
    } else {
      blocked.push(doc.id);
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

  for (const match of scheduleMatches) {
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
      completedAt?: unknown;
      lastPlayAt?: unknown;
      winnerTeamId?: string | null;
      phase?: string;
    };
    if (data.phase === "PLAYOFF") continue;
    if (isMatchReplaceableBySchedule(data)) count += 1;
  }
  return count;
}
