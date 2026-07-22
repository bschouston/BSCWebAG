import { z } from "zod";

export const STANDINGS_CRITERION_IDS = [
  "winsLosses",
  "tournamentPoints",
  "headToHead",
  "setDifferential",
  "pointDifferential",
] as const;

export type StandingsCriterionId = (typeof STANDINGS_CRITERION_IDS)[number];

export const StandingsCriterionIdSchema = z.enum(STANDINGS_CRITERION_IDS);

export const STANDINGS_CRITERION_LABELS: Record<StandingsCriterionId, string> = {
  winsLosses: "Wins & Losses",
  tournamentPoints: "Tournament Points",
  headToHead: "Head-to-Head",
  setDifferential: "Set Differential",
  pointDifferential: "Points Differential",
};

export const StandingsPointsSchema = z.object({
  winIn2Sets: z.number().finite(),
  winIn3Sets: z.number().finite(),
  lossIn2Sets: z.number().finite(),
  lossIn3Sets: z.number().finite(),
});
export type StandingsPoints = z.infer<typeof StandingsPointsSchema>;

export const StandingsConfigSchema = z.object({
  points: StandingsPointsSchema,
  sortCriteria: z
    .array(StandingsCriterionIdSchema)
    .length(STANDINGS_CRITERION_IDS.length)
    .refine(
      (arr) =>
        STANDINGS_CRITERION_IDS.every((id) => arr.includes(id)) &&
        new Set(arr).size === arr.length,
      { message: "sortCriteria must include each criterion exactly once" }
    ),
  manualOrder: z.array(z.string().min(1)).nullable(),
});
export type StandingsConfig = z.infer<typeof StandingsConfigSchema>;

export const DEFAULT_STANDINGS_POINTS: StandingsPoints = {
  winIn2Sets: 3,
  winIn3Sets: 2,
  lossIn3Sets: 1,
  lossIn2Sets: 0,
};

export const DEFAULT_STANDINGS_SORT_CRITERIA: StandingsCriterionId[] = [
  "winsLosses",
  "tournamentPoints",
  "headToHead",
  "setDifferential",
  "pointDifferential",
];

export const DEFAULT_STANDINGS_CONFIG: StandingsConfig = {
  points: { ...DEFAULT_STANDINGS_POINTS },
  sortCriteria: [...DEFAULT_STANDINGS_SORT_CRITERIA],
  manualOrder: null,
};

function finiteOr(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Normalize partial/legacy docs into a full config. */
export function resolveStandingsConfig(raw: unknown): StandingsConfig {
  if (!raw || typeof raw !== "object") {
    return {
      ...DEFAULT_STANDINGS_CONFIG,
      points: { ...DEFAULT_STANDINGS_POINTS },
      sortCriteria: [...DEFAULT_STANDINGS_SORT_CRITERIA],
    };
  }

  const obj = raw as Record<string, unknown>;
  const pointsRaw = (obj.points as Record<string, unknown> | undefined) ?? {};

  // Legacy: single `loss` (+ unused `tie`) → lossIn2Sets; lossIn3Sets gets its own default.
  const legacyLoss = Number.isFinite(Number(pointsRaw.loss))
    ? Number(pointsRaw.loss)
    : undefined;

  const points: StandingsPoints = {
    winIn2Sets: finiteOr(pointsRaw.winIn2Sets, DEFAULT_STANDINGS_POINTS.winIn2Sets),
    winIn3Sets: finiteOr(pointsRaw.winIn3Sets, DEFAULT_STANDINGS_POINTS.winIn3Sets),
    lossIn2Sets: finiteOr(
      pointsRaw.lossIn2Sets,
      legacyLoss ?? DEFAULT_STANDINGS_POINTS.lossIn2Sets
    ),
    lossIn3Sets: finiteOr(pointsRaw.lossIn3Sets, DEFAULT_STANDINGS_POINTS.lossIn3Sets),
  };

  let sortCriteria = [...DEFAULT_STANDINGS_SORT_CRITERIA];
  if (Array.isArray(obj.sortCriteria)) {
    const filtered = obj.sortCriteria.filter(
      (id): id is StandingsCriterionId =>
        typeof id === "string" && (STANDINGS_CRITERION_IDS as readonly string[]).includes(id)
    );
    const unique = [...new Set(filtered)];
    if (unique.length === STANDINGS_CRITERION_IDS.length) {
      sortCriteria = unique;
    } else {
      // Keep known order, append missing defaults
      sortCriteria = [
        ...unique,
        ...DEFAULT_STANDINGS_SORT_CRITERIA.filter((id) => !unique.includes(id)),
      ];
    }
  }

  let manualOrder: string[] | null = null;
  if (Array.isArray(obj.manualOrder)) {
    manualOrder = obj.manualOrder.filter(
      (id): id is string => typeof id === "string" && id.length > 0
    );
    if (manualOrder.length === 0) manualOrder = null;
  } else if (obj.manualOrder === null) {
    manualOrder = null;
  }

  return { points, sortCriteria, manualOrder };
}
