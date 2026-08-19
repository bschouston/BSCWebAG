import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  DEFAULT_SKILL_LEVELS,
  DEFAULT_SPORTS,
  parseCatalogItem,
  type CatalogItem,
} from "@/lib/sports-catalog";

const SPORTS = "managedSports";
const SKILLS = "managedSkillLevels";

async function seedIfEmpty(
  collection: string,
  defaults: Omit<CatalogItem, "id">[]
): Promise<void> {
  const adminDb = getAdminDb();
  const snap = await adminDb.collection(collection).limit(1).get();
  if (!snap.empty) return;
  const batch = adminDb.batch();
  for (const item of defaults) {
    const ref = adminDb.collection(collection).doc(item.slug);
    batch.set(ref, {
      ...item,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function ensureSportsCatalogSeeded(): Promise<void> {
  await Promise.all([
    seedIfEmpty(SPORTS, DEFAULT_SPORTS),
    seedIfEmpty(SKILLS, DEFAULT_SKILL_LEVELS),
  ]);
}

async function listCollection(collection: string, activeOnly: boolean): Promise<CatalogItem[]> {
  const adminDb = getAdminDb();
  const snap = await adminDb.collection(collection).get();
  const items = snap.docs.map((d) => parseCatalogItem(d.id, d.data() as Record<string, unknown>));
  const filtered = activeOnly ? items.filter((i) => i.active) : items;
  return filtered.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

export async function listSports(activeOnly = true): Promise<CatalogItem[]> {
  await ensureSportsCatalogSeeded();
  return listCollection(SPORTS, activeOnly);
}

export async function listSkillLevels(activeOnly = true): Promise<CatalogItem[]> {
  await ensureSportsCatalogSeeded();
  return listCollection(SKILLS, activeOnly);
}

export async function upsertCatalogItem(
  kind: "sport" | "skill",
  opts: { id?: string; slug: string; label: string; sortOrder: number; active: boolean }
): Promise<CatalogItem> {
  const collection = kind === "sport" ? SPORTS : SKILLS;
  const adminDb = getAdminDb();
  const id = opts.id || opts.slug;
  const ref = adminDb.collection(collection).doc(id);
  await ref.set(
    {
      slug: opts.slug,
      label: opts.label,
      sortOrder: opts.sortOrder,
      active: opts.active,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  const snap = await ref.get();
  return parseCatalogItem(ref.id, (snap.data() ?? {}) as Record<string, unknown>);
}

export async function deleteCatalogItem(kind: "sport" | "skill", id: string): Promise<void> {
  const collection = kind === "sport" ? SPORTS : SKILLS;
  await getAdminDb().collection(collection).doc(id).delete();
}
