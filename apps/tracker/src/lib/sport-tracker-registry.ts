import { Timestamp } from "firebase-admin/firestore";
import {
  buildStatTrackerId,
  getContainerModule,
  isValidSportSlug,
  listSportContainers,
  normalizeSportSlug,
  tryGetContainerModule,
  type SportTrackerRegistryEntry,
} from "@bsc/shared";
import { getAdminDb } from "./firebase/admin";

export function sportTrackersRef() {
  return getAdminDb().collection("sportTrackers");
}

async function seedConfigForEntry(entry: SportTrackerRegistryEntry): Promise<void> {
  const module = getContainerModule(entry.containerType);
  if (!module.canAutoSeed) return;
  const ref = getAdminDb().collection("trackerConfigs").doc(entry.sport);
  const snap = await ref.get();
  if (snap.exists) return;
  const seeded = { ...module.defaultConfig(), sport: entry.sport };
  await ref.set({
    ...seeded,
    updatedAt: Timestamp.now().toDate().toISOString(),
  });
}

export async function listRegisteredTrackers(): Promise<SportTrackerRegistryEntry[]> {
  await ensureDefaultVolleyballTracker();
  const snap = await sportTrackersRef().orderBy("name", "asc").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SportTrackerRegistryEntry, "id">) }));
}

export async function getRegisteredTracker(
  id: string
): Promise<SportTrackerRegistryEntry | null> {
  const snap = await sportTrackersRef().doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<SportTrackerRegistryEntry, "id">) };
}

export async function findRegisteredTrackerBySport(
  sport: string
): Promise<SportTrackerRegistryEntry | null> {
  const snap = await sportTrackersRef().where("sport", "==", sport).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as Omit<SportTrackerRegistryEntry, "id">) };
}

export async function isRegisteredSport(sport: string): Promise<boolean> {
  return !!(await findRegisteredTrackerBySport(sport));
}

export async function isRegisteredStatTrackerId(id: string): Promise<boolean> {
  return !!(await getRegisteredTracker(id));
}

/** Ensure the built-in volleyball tracker exists in the registry (idempotent). */
export async function ensureDefaultVolleyballTracker(): Promise<void> {
  const volleyball = listSportContainers().find((c) => c.sport === "volleyball");
  if (!volleyball) return;
  const ref = sportTrackersRef().doc(volleyball.id);
  const snap = await ref.get();
  if (!snap.exists) {
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
    await seedConfigForEntry(entry);
    return;
  }
  await seedConfigForEntry({
    id: volleyball.id,
    sport: volleyball.sport,
    name: volleyball.name,
    version: volleyball.version,
    containerType: volleyball.sport,
    entrypoint: volleyball.entrypoint,
  });
}

export type CreateSportTrackerInput = {
  containerType: string;
  name: string;
  sport?: string;
  version?: string;
  createdBy: string;
};

export async function createSportTracker(
  input: CreateSportTrackerInput
): Promise<SportTrackerRegistryEntry> {
  const module = tryGetContainerModule(input.containerType);
  if (!module) {
    throw new Error(
      `Unknown container type "${input.containerType}". Ship the sport module in code before creating a tracker.`
    );
  }

  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("Name is required");

  const sport = normalizeSportSlug(input.sport || module.sport);
  if (!isValidSportSlug(sport)) {
    throw new Error(
      "Sport slug must start with a letter and use only lowercase letters, numbers, and underscores (max 32)."
    );
  }

  const version = String(input.version ?? "v1").trim() || "v1";
  const id = buildStatTrackerId(sport, version);

  if (await getRegisteredTracker(id)) {
    throw new Error(`Tracker "${id}" already exists`);
  }

  const existingSport = await findRegisteredTrackerBySport(sport);
  if (existingSport) {
    throw new Error(`Sport slug "${sport}" is already used by ${existingSport.id}`);
  }

  const now = Timestamp.now().toDate().toISOString();
  const entry: SportTrackerRegistryEntry = {
    id,
    sport,
    name,
    version,
    containerType: module.sport,
    entrypoint: module.entrypoint,
    createdAt: now,
    createdBy: input.createdBy,
  };

  await sportTrackersRef().doc(id).set(entry);
  await seedConfigForEntry(entry);
  return entry;
}
