import { NextRequest, NextResponse } from "next/server";
import {
  computeLeaderboardValue,
  defaultFantasyConfig,
  playerFantasyValue,
  sportFromStatTrackerId,
  trackerConfigLeaderboardColumns,
  type TrackerConfig,
} from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireFantasyAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const auth = await requireFantasyAdmin(req);
  if (auth.error) return auth.error;
  const { tournamentId } = await params;
  const adminDb = getAdminDb();

  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const [tournamentSnap, teamsSnap, playersSnap, statsSnap, configSnap] =
    await Promise.all([
      tournamentRef.get(),
      tournamentRef.collection("fantasyTeams").get(),
      tournamentRef.collection("players").get(),
      tournamentRef.collection("playerStats").get(),
      tournamentRef.collection("fantasy").doc("config").get(),
    ]);

  if (!tournamentSnap.exists) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  const tournament = tournamentSnap.data() as { statTrackerId?: string };
  const statTrackerId = String(tournament.statTrackerId ?? "volleyball.v1");
  const sport = sportFromStatTrackerId(statTrackerId) || "volleyball";
  const trackerSnap = await adminDb.collection("trackerConfigs").doc(sport).get();
  const trackerConfig = trackerSnap.exists
    ? (trackerSnap.data() as TrackerConfig)
    : null;

  const fantasyConfig = configSnap.exists
    ? { ...defaultFantasyConfig(), ...(configSnap.data() as object) }
    : defaultFantasyConfig();
  const playerValues =
    fantasyConfig.playerValues && typeof fantasyConfig.playerValues === "object"
      ? (fantasyConfig.playerValues as Record<string, number>)
      : {};

  const playerName = new Map(
    playersSnap.docs.map((d) => [
      d.id,
      String((d.data() as { displayName?: string }).displayName ?? "Player"),
    ])
  );

  const statsById: Record<string, Record<string, unknown>> = {};
  for (const d of statsSnap.docs) {
    statsById[d.id] = d.data() as Record<string, unknown>;
  }

  const playerPoints = new Map<string, number>();
  for (const d of playersSnap.docs) {
    const stats = statsById[d.id] ?? {};
    const points = trackerConfig ? computeLeaderboardValue(stats, trackerConfig) : 0;
    playerPoints.set(d.id, points);
  }

  const playerCounts = new Map<string, number>();
  let lockedCount = 0;

  type FantasyTeamRow = {
    id: string;
    teamName: string;
    playerIds: string[];
  };
  const fantasyTeams: FantasyTeamRow[] = [];

  for (const doc of teamsSnap.docs) {
    const data = doc.data() as {
      playerIds?: string[];
      locked?: boolean;
      teamName?: string;
    };
    if (data.locked) lockedCount += 1;
    const playerIds = (data.playerIds ?? []).map(String);
    fantasyTeams.push({
      id: doc.id,
      teamName: String(data.teamName ?? "Untitled team"),
      playerIds,
    });
    for (const pid of playerIds) {
      playerCounts.set(pid, (playerCounts.get(pid) ?? 0) + 1);
    }
  }

  const mostUsedPlayers = [...playerCounts.entries()]
    .map(([playerId, teamCount]) => ({
      playerId,
      displayName: playerName.get(playerId) ?? "Player",
      teamCount,
      fantasyValue: playerFantasyValue(playerId, playerValues),
      fantasyPoints: playerPoints.get(playerId) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.teamCount - a.teamCount ||
        b.fantasyPoints - a.fantasyPoints ||
        a.displayName.localeCompare(b.displayName)
    )
    .slice(0, 25);

  // Most valuable = highest live Fantasy Pts; include their Fantasy Value (price).
  let mostValuablePlayer: {
    playerId: string;
    displayName: string;
    fantasyPoints: number;
    fantasyValue: number;
    teamCount: number;
  } | null = null;
  for (const [playerId, fantasyPoints] of playerPoints.entries()) {
    if (
      !mostValuablePlayer ||
      fantasyPoints > mostValuablePlayer.fantasyPoints ||
      (fantasyPoints === mostValuablePlayer.fantasyPoints &&
        (playerName.get(playerId) ?? "").localeCompare(
          mostValuablePlayer.displayName
        ) < 0)
    ) {
      mostValuablePlayer = {
        playerId,
        displayName: playerName.get(playerId) ?? "Player",
        fantasyPoints,
        fantasyValue: playerFantasyValue(playerId, playerValues),
        teamCount: playerCounts.get(playerId) ?? 0,
      };
    }
  }

  // Average Fantasy Pts grouped by Fantasy Value price.
  const byValue = new Map<number, { totalPoints: number; playerCount: number }>();
  for (const d of playersSnap.docs) {
    const fv = playerFantasyValue(d.id, playerValues);
    if (fv <= 0) continue;
    const bucket = byValue.get(fv) ?? { totalPoints: 0, playerCount: 0 };
    bucket.totalPoints += playerPoints.get(d.id) ?? 0;
    bucket.playerCount += 1;
    byValue.set(fv, bucket);
  }
  const avgPointsByFantasyValue = [...byValue.entries()]
    .map(([fantasyValue, { totalPoints, playerCount }]) => ({
      fantasyValue,
      playerCount,
      averageFantasyPoints: playerCount > 0 ? totalPoints / playerCount : 0,
    }))
    .sort(
      (a, b) =>
        b.fantasyValue - a.fantasyValue ||
        b.averageFantasyPoints - a.averageFantasyPoints
    );

  // Per leaderboard stat: fantasy team with the highest roster total.
  const columns = trackerConfig
    ? trackerConfigLeaderboardColumns(trackerConfig)
    : [];
  const statLeaders = columns.map((col) => {
    let best: {
      teamId: string;
      teamName: string;
      total: number;
    } | null = null;
    for (const team of fantasyTeams) {
      let total = 0;
      for (const pid of team.playerIds) {
        const raw = statsById[pid]?.[col.field];
        const n = typeof raw === "number" ? raw : Number(raw ?? 0);
        total += Number.isFinite(n) ? n : 0;
      }
      if (
        !best ||
        total > best.total ||
        (total === best.total && team.teamName.localeCompare(best.teamName) < 0)
      ) {
        best = { teamId: team.id, teamName: team.teamName, total };
      }
    }
    return {
      field: col.field,
      label: col.label,
      color: col.color,
      teamId: best?.teamId ?? null,
      teamName: best?.teamName ?? null,
      total: best?.total ?? 0,
    };
  });

  return NextResponse.json({
    fantasyTeamCount: teamsSnap.size,
    lockedCount,
    mostUsedPlayers,
    mostValuablePlayer,
    avgPointsByFantasyValue,
    statLeaders,
  });
}
