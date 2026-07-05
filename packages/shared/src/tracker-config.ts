import { z } from "zod";
import { VOLLEYBALL_STAT_KEYS, type StatOutcome } from "./stat-keys";

/**
 * Global per-sport tracker configuration, stored in Firestore at
 * `trackerConfigs/{sport}`. This is the single source of truth for which
 * stats exist, their category (colors), leaderboard points, capture layout
 * and set rules. Both the tracker capture UI and the web leaderboards read
 * from it; edits happen in the tracker settings page.
 */

/**
 * Stat category drives both the button color and the score outcome:
 * - positive          (blue)   — good play, no rally point
 * - positive_scoring  (green)  — good play that scores for the recording team
 * - negative          (yellow) — bad play, no rally point
 * - negative_scoring  (red)    — bad play that gives the opponent a point
 */
export const StatCategorySchema = z.enum([
  "positive",
  "positive_scoring",
  "negative",
  "negative_scoring",
]);
export type StatCategory = z.infer<typeof StatCategorySchema>;

export const TrackerStatSchema = z.object({
  /** Stable stat_key stored on every play entry. Immutable after creation. */
  key: z.string().min(1),
  label: z.string().min(1),
  shortLabel: z.string().min(1),
  category: StatCategorySchema,
  /** Global leaderboard weight for this stat. */
  points: z.number(),
  /** When true, this stat appears as a column on public/admin leaderboards. */
  showInLeaderboard: z.boolean().default(true),
  /** All capture stats are recorded per player. */
  requiresPlayer: z.boolean().default(true),
  /** Counter field incremented in playerStats aggregates. Immutable. */
  aggregateField: z.string().min(1),
  /** Soft-delete flag; disabled stats stay for historical data. */
  enabled: z.boolean().default(true),
  /** Display order in the capture UI. */
  order: z.number().int(),
});
export type TrackerStat = z.infer<typeof TrackerStatSchema>;

export const TrackerColorsSchema = z.object({
  positive: z.string().min(1),
  positive_scoring: z.string().min(1),
  negative: z.string().min(1),
  negative_scoring: z.string().min(1),
});
export type TrackerColors = z.infer<typeof TrackerColorsSchema>;

export const TrackerLayoutSchema = z.object({
  /** Player grid columns on the capture page: 2 (2x3) or 3 (3x2). */
  playerGridColumns: z.union([z.literal(2), z.literal(3)]),
});
export type TrackerLayout = z.infer<typeof TrackerLayoutSchema>;

export const SetRulesSchema = z.object({
  totalSets: z.number().int().min(1),
  setsToWin: z.number().int().min(1),
  pointsToWinSet: z.number().int().min(1),
  pointsToWinDecidingSet: z.number().int().min(1),
  winBy: z.number().int().min(1),
});
export type SetRules = z.infer<typeof SetRulesSchema>;

export const TrackerConfigSchema = z.object({
  sport: z.string().min(1),
  stats: z.array(TrackerStatSchema),
  colors: TrackerColorsSchema,
  layout: TrackerLayoutSchema,
  setRules: SetRulesSchema,
  updatedAt: z.string().optional(),
  updatedBy: z.string().optional(),
});
export type TrackerConfig = z.infer<typeof TrackerConfigSchema>;

export const DEFAULT_TRACKER_COLORS: TrackerColors = {
  positive: "#3b82f6",
  positive_scoring: "#22c55e",
  negative: "#eab308",
  negative_scoring: "#ef4444",
};

export const DEFAULT_TRACKER_LAYOUT: TrackerLayout = { playerGridColumns: 3 };

export const DEFAULT_SET_RULES: SetRules = {
  totalSets: 3,
  setsToWin: 2,
  pointsToWinSet: 25,
  pointsToWinDecidingSet: 15,
  winBy: 2,
};

export function categoryToOutcome(category: StatCategory): StatOutcome {
  if (category === "positive_scoring") return "point_for";
  if (category === "negative_scoring") return "point_against";
  return "none";
}

/** Slugify a label into a stable stat_key (e.g. "Net Touch" -> "net_touch"). */
export function statKeyFromLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Aggregate field for a newly created stat (suffixed to avoid collisions). */
export function aggregateFieldFromKey(key: string): string {
  const camel = key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  return `${camel}Count`;
}

/** Seed config from the static volleyball registry (preserves aggregate fields). */
export function defaultVolleyballTrackerConfig(): TrackerConfig {
  return {
    sport: "volleyball",
    stats: VOLLEYBALL_STAT_KEYS.map((s, i) => ({
      key: s.key,
      label: s.label,
      shortLabel: s.shortLabel,
      category: s.displayCategory,
      points: s.defaultLeaderboardPoints,
      showInLeaderboard: true,
      requiresPlayer: true,
      aggregateField: s.aggregateField,
      enabled: true,
      order: i,
    })),
    colors: { ...DEFAULT_TRACKER_COLORS },
    layout: { ...DEFAULT_TRACKER_LAYOUT },
    setRules: { ...DEFAULT_SET_RULES },
  };
}

/**
 * Rally scores are manual — strip auto-scoring categories and retire opponent_error.
 * Returns { config, changed } so callers can persist when changed.
 */
export function applyManualScoringPolicy(config: TrackerConfig): {
  config: TrackerConfig;
  changed: boolean;
} {
  let changed = false;
  const stats = config.stats.map((s) => {
    if (s.key === "opponent_error") {
      if (s.enabled) changed = true;
      return { ...s, enabled: false };
    }
    if (s.category === "positive_scoring") {
      changed = true;
      return { ...s, category: "positive" as StatCategory };
    }
    if (s.category === "negative_scoring") {
      changed = true;
      return { ...s, category: "negative" as StatCategory };
    }
    return s;
  });
  return { config: changed ? { ...config, stats } : config, changed };
}

