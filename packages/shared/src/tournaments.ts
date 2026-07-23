import { z } from "zod";
import { StatTrackerIdSchema } from "./stat-tracker";

export const TournamentStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "COMPLETED",
  "ARCHIVED",
]);
export type TournamentStatus = z.infer<typeof TournamentStatusSchema>;

export const TournamentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: TournamentStatusSchema,
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  createdAt: z.string().optional(),
  createdBy: z.string().optional(),
  statTrackerId: StatTrackerIdSchema,
  statTrackerVersion: z.string().optional(),
});
export type Tournament = z.infer<typeof TournamentSchema>;

export const TeamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
  divisionId: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});
export type Team = z.infer<typeof TeamSchema>;

export const DivisionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
  createdAt: z.string().optional(),
});
export type Division = z.infer<typeof DivisionSchema>;

export const PlayerSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  number: z.number().int().optional(),
  teamId: z.string().optional(),
  createdAt: z.string().optional(),
});
export type Player = z.infer<typeof PlayerSchema>;

export const MatchStatusSchema = z.enum(["UPCOMING", "IN_PROGRESS", "COMPLETED"]);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

export const SetScoreSchema = z.object({
  a: z.number().int().default(0),
  b: z.number().int().default(0),
});
export type SetScore = z.infer<typeof SetScoreSchema>;

export const MatchPairingTypeSchema = z.enum(["DIVISION", "CROSS"]);
export type MatchPairingType = z.infer<typeof MatchPairingTypeSchema>;

export const RoundRobinScheduleConfigSchema = z.object({
  numberOfCourts: z.number().int().min(1),
  timePerMatchMinutes: z.number().int().min(1),
  scheduleDate: z.string().min(1),
  startTime: z.string().min(1),
  lunchStart: z.string().min(1),
  lunchEnd: z.string().min(1),
  gamesPerTeam: z.number().int().min(1),
});
export type RoundRobinScheduleConfig = z.infer<typeof RoundRobinScheduleConfigSchema>;

export const MatchSchema = z.object({
  id: z.string().min(1),
  scheduledAt: z.string().optional(),
  status: MatchStatusSchema,
  teamAId: z.string().min(1),
  teamBId: z.string().min(1),
  /** Sets won per team. */
  scoreA: z.number().int().default(0),
  scoreB: z.number().int().default(0),
  /** 1-based index of the set in progress. */
  currentSet: z.number().int().min(1).default(1),
  /** Points per set; index 0 = set 1. Last entry is the live set. */
  setScores: z.array(SetScoreSchema).default([]),
  /** Monotonic counter for play ordering, incremented in the write transaction. */
  playSeq: z.number().int().default(0),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  winnerTeamId: z.string().nullable().optional(),
  lastPlayAt: z.string().nullable().optional(),
  /** Optional fields set by the round-robin schedule generator. */
  divisionId: z.string().nullable().optional(),
  pairingType: MatchPairingTypeSchema.optional(),
  courtNumber: z.number().int().min(1).optional(),
  slotIndex: z.number().int().min(0).optional(),
  scheduleGenerationId: z.string().optional(),
  /** Playoff bracket tagging (pool/RR matches omit these). */
  phase: z.enum(["PLAYOFF"]).optional(),
  bracketMatchId: z.string().min(1).optional(),
  dependsOnBracketMatchIds: z.array(z.string().min(1)).optional(),
  playoffGenerationId: z.string().optional(),
  /** Team assigned to record stats for this match (public schedule indicator). */
  trackingTeamId: z.string().min(1).nullable().optional(),
});
export type Match = z.infer<typeof MatchSchema>;

/** Format per-set point scores, e.g. "25–20, 23–25, 15–12". */
export function formatSetScores(
  setScores: { a?: number; b?: number }[] | null | undefined
): string {
  if (!Array.isArray(setScores) || setScores.length === 0) return "";
  return setScores
    .map((s) => `${s?.a ?? 0}–${s?.b ?? 0}`)
    .join(", ");
}

export const TeamKeySchema = z.enum(["A", "B"]);
export type TeamKey = z.infer<typeof TeamKeySchema>;

export const LockSchema = z.object({
  matchId: z.string().min(1),
  teamKey: TeamKeySchema,
  ownerUid: z.string().min(1),
  ownerName: z.string().optional(),
  createdAt: z.string(),
  expiresAt: z.string(),
  releasedAt: z.string().optional(),
});
export type Lock = z.infer<typeof LockSchema>;

