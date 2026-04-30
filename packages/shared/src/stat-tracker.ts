import { z } from "zod";

export const StatTrackerIdSchema = z.string().min(1);
export type StatTrackerId = z.infer<typeof StatTrackerIdSchema>;

export type StatTrackerDefinition = {
  id: StatTrackerId;
  sport: string;
  name: string;
  version: string;
  /**
   * Used by apps/tracker routing to decide which UI module to load.
   * V1 will render a placeholder regardless; V2 will map to real UIs.
   */
  entrypoint: string;
};

export const statTrackers = [
  {
    id: "volleyball.v1",
    sport: "volleyball",
    name: "Volleyball (V1 placeholder)",
    version: "v1",
    entrypoint: "volleyball/v1",
  },
] as const satisfies readonly StatTrackerDefinition[];

export function getStatTracker(id: StatTrackerId) {
  const found = statTrackers.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown statTrackerId: ${id}`);
  return found;
}

