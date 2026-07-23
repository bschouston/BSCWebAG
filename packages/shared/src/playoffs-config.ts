import { z } from "zod";

export const PLAYOFF_BRACKET_TYPES = ["double_elimination"] as const;
export type PlayoffBracketType = (typeof PLAYOFF_BRACKET_TYPES)[number];

export const PlayoffBracketTypeSchema = z.enum(PLAYOFF_BRACKET_TYPES);

export const DEFAULT_MERGE_REMAINING_FRACTION = 1 / 3;
export const MIN_PLAYOFF_TEAMS = 4;

export const PlayoffConfigSchema = z.object({
  bracketType: PlayoffBracketTypeSchema,
  playoffTeams: z.number().int().min(MIN_PLAYOFF_TEAMS),
  mergeRemainingFraction: z.number().finite().min(0.05).max(0.95),
  reseedEnabled: z.boolean().default(false),
  reseedRoundKeys: z.array(z.string().min(1)).default([]),
  scheduleDate: z.string().min(1).optional(),
  startTime: z.string().min(1).optional(),
  matchDurationMinutes: z.number().int().min(1).optional(),
  numberOfCourts: z.number().int().min(1).optional(),
});
export type PlayoffConfig = z.infer<typeof PlayoffConfigSchema>;

function defaultScheduleDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const DEFAULT_PLAYOFF_CONFIG: PlayoffConfig = {
  bracketType: "double_elimination",
  playoffTeams: 8,
  mergeRemainingFraction: DEFAULT_MERGE_REMAINING_FRACTION,
  reseedEnabled: false,
  reseedRoundKeys: [],
  scheduleDate: defaultScheduleDate(),
  startTime: "09:00",
  matchDurationMinutes: 30,
  numberOfCourts: 2,
};

export const BracketSlotRefSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("team"),
    teamId: z.string().min(1),
    seed: z.number().int().positive(),
    name: z.string(),
  }),
  z.object({
    type: z.literal("winner"),
    matchId: z.string().min(1),
  }),
  z.object({
    type: z.literal("loser"),
    matchId: z.string().min(1),
  }),
  z.object({
    type: z.literal("reseed"),
    rank: z.number().int().positive(),
    fromRoundKey: z.string().min(1),
    poolSize: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal("tba"),
  }),
]);
export type BracketSlotRef = z.infer<typeof BracketSlotRefSchema>;

export const BracketMatchSchema = z.object({
  id: z.string().min(1),
  teamA: BracketSlotRefSchema,
  teamB: BracketSlotRefSchema,
});
export type BracketMatch = z.infer<typeof BracketMatchSchema>;

export const BracketMainRoundSchema = z.object({
  roundNumber: z.number().int().positive(),
  title: z.string(),
  matches: z.array(BracketMatchSchema),
});
export type BracketMainRound = z.infer<typeof BracketMainRoundSchema>;

export const BracketLowerRoundSchema = z.object({
  label: z.string(),
  matches: z.array(BracketMatchSchema),
});
export type BracketLowerRound = z.infer<typeof BracketLowerRoundSchema>;

export const PlayoffMergeSettingsSchema = z.object({
  remainingFraction: z.number().finite(),
  eliminatedFraction: z.number().finite(),
  eliminationThreshold: z.number().int().positive(),
  remainingTeamThreshold: z.number().int().positive(),
  sourceLabel: z.string(),
});
export type PlayoffMergeSettings = z.infer<typeof PlayoffMergeSettingsSchema>;

export const PlayoffBracketStructureSchema = z.object({
  playIns: z.array(BracketMatchSchema),
  mainRounds: z.array(BracketMainRoundSchema),
  lowerRounds: z.array(BracketLowerRoundSchema),
  finals: z.array(BracketMatchSchema),
  eliminatedBeforeMerge: z.number().int().nonnegative(),
  eliminationThreshold: z.number().int().positive(),
  remainingTeamThreshold: z.number().int().positive(),
  mergeSettings: PlayoffMergeSettingsSchema,
  mergeAfterWinnersRound: z.number().int().positive(),
});
export type PlayoffBracketStructure = z.infer<typeof PlayoffBracketStructureSchema>;

export const PlayoffSeedSchema = z.object({
  teamId: z.string().min(1),
  seed: z.number().int().positive(),
  name: z.string().optional(),
});
export type PlayoffSeed = z.infer<typeof PlayoffSeedSchema>;

export const PlayoffBracketDocSchema = z.object({
  generatedAt: z.string(),
  seeds: z.array(PlayoffSeedSchema).min(MIN_PLAYOFF_TEAMS),
  structure: PlayoffBracketStructureSchema,
});
export type PlayoffBracketDoc = z.infer<typeof PlayoffBracketDocSchema>;

