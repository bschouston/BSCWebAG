import { z } from "zod";

/**
 * Canonical stat key registry.
 *
 * Every stat recorded anywhere in the platform (tracker capture UI, play
 * history, player aggregates, admin editing, leaderboards) references one of
 * these keys, so the meaning of a stat is defined exactly once.
 *
 * Set/match scores are entered manually — stats do not auto-increment rally
 * scores (all outcomes are "none").
 */

/** How a stat affects the rally score for the recording team. */
export const StatOutcomeSchema = z.enum(["point_for", "point_against", "none"]);
export type StatOutcome = z.infer<typeof StatOutcomeSchema>;

/** Button color group on the tracker capture UI (non-scoring categories only). */
export type StatDisplayCategory = "positive" | "negative";

export type StatKeyDefinition = {
  /** Stable string id stored in Firestore. Never rename. */
  key: string;
  /** UI display name. */
  label: string;
  /** Short label for dense tablet chips. */
  shortLabel: string;
  /** Always "none" — rally scores are manual, not derived from stats. */
  outcome: StatOutcome;
  /** Capture UI color row: positive (blue) or negative (yellow). */
  displayCategory: StatDisplayCategory;
  /** Counter field incremented in playerStats aggregates. */
  aggregateField: string;
  /** Default leaderboard weight; admins can override per tournament. */
  defaultLeaderboardPoints: number;
  requiresPlayer: boolean;
};

export const VOLLEYBALL_STAT_KEYS = [
  {
    key: "serve_ace",
    label: "Ace",
    shortLabel: "Ace",
    outcome: "none",
    displayCategory: "positive",
    aggregateField: "aces",
    defaultLeaderboardPoints: 3,
    requiresPlayer: true,
  },
  {
    key: "serve_error",
    label: "Serve Error",
    shortLabel: "SrvErr",
    outcome: "none",
    displayCategory: "negative",
    aggregateField: "serveErrors",
    defaultLeaderboardPoints: -1,
    requiresPlayer: true,
  },
  {
    key: "receive",
    label: "Receive",
    shortLabel: "Rcv",
    outcome: "none",
    displayCategory: "positive",
    aggregateField: "receives",
    defaultLeaderboardPoints: 1,
    requiresPlayer: true,
  },
  {
    key: "receive_error",
    label: "Receive Error",
    shortLabel: "RcvErr",
    outcome: "none",
    displayCategory: "negative",
    aggregateField: "receiveErrors",
    defaultLeaderboardPoints: -1,
    requiresPlayer: true,
  },
  {
    key: "set_assist",
    label: "Set (Assist)",
    shortLabel: "Set",
    outcome: "none",
    displayCategory: "positive",
    aggregateField: "assists",
    defaultLeaderboardPoints: 1,
    requiresPlayer: true,
  },
  {
    key: "attack_attempt",
    label: "Attack Attempt",
    shortLabel: "Att",
    outcome: "none",
    displayCategory: "positive",
    aggregateField: "attempts",
    defaultLeaderboardPoints: 0,
    requiresPlayer: true,
  },
  {
    key: "attack_kill",
    label: "Kill",
    shortLabel: "Kill",
    outcome: "none",
    displayCategory: "positive",
    aggregateField: "kills",
    defaultLeaderboardPoints: 2,
    requiresPlayer: true,
  },
  {
    key: "attack_error",
    label: "Attack Error",
    shortLabel: "AtkErr",
    outcome: "none",
    displayCategory: "negative",
    aggregateField: "attackErrors",
    defaultLeaderboardPoints: -1,
    requiresPlayer: true,
  },
  {
    key: "block_point",
    label: "Block",
    shortLabel: "Blk",
    outcome: "none",
    displayCategory: "positive",
    aggregateField: "blocks",
    defaultLeaderboardPoints: 2,
    requiresPlayer: true,
  },
  {
    key: "dig",
    label: "Dig",
    shortLabel: "Dig",
    outcome: "none",
    displayCategory: "positive",
    aggregateField: "digs",
    defaultLeaderboardPoints: 1,
    requiresPlayer: true,
  },
] as const satisfies readonly StatKeyDefinition[];

export type VolleyballStatKey = (typeof VOLLEYBALL_STAT_KEYS)[number]["key"];

export const VolleyballStatKeySchema = z.enum(
  VOLLEYBALL_STAT_KEYS.map((s) => s.key) as [VolleyballStatKey, ...VolleyballStatKey[]]
);

const statKeyMap = new Map<string, StatKeyDefinition>(
  VOLLEYBALL_STAT_KEYS.map((s) => [s.key, s])
);

export function getStatKeyDefinition(key: string): StatKeyDefinition {
  const found = statKeyMap.get(key);
  if (!found) throw new Error(`Unknown statKey: ${key}`);
  return found;
}

export function isValidStatKey(key: string): boolean {
  return statKeyMap.has(key);
}

/** Default statKey -> leaderboard points map, used to seed tournaments. */
export function defaultStatPointWeights(): Record<string, number> {
  return Object.fromEntries(
    VOLLEYBALL_STAT_KEYS.map((s) => [s.key, s.defaultLeaderboardPoints])
  );
}

/**
 * Resolve a play's point outcome from its stat entries.
 * Returns "A"/"B" (resolved against the recording team) or null for neutral
 * plays. Throws when entries contain conflicting outcomes (e.g. a kill and a
 * serve error in the same play).
 */
export function derivePointTo(
  statKeys: string[],
  recordingTeam: "A" | "B"
): "A" | "B" | null {
  const outcomes = new Set(
    statKeys
      .map((k) => getStatKeyDefinition(k).outcome)
      .filter((o) => o !== "none")
  );
  if (outcomes.size === 0) return null;
  if (outcomes.size > 1) {
    throw new Error("A play cannot contain both point_for and point_against stats");
  }
  const other = recordingTeam === "A" ? "B" : "A";
  return outcomes.has("point_for") ? recordingTeam : other;
}
