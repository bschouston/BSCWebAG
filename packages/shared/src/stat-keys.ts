import { z } from "zod";

/**
 * Canonical stat key registry.
 *
 * Every stat recorded anywhere in the platform (tracker capture UI, play
 * history, player aggregates, admin editing, leaderboards) references one of
 * these keys, so the meaning of a stat is defined exactly once.
 */

/** How a stat affects the rally score for the recording team. */
export const StatOutcomeSchema = z.enum(["point_for", "point_against", "none"]);
export type StatOutcome = z.infer<typeof StatOutcomeSchema>;

export type StatKeyDefinition = {
  /** Stable string id stored in Firestore. Never rename. */
  key: string;
  /** UI display name. */
  label: string;
  /** Short label for dense tablet chips. */
  shortLabel: string;
  /** Score derivation: point for the recording team, against it, or neutral. */
  outcome: StatOutcome;
  /** Counter field incremented in playerStats aggregates. */
  aggregateField: string;
  /** Default leaderboard weight; admins can override per tournament. */
  defaultLeaderboardPoints: number;
  /** Team-level stats (e.g. opponent error) have no player attached. */
  requiresPlayer: boolean;
};

export const VOLLEYBALL_STAT_KEYS = [
  {
    key: "serve_ace",
    label: "Ace",
    shortLabel: "Ace",
    outcome: "point_for",
    aggregateField: "aces",
    defaultLeaderboardPoints: 3,
    requiresPlayer: true,
  },
  {
    key: "serve_error",
    label: "Serve Error",
    shortLabel: "SrvErr",
    outcome: "point_against",
    aggregateField: "serveErrors",
    defaultLeaderboardPoints: -1,
    requiresPlayer: true,
  },
  {
    key: "receive",
    label: "Receive",
    shortLabel: "Rcv",
    outcome: "none",
    aggregateField: "receives",
    defaultLeaderboardPoints: 1,
    requiresPlayer: true,
  },
  {
    key: "receive_error",
    label: "Receive Error",
    shortLabel: "RcvErr",
    outcome: "point_against",
    aggregateField: "receiveErrors",
    defaultLeaderboardPoints: -1,
    requiresPlayer: true,
  },
  {
    key: "set_assist",
    label: "Set (Assist)",
    shortLabel: "Set",
    outcome: "none",
    aggregateField: "assists",
    defaultLeaderboardPoints: 1,
    requiresPlayer: true,
  },
  {
    key: "attack_attempt",
    label: "Attack Attempt",
    shortLabel: "Att",
    outcome: "none",
    aggregateField: "attempts",
    defaultLeaderboardPoints: 0,
    requiresPlayer: true,
  },
  {
    key: "attack_kill",
    label: "Kill",
    shortLabel: "Kill",
    outcome: "point_for",
    aggregateField: "kills",
    defaultLeaderboardPoints: 2,
    requiresPlayer: true,
  },
  {
    key: "attack_error",
    label: "Attack Error",
    shortLabel: "AtkErr",
    outcome: "point_against",
    aggregateField: "attackErrors",
    defaultLeaderboardPoints: -1,
    requiresPlayer: true,
  },
  {
    key: "block_point",
    label: "Block",
    shortLabel: "Blk",
    outcome: "point_for",
    aggregateField: "blocks",
    defaultLeaderboardPoints: 2,
    requiresPlayer: true,
  },
  {
    key: "dig",
    label: "Dig",
    shortLabel: "Dig",
    outcome: "none",
    aggregateField: "digs",
    defaultLeaderboardPoints: 1,
    requiresPlayer: true,
  },
  {
    key: "opponent_error",
    label: "Opponent Error",
    shortLabel: "OppErr",
    outcome: "point_for",
    aggregateField: "opponentErrors",
    defaultLeaderboardPoints: 0,
    requiresPlayer: false,
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
