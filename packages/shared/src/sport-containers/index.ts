import type { StatTrackerDefinition, StatTrackerId } from "../stat-tracker";
import { trackerConfigWeights } from "../tracker-config";
import type { SportContainer } from "./types";
import { volleyballContainer } from "./volleyball";

/** All sport container modules shipped in code. Add soccer here when ready. */
export const sportContainers: readonly SportContainer[] = [volleyballContainer];

export type { MatchFormat, MatchStatusAction, SportContainer, StandingsColumn, StandingsColumnId } from "./types";
export { volleyballContainer, defaultVolleyballTrackerConfig } from "./volleyball";

/** Firestore registry doc under `sportTrackers/{id}`. */
export type SportTrackerRegistryEntry = {
  id: StatTrackerId;
  /** Firestore trackerConfigs/{sport} doc id + settings route. */
  sport: string;
  name: string;
  version: string;
  /** Which code module powers this tracker (`SportContainer.sport`). */
  containerType: string;
  entrypoint: string;
  createdAt?: string;
  createdBy?: string;
};

export function listSportContainers(): readonly SportContainer[] {
  return sportContainers;
}

/** Distinct container modules (templates you can create trackers from). */
export function listSportContainerSports(): SportContainer[] {
  return [...new Map(sportContainers.map((c) => [c.sport, c])).values()];
}

export function getContainerModule(containerType: string): SportContainer {
  const found = sportContainers.find((c) => c.sport === containerType);
  if (!found) throw new Error(`Unknown container type: ${containerType}`);
  return found;
}

export function tryGetContainerModule(containerType: string): SportContainer | null {
  return sportContainers.find((c) => c.sport === containerType) ?? null;
}

export function getSportContainer(id: StatTrackerId): SportContainer {
  const found = sportContainers.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown sport container / statTrackerId: ${id}`);
  return found;
}

export function tryGetSportContainer(id: string): SportContainer | null {
  return sportContainers.find((c) => c.id === id) ?? null;
}

export function getSportContainerBySport(sport: string): SportContainer {
  const found = sportContainers.find((c) => c.sport === sport);
  if (!found) throw new Error(`Unknown sport: ${sport}`);
  return found;
}

export function tryGetSportContainerBySport(sport: string): SportContainer | null {
  return sportContainers.find((c) => c.sport === sport) ?? null;
}

/** True when a code container module exists for this type (not the Firestore registry). */
export function isKnownContainerType(containerType: string): boolean {
  return sportContainers.some((c) => c.sport === containerType);
}

/**
 * Sync helper: true if a code module uses this sport slug as its default.
 * Server APIs should also accept sports present in the Firestore registry.
 */
export function isKnownSport(sport: string): boolean {
  return sportContainers.some((c) => c.sport === sport);
}

/**
 * Sync helper for built-in default tracker ids (e.g. volleyball.v1).
 * Server APIs should also accept ids present in the Firestore registry.
 */
export function isKnownStatTrackerId(id: string): boolean {
  return sportContainers.some((c) => c.id === id);
}

/**
 * Resolve sport slug from a tournament's statTrackerId.
 * Built-in containers win; otherwise parse the prefix (registry sport may differ).
 */
export function sportFromStatTrackerId(statTrackerId: string): string {
  const known = tryGetSportContainer(statTrackerId);
  if (known) return known.sport;
  return statTrackerId.split(".")[0] || statTrackerId;
}

/** Built-in defaults only — UI should prefer Firestore registry. */
export function sportContainersAsStatTrackers(): StatTrackerDefinition[] {
  return sportContainers.map((c) => ({
    id: c.id,
    sport: c.sport,
    name: c.name,
    version: c.version,
    entrypoint: c.entrypoint,
  }));
}

export function defaultStatPointWeightsForTracker(statTrackerId: string): Record<string, number> {
  const byId = tryGetSportContainer(statTrackerId);
  if (byId) return trackerConfigWeights(byId.defaultConfig());
  throw new Error(`Unknown sport container / statTrackerId: ${statTrackerId}`);
}

export function defaultStatPointWeightsForContainerType(
  containerType: string
): Record<string, number> {
  return trackerConfigWeights(getContainerModule(containerType).defaultConfig());
}

/** Map event.sportId → built-in container id when a matching module exists. */
export function resolveStatTrackerIdForEventSport(
  eventSportId: string | null | undefined,
  explicit?: string | null
): string | null {
  if (explicit) return explicit;
  const sport = String(eventSportId ?? "")
    .toLowerCase()
    .trim();
  if (!sport) return null;
  const bySport = tryGetSportContainerBySport(sport);
  return bySport?.id ?? null;
}

const SPORT_SLUG_RE = /^[a-z][a-z0-9_]{0,31}$/;

export function normalizeSportSlug(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function isValidSportSlug(sport: string): boolean {
  return SPORT_SLUG_RE.test(sport);
}

export function buildStatTrackerId(sport: string, version = "v1"): string {
  return `${sport}.${version}`;
}
