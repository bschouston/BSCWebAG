import {
  DEFAULT_SET_RULES,
  DEFAULT_TRACKER_COLORS,
  DEFAULT_TRACKER_LAYOUT,
  type TrackerConfig,
} from "../../tracker-config";
import { VOLLEYBALL_STAT_KEYS } from "../../stat-keys";
import type { SportContainer } from "../types";

export function defaultVolleyballTrackerConfig(): TrackerConfig {
  return {
    sport: "volleyball",
    stats: VOLLEYBALL_STAT_KEYS.map((s, i) => ({
      key: s.key,
      label: s.label,
      shortLabel: s.shortLabel,
      category: s.displayCategory,
      points: s.defaultLeaderboardPoints,
      showInTracker: true,
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

export const volleyballContainer: SportContainer = {
  id: "volleyball.v1",
  sport: "volleyball",
  name: "Volleyball",
  version: "v1",
  entrypoint: "volleyball/v1",
  matchFormat: "sets",
  canAutoSeed: true,
  defaultConfig: defaultVolleyballTrackerConfig,
  periodLabel: "Set",
  periodsWonLabel: "Sets",
  matchStatusActions: ["start", "end_set", "complete", "score"],
  standingsColumns: [
    { id: "team", label: "Team", align: "left" },
    { id: "wins", label: "W", align: "center" },
    { id: "losses", label: "L", align: "center" },
    { id: "sets", label: "Sets", align: "center" },
    { id: "pointsDiff", label: "Pts +/-", align: "center" },
  ],
};
