import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "../../../../../../../lib/firebase/admin";
import { requireTracker } from "../../../../../../../lib/server-auth";

export const dynamic = "force-dynamic";

type Action = "start" | "end_set" | "complete";

/**
 * Match lifecycle: start (UPCOMING -> IN_PROGRESS), end_set (finalize the
 * current set, open the next), complete (IN_PROGRESS -> COMPLETED + finalize
 * standings). Allowed for admins or a tracker holding an active lock on
 * either team of the match.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; matchId: string }> }
) {
  const { user, error } = await requireTracker(req);
  if (error) return error;

  const { tournamentId, matchId } = await params;
  const adminDb = getAdminDb();

  const body = (await req.json().catch(() => ({}))) as any;
  const action = String(body?.action ?? "") as Action;
  if (!["start", "end_set", "complete"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const matchRef = tournamentRef.collection("matches").doc(matchId);
  const now = Timestamp.now();
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  try {
    const result = await adminDb.runTransaction(async (t) => {
      const [matchSnap, lockASnap, lockBSnap] = await Promise.all([
        t.get(matchRef),
        t.get(tournamentRef.collection("locks").doc(`${matchId}_A`)),
        t.get(tournamentRef.collection("locks").doc(`${matchId}_B`)),
      ]);

      if (!matchSnap.exists) return { status: 404 as const, error: "Match not found" };
      const match = matchSnap.data() as any;

      if (!isAdmin) {
        const holdsLock = [lockASnap, lockBSnap].some((snap) => {
          if (!snap.exists) return false;
          const lock = snap.data() as any;
          const expiresMs = (lock?.expiresAt as Timestamp | undefined)?.toMillis?.() ?? 0;
          return lock?.ownerUid === user.uid && !lock?.releasedAt && expiresMs > now.toMillis();
        });
        if (!holdsLock) {
          return { status: 403 as const, error: "You must hold a tracker lock on this match" };
        }
      }

      if (action === "start") {
        if (match.status === "COMPLETED") {
          return { status: 409 as const, error: "Match is already completed" };
        }
        if (match.status === "IN_PROGRESS") {
          return { status: 200 as const, match: { status: "IN_PROGRESS" } };
        }
        t.update(matchRef, {
          status: "IN_PROGRESS",
          startedAt: now,
          currentSet: match.currentSet ?? 1,
          setScores:
            Array.isArray(match.setScores) && match.setScores.length > 0
              ? match.setScores
              : [{ a: 0, b: 0 }],
          playSeq: match.playSeq ?? 0,
        });
        return { status: 200 as const, match: { status: "IN_PROGRESS" } };
      }

      if (match.status !== "IN_PROGRESS") {
        return { status: 409 as const, error: "Match is not in progress" };
      }

      const currentSet = match.currentSet ?? 1;
      const setScores: { a: number; b: number }[] = (match.setScores ?? [{ a: 0, b: 0 }]).map(
        (s: any) => ({ a: s?.a ?? 0, b: s?.b ?? 0 })
      );
      const live = setScores[Math.min(currentSet - 1, setScores.length - 1)];

      if (action === "end_set") {
        if (live.a === live.b) {
          return { status: 409 as const, error: "Set is tied; record the winning point first" };
        }
        const setWinner: "A" | "B" = live.a > live.b ? "A" : "B";
        const scoreA = (match.scoreA ?? 0) + (setWinner === "A" ? 1 : 0);
        const scoreB = (match.scoreB ?? 0) + (setWinner === "B" ? 1 : 0);

        setScores.push({ a: 0, b: 0 });
        t.update(matchRef, {
          scoreA,
          scoreB,
          currentSet: currentSet + 1,
          setScores,
        });

        const winnerTeamId = setWinner === "A" ? match.teamAId : match.teamBId;
        const loserTeamId = setWinner === "A" ? match.teamBId : match.teamAId;
        t.set(
          tournamentRef.collection("teamStats").doc(winnerTeamId),
          { teamId: winnerTeamId, setsWon: FieldValue.increment(1) },
          { merge: true }
        );
        t.set(
          tournamentRef.collection("teamStats").doc(loserTeamId),
          { teamId: loserTeamId, setsLost: FieldValue.increment(1) },
          { merge: true }
        );

        return { status: 200 as const, match: { scoreA, scoreB, currentSet: currentSet + 1 } };
      }

      // action === "complete"
      let scoreA = match.scoreA ?? 0;
      let scoreB = match.scoreB ?? 0;

      // Fold an unfinished live set with points into the set score first.
      if (live && live.a !== live.b) {
        const setWinner: "A" | "B" = live.a > live.b ? "A" : "B";
        scoreA += setWinner === "A" ? 1 : 0;
        scoreB += setWinner === "B" ? 1 : 0;
        const winnerTeamId = setWinner === "A" ? match.teamAId : match.teamBId;
        const loserTeamId = setWinner === "A" ? match.teamBId : match.teamAId;
        t.set(
          tournamentRef.collection("teamStats").doc(winnerTeamId),
          { teamId: winnerTeamId, setsWon: FieldValue.increment(1) },
          { merge: true }
        );
        t.set(
          tournamentRef.collection("teamStats").doc(loserTeamId),
          { teamId: loserTeamId, setsLost: FieldValue.increment(1) },
          { merge: true }
        );
      }

      if (scoreA === scoreB) {
        return { status: 409 as const, error: "Match is tied; end the deciding set first" };
      }

      const winnerTeamId = scoreA > scoreB ? match.teamAId : match.teamBId;
      const loserTeamId = scoreA > scoreB ? match.teamBId : match.teamAId;

      t.update(matchRef, {
        status: "COMPLETED",
        completedAt: now,
        scoreA,
        scoreB,
        winnerTeamId,
      });
      t.set(
        tournamentRef.collection("teamStats").doc(winnerTeamId),
        { teamId: winnerTeamId, wins: FieldValue.increment(1) },
        { merge: true }
      );
      t.set(
        tournamentRef.collection("teamStats").doc(loserTeamId),
        { teamId: loserTeamId, losses: FieldValue.increment(1) },
        { merge: true }
      );

      return {
        status: 200 as const,
        match: { status: "COMPLETED", scoreA, scoreB, winnerTeamId },
        teams: { teamAId: match.teamAId, teamBId: match.teamBId },
      };
    });

    if (result.status !== 200) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // After completion, bump matchesPlayed for rostered players on both teams.
    if (action === "complete" && "teams" in result && result.teams) {
      const { teamAId, teamBId } = result.teams;
      const playersSnap = await tournamentRef
        .collection("players")
        .where("teamId", "in", [teamAId, teamBId])
        .get();
      let batch = adminDb.batch();
      let ops = 0;
      for (const doc of playersSnap.docs) {
        batch.set(
          tournamentRef.collection("playerStats").doc(doc.id),
          {
            playerId: doc.id,
            teamId: (doc.data() as any)?.teamId ?? null,
            displayName: (doc.data() as any)?.displayName ?? null,
            matchesPlayed: FieldValue.increment(1),
          },
          { merge: true }
        );
        ops += 1;
        if (ops >= 450) {
          await batch.commit();
          batch = adminDb.batch();
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Match status change failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
