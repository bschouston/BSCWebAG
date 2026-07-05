import { z } from "zod";
import { TeamKeySchema } from "./tournaments";

/**
 * A play is the unit of stat capture: one or more stat entries (player +
 * statKey) submitted together by a tracker. Plays are append-only; deletions
 * are soft (flag + aggregate reversal) so history stays auditable.
 */

export const PlayEntrySchema = z.object({
  /** Null for team-level stats such as opponent_error. */
  playerId: z.string().min(1).nullable(),
  statKey: z.string().min(1),
});
export type PlayEntry = z.infer<typeof PlayEntrySchema>;

export const PlaySchema = z.object({
  id: z.string().min(1),
  /** Monotonic per-match sequence number assigned in the write transaction. */
  seq: z.number().int(),
  teamKey: TeamKeySchema,
  setNumber: z.number().int().min(1),
  entries: z.array(PlayEntrySchema).min(1),
  /** Resolved score outcome; derived server-side from entries. */
  pointTo: TeamKeySchema.nullable(),
  recordedBy: z.string().min(1),
  createdAt: z.string().optional(),
  deleted: z.boolean().default(false),
  deletedBy: z.string().optional(),
  deletedAt: z.string().optional(),
});
export type Play = z.infer<typeof PlaySchema>;

/** Request body for submitting a play from the tracker. */
export const SubmitPlayInputSchema = z.object({
  teamKey: TeamKeySchema,
  entries: z.array(PlayEntrySchema).min(1).max(12),
});
export type SubmitPlayInput = z.infer<typeof SubmitPlayInputSchema>;

/** Per-tournament player aggregate counters (statKey aggregateFields + extras). */
export const PlayerStatsSchema = z.object({
  playerId: z.string().min(1),
  teamId: z.string().nullable().optional(),
  displayName: z.string().optional(),
  aces: z.number().int().default(0),
  serveErrors: z.number().int().default(0),
  receives: z.number().int().default(0),
  receiveErrors: z.number().int().default(0),
  assists: z.number().int().default(0),
  attempts: z.number().int().default(0),
  kills: z.number().int().default(0),
  attackErrors: z.number().int().default(0),
  blocks: z.number().int().default(0),
  digs: z.number().int().default(0),
  pointsScored: z.number().int().default(0),
  matchesPlayed: z.number().int().default(0),
});
export type PlayerStats = z.infer<typeof PlayerStatsSchema>;

export const TeamStatsSchema = z.object({
  teamId: z.string().min(1),
  name: z.string().optional(),
  wins: z.number().int().default(0),
  losses: z.number().int().default(0),
  setsWon: z.number().int().default(0),
  setsLost: z.number().int().default(0),
  pointsFor: z.number().int().default(0),
  pointsAgainst: z.number().int().default(0),
});
export type TeamStats = z.infer<typeof TeamStatsSchema>;

/**
 * Leaderboard points for a player = sum(counter x weight) computed at read
 * time, so weight changes apply retroactively without recomputing history.
 *
 * Prefer {@link computeLeaderboardValue} when you have the full tracker config —
 * it respects per-stat "Show on leaderboard" flags.
 */
export function computeLeaderboardPoints(
  stats: Partial<PlayerStats>,
  weights: Record<string, number>,
  aggregateFieldByStatKey: Record<string, string>
): number {
  let total = 0;
  for (const [statKey, weight] of Object.entries(weights)) {
    const field = aggregateFieldByStatKey[statKey];
    if (!field) continue;
    const count = (stats as Record<string, unknown>)[field];
    if (typeof count === "number") total += count * weight;
  }
  return total;
}