/** statKey -> leaderboard points map (enabled stats shown on the leaderboard). */
export function trackerConfigWeights(config: Pick<TrackerConfig, "stats">): Record<string, number> {
  return Object.fromEntries(
    config.stats
      .filter((s) => s.enabled && s.showInLeaderboard !== false)
      .map((s) => [s.key, s.points])
  );
}

/** Counter columns for leaderboard tables (enabled + visible stats). */
export function trackerConfigLeaderboardColumns(
  config: Pick<TrackerConfig, "stats">
): { field: string; label: string }[] {
  return config.stats
    .filter((s) => s.enabled && s.showInLeaderboard !== false)
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ field: s.aggregateField, label: s.shortLabel }));
}

/** Enabled stats marked "Show on leaderboard" in tracker settings. */
export function trackerConfigLeaderboardStats(
  config: Pick<TrackerConfig, "stats">
): TrackerStat[] {
  return config.stats.filter((s) => s.enabled && s.showInLeaderboard !== false);
}

/**
 * Total leaderboard Value for a player — only stats with "Show on leaderboard"
 * checked contribute (counter × stat Value weight).
 */
export function computeLeaderboardValue(
  playerStats: Record<string, unknown>,
  config: Pick<TrackerConfig, "stats">
): number {
  let total = 0;
  for (const stat of trackerConfigLeaderboardStats(config)) {
    const count = playerStats[stat.aggregateField];
    if (typeof count === "number") total += count * stat.points;
  }
  return total;
}

/** Sum of raw counts for stats shown on the leaderboard (ignores point weights). */
export function playerLeaderboardStatCount(
  playerStats: Record<string, unknown>,
  config: Pick<TrackerConfig, "stats">
): number {
  let total = 0;
  for (const stat of trackerConfigLeaderboardStats(config)) {
    const count = playerStats[stat.aggregateField];
    if (typeof count === "number" && count > 0) total += count;
  }
  return total;
}

/** True when a player has at least one recorded stat that appears on the leaderboard. */
export function playerHasLeaderboardActivity(
  playerStats: Record<string, unknown>,
  config: Pick<TrackerConfig, "stats">
): boolean {
  return playerLeaderboardStatCount(playerStats, config) > 0;
}

type PlayEntryLike = { playerId: string | null; statKey: string };
type PlayLike = { entries: PlayEntryLike[]; deleted?: boolean };

/**
 * Recompute player aggregate counters from play history using statKey → aggregateField.
 * Used to repair drift when config keys stay stable but counters get out of sync.
 */
export function aggregatePlayerStatsFromPlays(
  plays: PlayLike[],
  statsByKey: Map<string, Pick<TrackerStat, "aggregateField" | "category">>,
  playersById: Map<string, { teamId?: string | null; displayName?: string | null }>
): Map<string, Record<string, number>> {
  const totals = new Map<string, Record<string, number>>();

  for (const play of plays) {
    if (play.deleted) continue;
    for (const entry of play.entries ?? []) {
      if (!entry?.playerId || !entry?.statKey) continue;
      const stat = statsByKey.get(entry.statKey);
      if (!stat) continue;

      const row = totals.get(entry.playerId) ?? {};
      row[stat.aggregateField] = (row[stat.aggregateField] ?? 0) + 1;
      if (stat.category === "positive_scoring") {
        row.pointsScored = (row.pointsScored ?? 0) + 1;
      }
      totals.set(entry.playerId, row);
    }
  }

  // Ensure every rostered player referenced in plays has a row (even if empty).
  for (const [playerId, meta] of playersById) {
    if (!totals.has(playerId)) totals.set(playerId, {});
    void meta;
  }

  return totals;
}

/** statKey -> aggregateField map from a config (all stats, so history keeps resolving). */
export function trackerConfigAggregateFields(
  config: Pick<TrackerConfig, "stats">
): Record<string, string> {
  return Object.fromEntries(config.stats.map((s) => [s.key, s.aggregateField]));
}

/**
 * Config-driven equivalent of derivePointTo: resolve the rally outcome for a
 * play from stat categories. Throws when entries mix for/against outcomes.
 */
export function derivePointToFromConfig(
  statKeys: string[],
  recordingTeam: "A" | "B",
  statsByKey: Map<string, TrackerStat>
): "A" | "B" | null {
  const outcomes = new Set<StatOutcome>();
  for (const key of statKeys) {
    const stat = statsByKey.get(key);
    if (!stat) throw new Error(`Unknown statKey: ${key}`);
    const outcome = categoryToOutcome(stat.category);
    if (outcome !== "none") outcomes.add(outcome);
  }
  if (outcomes.size === 0) return null;
  if (outcomes.size > 1) {
    throw new Error("A play cannot contain both point_for and point_against stats");
  }
  const other = recordingTeam === "A" ? "B" : "A";
  return outcomes.has("point_for") ? recordingTeam : other;
}

/**
 * True when a live set score qualifies as set point reached under the rules
 * (target points and win-by margin), used for the auto "End set?" prompt.
 */
export function isSetComplete(
  a: number,
  b: number,
  setNumber: number,
  rules: SetRules
): boolean {
  const target =
    setNumber >= rules.totalSets ? rules.pointsToWinDecidingSet : rules.pointsToWinSet;
  const hi = Math.max(a, b);
  const diff = Math.abs(a - b);
  return hi >= target && diff >= rules.winBy;
}
