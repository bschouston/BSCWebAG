import { z } from "zod";
import type { StatOutcome } from "./stat-keys";

/**
 * Global per-sport tracker configuration, stored in Firestore at
 * `trackerConfigs/{sport}`. This is the single source of truth for which
 * stats exist, their category (colors), leaderboard points, capture layout
 * and set rules. Both the tracker capture UI and the web leaderboards read
 * from it; edits happen in the tracker settings page.
 *
 * Sport-specific seeds (e.g. volleyball) live in sport-containers/*.
 */

/**
 * Stat category drives both the button color and the score outcome:
 * - positive          (blue)   — good play, no rally point
 * - positive_points   (green)  — scoring play for Points column (+1), no auto rally
 * - positive_scoring  (green)  — legacy; collapsed by manual-scoring policy
 * - negative          (yellow) — bad play, no rally point
 * - negative_scoring  (red)    — legacy; collapsed by manual-scoring policy
 */
export const StatCategorySchema = z.enum([
  "positive",
  "positive_points",
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
  /** When true, this stat appears on the capture page and public leaderboards. */
  showInTracker: z.boolean().default(true),
  /** Kept in sync with showInTracker (legacy field; visibility uses showInTracker). */
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
  positive_points: z.string().min(1).default("#22c55e"),
  positive_scoring: z.string().min(1),
  negative: z.string().min(1),
  negative_scoring: z.string().min(1),
});
export type TrackerColors = z.infer<typeof TrackerColorsSchema>;

export const TrackerLayoutSchema = z.object({
  /** Player grid columns on the capture page: 2 (2x3) or 3 (3x2). */
  playerGridColumns: z.union([z.literal(2), z.literal(3)]),
  /** "grid": player cards in a grid. "rows": one player per line, all stats across. */
  playerLayout: z.enum(["grid", "rows"]).default("grid"),
});
export type TrackerLayout = z.infer<typeof TrackerLayoutSchema>;
export type PlayerLayout = TrackerLayout["playerLayout"];

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
  positive_points: "#22c55e",
  positive_scoring: "#22c55e",
  negative: "#eab308",
  negative_scoring: "#ef4444",
};

export const DEFAULT_TRACKER_LAYOUT: TrackerLayout = {
  playerGridColumns: 3,
  playerLayout: "grid",
};

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

