import { z } from "zod";
import { StatTrackerIdSchema } from "./stat-tracker";

export const TournamentStatusSchema = z.enum(["DRAFT", "ACTIVE", "COMPLETED"]);
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
  createdAt: z.string().optional(),
});
export type Team = z.infer<typeof TeamSchema>;

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

export const MatchSchema = z.object({
  id: z.string().min(1),
  scheduledAt: z.string().optional(),
  status: MatchStatusSchema,
  teamAId: z.string().min(1),
  teamBId: z.string().min(1),
  scoreA: z.number().int().default(0),
  scoreB: z.number().int().default(0),
});
export type Match = z.infer<typeof MatchSchema>;

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

