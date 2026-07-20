import { Timestamp } from "firebase-admin/firestore";
import {
  defaultStatPointWeightsForContainerType,
  defaultStatPointWeightsForTracker,
  tryGetSportContainer,
  type SportTrackerRegistryEntry,
} from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";

export function sportTrackersRef() {
  return getAdminDb().collection("sportTrackers");
}

async function ensureDefaultVolleyballTracker(): Promise<void> {
  const volleyball = tryGetSportContainer("volleyball.v1");
  if (!volleyball) return;
  const ref = sportTrackersRef().doc(volleyball.id);
  const snap = await ref.get();
  if (snap.exists) return;
  const now = Timestamp.now().toDate().toISOString();
  const entry: SportTrackerRegistryEntry = {
    id: volleyball.id,
    sport: volleyball.sport,
    name: volleyball.name,
    version: volleyball.version,
    containerType: volleyball.sport,
    entrypoint: volleyball.entrypoint,
    createdAt: now,
    createdBy: "system",
  };
  await ref.set(entry);
  const cfgRef = getAdminDb().collection("trackerConfigs").doc(volleyball.sport);
  const cfgSnap = await cfgRef.get();
  if (!cfgSnap.exists && volleyball.canAutoSeed) {
    await cfgRef.set({
      ...volleyball.defaultConfig(),
      updatedAt: now,
    });
  }
}

export async function listRegisteredTrackers(): Promise<SportTrackerRegistryEntry[]> {
  await ensureDefaultVolleyballTracker();
  const snap = await sportTrackersRef().orderBy("name", "asc").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SportTrackerRegistryEntry, "id">) }));
}

export async function getRegisteredTracker(
  id: string
): Promise<SportTrackerRegistryEntry | null> {
  await ensureDefaultVolleyballTracker();
  const snap = await sportTrackersRef().doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<SportTrackerRegistryEntry, "id">) };
}

export async function isRegisteredStatTrackerId(id: string): Promise<boolean> {
  return !!(await getRegisteredTracker(id));
}

export async function weightsForRegisteredTracker(
  id: string
): Promise<Record<string, number>> {
  const entry = await getRegisteredTracker(id);
  if (entry) return defaultStatPointWeightsForContainerType(entry.containerType);
  return defaultStatPointWeightsForTracker(id);
}
