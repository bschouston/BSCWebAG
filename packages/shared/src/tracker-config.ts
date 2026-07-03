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
  /** Team-level stats (e.g. opponent error) have no player attached. */
  requiresPlayer: z.boolean(),
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

function outcomeToCategory(outcome: StatOutcome): StatCategory {
  if (outcome === "point_for") return "positive_scoring";
  if (outcome === "point_against") return "negative_scoring";
  return "positive";
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
      category: outcomeToCategory(s.outcome),
      points: s.defaultLeaderboardPoints,
      requiresPlayer: s.requiresPlayer,
      aggregateField: s.aggregateField,
      enabled: true,
      order: i,
    })),
    colors: { ...DEFAULT_TRACKER_COLORS },
    layout: { ...DEFAULT_TRACKER_LAYOUT },
    setRules: { ...DEFAULT_SET_RULES },
  };
}

/** statKey -> leaderboard points map from a config (enabled stats only). */
export function trackerConfigWeights(config: Pick<TrackerConfig, "stats">): Record<string, number> {
  return Object.fromEntries(
    config.stats.filter((s) => s.enabled).map((s) => [s.key, s.points])
  );
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
