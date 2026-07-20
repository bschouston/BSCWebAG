import type { TrackerConfig } from "../tracker-config";
import type { StatTrackerId } from "../stat-tracker";

/** How matches are scored and completed for this sport. */
export type MatchFormat = "sets" | "goals";

export type MatchStatusAction = "start" | "end_set" | "complete" | "score";

export type StandingsColumnId =
  | "team"
  | "wins"
  | "losses"
  | "draws"
  | "sets"
  | "pointsDiff"
  | "goalsFor"
  | "goalsAgainst"
  | "goalDiff";

export type StandingsColumn = {
  id: StandingsColumnId;
  label: string;
  align?: "left" | "center";
};

/**
 * Code package for a sport: scoring engine shape, default stats seed, and
 * view hooks for public/admin surfaces. Tournament data (teams, players,
 * recorded stats) stays under each tournament doc — not in the container.
 */
export type SportContainer = {
  id: StatTrackerId;
  sport: string;
  name: string;
  version: string;
  /** Soft routing hint for future sport-specific UI modules. */
  entrypoint: string;
  matchFormat: MatchFormat;
  /** When true, missing trackerConfigs/{sport} may be seeded from defaultConfig(). */
  canAutoSeed: boolean;
  defaultConfig: () => TrackerConfig;
  /** e.g. "Set" — used on live scoreboards. */
  periodLabel: string;
  /** e.g. "Sets" — standings / match summary. */
  periodsWonLabel: string;
  matchStatusActions: readonly MatchStatusAction[];
  standingsColumns: readonly StandingsColumn[];
};
