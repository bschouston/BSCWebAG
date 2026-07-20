import { z } from "zod";
import { sportContainersAsStatTrackers, getSportContainer } from "./sport-containers";

export const StatTrackerIdSchema = z.string().min(1);
export type StatTrackerId = z.infer<typeof StatTrackerIdSchema>;

export type StatTrackerDefinition = {
  id: StatTrackerId;
  sport: string;
  name: string;
  version: string;
  /**
   * Used by apps/tracker routing to decide which UI module to load.
   * Maps to SportContainer.entrypoint.
   */
  entrypoint: string;
};

/**
 * Registered trackers derived from sport containers.
 * Prefer importing helpers from `./sport-containers` for new code.
 */
export const statTrackers: readonly StatTrackerDefinition[] = sportContainersAsStatTrackers();

export function getStatTracker(id: StatTrackerId): StatTrackerDefinition {
  const container = getSportContainer(id);
  return {
    id: container.id,
    sport: container.sport,
    name: container.name,
    version: container.version,
    entrypoint: container.entrypoint,
  };
}
