import { z } from "zod";
import {
  computeLeaderboardValue,
  type TrackerConfig,
} from "./tracker-config";

export const FantasyConfigSchema = z.object({
  teamSize: z.number().int().min(1).max(50).default(7),
  eligiblePlayerIds: z.array(z.string()).default([]),
  eligibleTeamIds: z.array(z.string()).default([]),
  teamsLockedGlobal: z.boolean().default(false),
  /** Max sum of player Fantasy Values per team. null/0 = no limit. */
  maxBudget: z.number().min(0).nullable().default(null),
  /** Per-player Fantasy Value (price). Missing key = 0 (free). */
  playerValues: z.record(z.string(), z.number().min(0)).default({}),
  updatedAt: z.string().optional(),
  updatedBy: z.string().optional(),
});
export type FantasyConfig = z.infer<typeof FantasyConfigSchema>;

export const FantasyTeamSchema = z.object({
  teamName: z.string().min(1).max(60),
  teamNameLower: z.string().min(1),
  photoUrl: z.string().nullable().optional(),
  ownerDisplayName: z.string().min(1),
  /** Stored for identity; never display in UI. */
  ownerEmail: z.string().nullable().optional(),
  playerIds: z.array(z.string()).default([]),
  locked: z.boolean().default(false),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type FantasyTeam = z.infer<typeof FantasyTeamSchema>;

export function normalizeFantasyTeamName(name: string): string {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}

export function fantasyTeamNameLower(name: string): string {
  return normalizeFantasyTeamName(name).toLowerCase();
}

export function isFantasyTeamEffectivelyLocked(
  team: { locked?: boolean } | null | undefined,
  config: { teamsLockedGlobal?: boolean } | null | undefined
): boolean {
  return team?.locked === true || config?.teamsLockedGlobal === true;
}

/** Sum live Fantasy Pts across rostered players using tracker config weights. */
export function computeFantasyTeamValue(
  playerIds: string[],
  playerStatsById: Record<string, Record<string, unknown>>,
  config: Pick<TrackerConfig, "stats"> | { stats: TrackerConfig["stats"] }
): number {
  let total = 0;
  for (const id of playerIds) {
    const stats = playerStatsById[id];
    if (!stats) continue;
    total += computeLeaderboardValue(stats, config);
  }
  return total;
}

/** Sum Fantasy Value (price) for a roster. Missing prices count as 0. */
export function computeFantasyRosterCost(
  playerIds: string[],
  playerValues: Record<string, number> | null | undefined
): number {
  const map = playerValues ?? {};
  let total = 0;
  for (const id of playerIds) {
    const v = map[id];
    total += typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
  }
  return total;
}

export function playerFantasyValue(
  playerId: string,
  playerValues: Record<string, number> | null | undefined
): number {
  const v = playerValues?.[playerId];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

export function defaultFantasyConfig(): FantasyConfig {
  return {
    teamSize: 7,
    eligiblePlayerIds: [],
    eligibleTeamIds: [],
    teamsLockedGlobal: false,
    maxBudget: null,
    playerValues: {},
  };
}