/** Green "positive points" taps (+1 to leaderboard Points / pointsScored). */
export function categoryCountsTowardPoints(category: StatCategory): boolean {
  return category === "positive_points" || category === "positive_scoring";
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

const POSITIVE_POINTS_STAT_KEYS = new Set(["serve_ace", "attack_kill", "block_point", "dump"]);

/**
 * Ensure volleyball configs have the positive_points category wired for Ace/Kill/Block/Dump.
 * Safe to run on every load; returns { config, changed }.
 */
export function ensureVolleyballPositivePointsDefaults(config: TrackerConfig): {
  config: TrackerConfig;
  changed: boolean;
} {
  if (config.sport !== "volleyball") return { config, changed: false };

  let changed = false;
  const colors: TrackerColors = {
    ...DEFAULT_TRACKER_COLORS,
    ...config.colors,
    positive_points: config.colors.positive_points || DEFAULT_TRACKER_COLORS.positive_points,
  };
  if (config.colors.positive_points !== colors.positive_points) changed = true;

  let stats = config.stats.map((s) => {
    if (POSITIVE_POINTS_STAT_KEYS.has(s.key) && s.category !== "positive_points") {
      changed = true;
      return { ...s, category: "positive_points" as StatCategory };
    }
    return s;
  });

  if (!stats.some((s) => s.key === "dump")) {
    const block = stats.find((s) => s.key === "block_point");
    const insertAt = block ? (block.order ?? 0) + 1 : stats.length;
    stats = [
      ...stats.map((s) =>
        (s.order ?? 0) >= insertAt ? { ...s, order: (s.order ?? 0) + 1 } : s
      ),
      {
        key: "dump",
        label: "Dump",
        shortLabel: "Dump",
        category: "positive_points" as StatCategory,
        points: 2,
        showInTracker: true,
        showInLeaderboard: true,
        requiresPlayer: true,
        aggregateField: "dumps",
        enabled: true,
        order: insertAt,
      },
    ];
    changed = true;
  }

  return {
    config: changed ? { ...config, colors, stats } : { ...config, colors },
    changed,
  };
}

/** Apply manual-scoring policy then volleyball positive-points defaults. */
export function normalizeTrackerConfig(config: TrackerConfig): {
  config: TrackerConfig;
  changed: boolean;
} {
  const manual = applyManualScoringPolicy(config);
  const volleyball = ensureVolleyballPositivePointsDefaults(manual.config);
  let changed = manual.changed || volleyball.changed;
  let next = volleyball.config;

  // Keep leaderboard visibility in sync with "Show in tracker".
  let statsChanged = false;
  const stats = next.stats.map((s) => {
    const show = s.showInTracker !== false;
    if (s.showInLeaderboard === show) return s;
    statsChanged = true;
    return { ...s, showInLeaderboard: show };
  });
  if (statsChanged) {
    next = { ...next, stats };
    changed = true;
  }

  return { config: next, changed };
}

/** Enabled stats visible on the capture page (settings toggle, default on). */
export function isTrackerStatVisible(stat: Pick<TrackerStat, "enabled" | "showInTracker">): boolean {
  return stat.enabled && stat.showInTracker !== false;
}

/** Enabled stats visible on leaderboards (same toggle as capture / Show in tracker). */
export function isLeaderboardStatVisible(
  stat: Pick<TrackerStat, "enabled" | "showInTracker" | "showInLeaderboard">
): boolean {
  return isTrackerStatVisible(stat);
}

/** Resolve button / column color for a stat category. */
export function colorForStatCategory(
  colors: Partial<TrackerColors> | undefined,
  category: StatCategory
): string {
  const c = { ...DEFAULT_TRACKER_COLORS, ...colors };
  if (category === "positive_points" || category === "positive_scoring") {
    return c.positive_points || c.positive_scoring || DEFAULT_TRACKER_COLORS.positive_points;
  }
  if (category === "negative_scoring") {
    return c.negative_scoring || c.negative || DEFAULT_TRACKER_COLORS.negative;
  }
  if (category === "positive") return c.positive || DEFAULT_TRACKER_COLORS.positive;
  if (category === "negative") return c.negative || DEFAULT_TRACKER_COLORS.negative;
  return "#888888";
}

/** Stats rendered as buttons on the match capture page. */
export function trackerConfigCaptureStats(
  config: Pick<TrackerConfig, "stats">
): TrackerStat[] {
  return config.stats.filter(isTrackerStatVisible).sort((a, b) => a.order - b.order);
}

/** statKey -> leaderboard points map (visible stats only). */
export function trackerConfigWeights(config: Pick<TrackerConfig, "stats">): Record<string, number> {
  return Object.fromEntries(
    config.stats
      .filter(isLeaderboardStatVisible)
      .map((s) => [s.key, s.points])
  );
}

export type LeaderboardColumnDef = {
  field: string;
  label: string;
  category: StatCategory;
  color: string;
};

/** Counter columns for leaderboard tables (visible stats only, settings order). */
export function trackerConfigLeaderboardColumns(
  config: Pick<TrackerConfig, "stats" | "colors">
): LeaderboardColumnDef[] {
  return config.stats
    .filter(isLeaderboardStatVisible)
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      field: s.aggregateField,
      label: s.shortLabel,
      category: s.category,
      color: colorForStatCategory(config.colors, s.category),
    }));
}

/** Enabled stats marked visible in tracker settings (settings order). */
export function trackerConfigLeaderboardStats(
  config: Pick<TrackerConfig, "stats">
): TrackerStat[] {
  return config.stats.filter(isLeaderboardStatVisible).sort((a, b) => a.order - b.order);
}

/**
 * Total leaderboard Value for a player — only stats marked visible in tracker
 * settings contribute (counter × stat Value weight).
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
      if (categoryCountsTowardPoints(stat.category)) {
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
