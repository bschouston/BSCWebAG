import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import {
  computeFantasyRosterCost,
  defaultFantasyConfig,
  fantasyTeamNameLower,
  isFantasyTeamEffectivelyLocked,
  normalizeFantasyTeamName,
} from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireFantasyUser } from "@/lib/server-auth";
import type { Firestore } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

function fantasyConfigRef(adminDb: Firestore, tournamentId: string) {
  return adminDb.collection("tournaments").doc(tournamentId).collection("fantasy").doc("config");
}

function fantasyTeamRef(adminDb: Firestore, tournamentId: string, uid: string) {
  return adminDb.collection("tournaments").doc(tournamentId).collection("fantasyTeams").doc(uid);
}

async function loadConfig(adminDb: Firestore, tournamentId: string) {
  const snap = await fantasyConfigRef(adminDb, tournamentId).get();
  return snap.exists
    ? { ...defaultFantasyConfig(), ...(snap.data() as object) }
    : defaultFantasyConfig();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const auth = await requireFantasyUser(req);
  if (auth.error) return auth.error;
  const { tournamentId } = await params;
  const adminDb = getAdminDb();

  const [teamSnap, config] = await Promise.all([
    fantasyTeamRef(adminDb, tournamentId, auth.user.uid).get(),
    loadConfig(adminDb, tournamentId),
  ]);

  const team = teamSnap.exists ? (teamSnap.data() as Record<string, unknown>) : null;
  // Never return ownerEmail to clients for display — strip it.
  if (team) {
    const { ownerEmail: _email, ...safe } = team;
    return NextResponse.json({
      team: { id: teamSnap.id, ...safe },
      config,
      effectivelyLocked: isFantasyTeamEffectivelyLocked(
        { locked: team.locked === true },
        config
      ),
      canEditAsAdmin: auth.user.isFantasyAdmin,
    });
  }

  return NextResponse.json({
    team: null,
    config,
    effectivelyLocked: config.teamsLockedGlobal === true,
    canEditAsAdmin: auth.user.isFantasyAdmin,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const auth = await requireFantasyUser(req);
  if (auth.error) return auth.error;
  const { tournamentId } = await params;
  const adminDb = getAdminDb();
  const body = (await req.json().catch(() => ({}))) as {
    teamName?: string;
    photoUrl?: string | null;
    playerIds?: string[];
  };

  const config = await loadConfig(adminDb, tournamentId);
  const teamRef = fantasyTeamRef(adminDb, tournamentId, auth.user.uid);
  const existingSnap = await teamRef.get();
  const existing = existingSnap.exists ? (existingSnap.data() as Record<string, unknown>) : null;

  const effectivelyLocked = isFantasyTeamEffectivelyLocked(
    { locked: existing?.locked === true },
    config
  );
  if (effectivelyLocked && !auth.user.isFantasyAdmin) {
    return NextResponse.json(
      { error: "This fantasy team is locked. Ask a Fantasy admin to unlock it." },
      { status: 403 }
    );
  }

  const teamName = normalizeFantasyTeamName(String(body.teamName ?? existing?.teamName ?? ""));
  if (!teamName) {
    return NextResponse.json({ error: "Team name is required" }, { status: 400 });
  }
  const nameLower = fantasyTeamNameLower(teamName);

  const dup = await adminDb
    .collection("tournaments")
    .doc(tournamentId)
    .collection("fantasyTeams")
    .where("teamNameLower", "==", nameLower)
    .limit(5)
    .get();
  const takenByOther = dup.docs.some((d) => d.id !== auth.user.uid);
  if (takenByOther) {
    return NextResponse.json(
      { error: "That team name is already taken in this tournament" },
      { status: 400 }
    );
  }

  const teamSize = Number(config.teamSize ?? 7);
  const playerIds = Array.isArray(body.playerIds)
    ? [...new Set(body.playerIds.map(String))]
    : ((existing?.playerIds as string[]) ?? []);

  if (playerIds.length > teamSize) {
    return NextResponse.json(
      { error: `Roster can have at most ${teamSize} players` },
      { status: 400 }
    );
  }

  const maxBudget =
    typeof config.maxBudget === "number" &&
    Number.isFinite(config.maxBudget) &&
    config.maxBudget > 0
      ? config.maxBudget
      : null;
  if (maxBudget != null) {
    const playerValues =
      config.playerValues && typeof config.playerValues === "object"
        ? (config.playerValues as Record<string, number>)
        : {};
    const cost = computeFantasyRosterCost(playerIds, playerValues);
    if (cost > maxBudget) {
      return NextResponse.json(
        {
          error: `Roster Fantasy Value (${cost}) exceeds the team budget (${maxBudget})`,
        },
        { status: 400 }
      );
    }
  }

  const eligiblePlayers = (config.eligiblePlayerIds as string[]) ?? [];
  const eligibleTeams = (config.eligibleTeamIds as string[]) ?? [];
  if (eligiblePlayers.length > 0) {
    const invalid = playerIds.filter((id) => !eligiblePlayers.includes(id));
    if (invalid.length) {
      return NextResponse.json(
        { error: "One or more players are not in the fantasy pool" },
        { status: 400 }
      );
    }
  } else if (eligibleTeams.length > 0) {
    const playersSnap = await adminDb
      .collection("tournaments")
      .doc(tournamentId)
      .collection("players")
      .get();
    const teamByPlayer = new Map(
      playersSnap.docs.map((d) => [
        d.id,
        String((d.data() as { teamId?: string }).teamId ?? ""),
      ])
    );
    const invalid = playerIds.filter((id) => {
      const tid = teamByPlayer.get(id);
      return !tid || !eligibleTeams.includes(tid);
    });
    if (invalid.length) {
      return NextResponse.json(
        { error: "One or more players are outside the eligible teams pool" },
        { status: 400 }
      );
    }
  }

  const now = Timestamp.now().toDate().toISOString();
  const photoUrl =
    body.photoUrl !== undefined
      ? body.photoUrl
      : ((existing?.photoUrl as string | null | undefined) ?? null);

  await teamRef.set(
    {
      teamName,
      teamNameLower: nameLower,
      photoUrl,
      ownerDisplayName: auth.user.displayName,
      ownerEmail: auth.user.email,
      playerIds,
      locked: existing?.locked === true,
      updatedAt: now,
      ...(existingSnap.exists ? {} : { createdAt: now }),
    },
    { merge: true }
  );

  const saved = (await teamRef.get()).data() as Record<string, unknown>;
  const { ownerEmail: _e, ...safe } = saved;
  return NextResponse.json({
    team: { id: auth.user.uid, ...safe },
    effectivelyLocked: isFantasyTeamEffectivelyLocked(
      { locked: saved.locked === true },
      config
    ),
  });
}