/** Persisted on the tournament doc when the playoff final is crowned. */
export const PlayoffChampionSchema = z.object({
  championTeamId: z.string().min(1).nullable().optional(),
  championCrownedAt: z.string().nullable().optional(),
  championBracketMatchId: z.string().min(1).nullable().optional(),
});
export type PlayoffChampion = z.infer<typeof PlayoffChampionSchema>;

export function resolvePlayoffConfig(raw: unknown): PlayoffConfig {
  if (!raw || typeof raw !== "object") {
    return {
      ...DEFAULT_PLAYOFF_CONFIG,
      reseedRoundKeys: [],
    };
  }
  const obj = raw as Record<string, unknown>;
  const playoffTeams = Number(obj.playoffTeams);
  const mergeRemainingFraction = Number(obj.mergeRemainingFraction);
  const reseedEnabled = obj.reseedEnabled === true;
  const reseedRoundKeys = Array.isArray(obj.reseedRoundKeys)
    ? obj.reseedRoundKeys.filter((k): k is string => typeof k === "string" && k.length > 0)
    : [];
  const scheduleDate =
    typeof obj.scheduleDate === "string" && obj.scheduleDate.length > 0
      ? obj.scheduleDate
      : DEFAULT_PLAYOFF_CONFIG.scheduleDate;
  const startTime =
    typeof obj.startTime === "string" && obj.startTime.length > 0
      ? obj.startTime
      : DEFAULT_PLAYOFF_CONFIG.startTime;
  const matchDurationMinutes = Number(obj.matchDurationMinutes);
  const numberOfCourts = Number(obj.numberOfCourts);
  return {
    bracketType: "double_elimination",
    playoffTeams:
      Number.isInteger(playoffTeams) && playoffTeams >= MIN_PLAYOFF_TEAMS
        ? playoffTeams
        : DEFAULT_PLAYOFF_CONFIG.playoffTeams,
    mergeRemainingFraction:
      Number.isFinite(mergeRemainingFraction) &&
      mergeRemainingFraction >= 0.05 &&
      mergeRemainingFraction <= 0.95
        ? mergeRemainingFraction
        : DEFAULT_PLAYOFF_CONFIG.mergeRemainingFraction,
    reseedEnabled,
    reseedRoundKeys: reseedEnabled ? reseedRoundKeys : [],
    scheduleDate,
    startTime,
    matchDurationMinutes:
      Number.isInteger(matchDurationMinutes) && matchDurationMinutes >= 1
        ? matchDurationMinutes
        : DEFAULT_PLAYOFF_CONFIG.matchDurationMinutes,
    numberOfCourts:
      Number.isInteger(numberOfCourts) && numberOfCourts >= 1
        ? numberOfCourts
        : DEFAULT_PLAYOFF_CONFIG.numberOfCourts,
  };
}

function formatReseedRank(rank: number, poolSize?: number): string {
  if (poolSize && rank === poolSize) return "Worst seed";
  if (rank === 1) return "Best seed";
  if (rank === 2) return "2nd-best seed";
  if (rank === 3) return "3rd-best seed";
  const mod10 = rank % 10;
  const mod100 = rank % 100;
  const suffix =
    mod10 === 1 && mod100 !== 11
      ? "st"
      : mod10 === 2 && mod100 !== 12
        ? "nd"
        : mod10 === 3 && mod100 !== 13
          ? "rd"
          : "th";
  return `${rank}${suffix}-best seed`;
}

function formatRoundKeyLabel(fromRoundKey: string): string {
  if (fromRoundKey === "play-ins") return "Play-ins";
  if (fromRoundKey === "final") return "Final";
  if (fromRoundKey === "initial-seeds") return "initial seeds";
  if (fromRoundKey.startsWith("winners-r")) {
    return `Winners R${fromRoundKey.slice("winners-r".length)}`;
  }
  if (fromRoundKey.startsWith("losers-")) {
    const label = fromRoundKey.slice("losers-".length);
    return `Losers ${label}`;
  }
  return fromRoundKey;
}

/** Human-readable label for a bracket slot (admin preview / public). */
export function formatBracketSlotRef(ref: BracketSlotRef): string {
  switch (ref.type) {
    case "team":
      return `#${ref.seed} ${ref.name}`;
    case "winner":
      return `Winner ${ref.matchId}`;
    case "loser":
      return `Loser ${ref.matchId}`;
    case "reseed":
      return `${formatReseedRank(ref.rank, ref.poolSize)} (from ${formatRoundKeyLabel(ref.fromRoundKey)})`;
    case "tba":
      return "TBA";
    default:
      return "TBA";
  }
}
