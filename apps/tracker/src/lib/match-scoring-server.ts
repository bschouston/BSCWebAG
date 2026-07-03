import { completedSetWins, type SetScore } from "./match-edit";

/**
 * When plays are added/removed in a locked (finished) set via a passcode
 * unlock, the set's score changes can flip which team won that set — and for
 * completed matches, the match winner. Recompute the derived fields and the
 * teamStats increment deltas so standings stay consistent with the edit.
 */
export function computeDerivedScoreUpdates(params: {
  status: string;
  currentSet: number;
  oldSetScores: SetScore[];
  newSetScores: SetScore[];
  teamAId: string;
  teamBId: string;
  oldWinnerTeamId: string | null;
}): {
  matchUpdates: Record<string, unknown>;
  /** teamId -> { field: incrementDelta } for teamStats docs. */
  teamStatDeltas: Record<string, Record<string, number>>;
} {
  const { status, currentSet, oldSetScores, newSetScores, teamAId, teamBId } = params;

  const oldWins = completedSetWins(oldSetScores, status, currentSet);
  const newWins = completedSetWins(newSetScores, status, currentSet);

  const matchUpdates: Record<string, unknown> = {};
  const deltas: Record<string, Record<string, number>> = {};
  const bump = (teamId: string, field: string, by: number) => {
    if (by === 0) return;
    deltas[teamId] = deltas[teamId] ?? {};
    deltas[teamId][field] = (deltas[teamId][field] ?? 0) + by;
  };

  if (oldWins.a !== newWins.a || oldWins.b !== newWins.b) {
    matchUpdates.scoreA = newWins.a;
    matchUpdates.scoreB = newWins.b;
    bump(teamAId, "setsWon", newWins.a - oldWins.a);
    bump(teamAId, "setsLost", newWins.b - oldWins.b);
    bump(teamBId, "setsWon", newWins.b - oldWins.b);
    bump(teamBId, "setsLost", newWins.a - oldWins.a);
  }

  if (status === "COMPLETED") {
    const newWinner =
      newWins.a > newWins.b ? teamAId : newWins.b > newWins.a ? teamBId : null;
    const oldWinner = params.oldWinnerTeamId;
    if (newWinner && oldWinner && newWinner !== oldWinner) {
      matchUpdates.winnerTeamId = newWinner;
      bump(newWinner, "wins", 1);
      bump(newWinner, "losses", -1);
      bump(oldWinner, "wins", -1);
      bump(oldWinner, "losses", 1);
    }
  }

  return { matchUpdates, teamStatDeltas: deltas };
}
