/**
 * Upload current public/images/historical flyers to Storage and seed homepageLightbox.
 *
 *   npx tsx --env-file=.env.local scripts/seed-homepage-lightbox.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const ITEMS: Array<{ id: string; title: string; sport: string; era: string; file?: string }> = [
  { id: "wnst-2024", title: "Men's National Soccer Tournament", sport: "Soccer", era: "2024", file: "whatsapp-image-2024-11-15-at-4-11-11-pm--5f9585c7.jpg" },
  { id: "na-soccer-2025", title: "BSC North America Soccer Tournament", sport: "Soccer", era: "2025", file: "whatsapp-image-2025-08-07-at-5-09-26-pm--c803dd7e.jpg" },
  { id: "soccer-showdown-2025", title: "Soccer Showdown — Brisket, Chai & More", sport: "Soccer", era: "2025", file: "brown-modern-animated-sports-match-resul-b2889bd1.jpg" },
  { id: "throwball-live-2025", title: "Throwball Is Back", sport: "Throwball", era: "2025", file: "registration-jpg-eda54115.jpg" },
  { id: "w-throwball-2025", title: "Women's Throwball Tournament", sport: "Throwball", era: "2025", file: "registration-1446-women-s-throwball-tour-499f5019.jpg" },
  { id: "throwball-try-2025", title: "Come Try Throwball", sport: "Throwball", era: "2025", file: "media-1-d3b9111f-991c-4823-9a47-c6e3780d-0e343fff.jpg" },
  { id: "pickleball-2025", title: "Local Pickleball Tournament", sport: "Pickleball", era: "2025", file: "whatsapp-image-2025-08-05-at-2-50-33-pm--ea11f1c7.jpg" },
  { id: "spl-finals-2025", title: "SPL 2025 Finals & Community Lunch", sport: "Cricket", era: "2025", file: "bsc-2025-finals-flyer-png-3470639a.png" },
  { id: "cricket-league-2025", title: "Cricket League", sport: "Cricket", era: "2025", file: "whatsapp-image-2025-08-04-at-11-54-16-am-2c36a83c.jpg" },
  { id: "cricket-tomorrow-2025", title: "Community Cricket Match Day", sport: "Cricket", era: "2025", file: "reminder-flyer-png-6a862b47.png" },
  { id: "swim-national-2025", title: "Burhani National Open Swim Meet (All Ages)", sport: "Swim", era: "2025", file: "swim-meet-registration-flyer-1-png-b99f710e.png" },
  { id: "swim-kids-2025", title: "Swim Meet for Kids and All", sport: "Swim", era: "2025", file: "blue-modern-swimming-tournament-instagra-63de5d0b.png" },
  { id: "swim-beginner-women-2025", title: "Beginner Women's Swimming Lessons", sport: "Swim", era: "2025", file: "bsc-women-s-swim-lessons-flyer-june-2025-7a628f04.jpg" },
  { id: "steps-moula-1446", title: "Steps for Moula TUS 1446", sport: "Walking", era: "1446H", file: "steps-for-moula-1446-flyer-jpg-716bc53d.jpg" },
  { id: "miles-moula-2025", title: "Miles for Moula (TUS)", sport: "Walking", era: "2025", file: "whatsapp-image-2025-03-02-at-7-07-22-pm--d34fa9fb.jpg" },
  { id: "weekly-fitness", title: "Weekly Sports & Fitness Activities", sport: "Fitness", era: "Ongoing", file: "bsc-weekly-schedule-1-19-26-png-ebe23579.png" },
  { id: "pilates-women", title: "Reformer Pilates for Women — BSC × Ōra", sport: "Fitness", era: "2025", file: "neutral-aesthetic-clean-minimalist-geome-e6a50e2a.png" },
  { id: "health-hunt", title: "Umoor Sehat Health Hunt @ Bohra Bazaar", sport: "Health", era: "2026", file: "yellow-and-brown-illustration-summer-tre-1d9749be.png" },
  { id: "conroe-pool", title: "Summer Weekends at Conroe Ranch House", sport: "Community", era: "2025", file: "the-conroe-ranch-house-summer-rentals-fl-0ebeae8d.jpg" },
  { id: "wbb-1446", title: "Women's Basketball Tournament 1446H", sport: "Basketball", era: "1446H" },
  { id: "playground-bball", title: "Playground & Basketball Court Open", sport: "Community", era: "2026" },
];

function init() {
  if (!getApps().length) {
    const path = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH?.trim();
    const inline = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const raw = path ? readFileSync(path, "utf8") : inline;
    if (!raw?.trim()) throw new Error("Missing Firebase Admin credentials in env");
    const bucket =
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
      `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`;
    initializeApp({
      credential: cert(JSON.parse(raw) as ServiceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: bucket,
    });
  }
}

function contentType(file: string) {
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function main() {
  init();
  const db = getFirestore();
  const bucket = getStorage().bucket();
  const existing = await db.collection("homepageLightbox").limit(1).get();
  if (!existing.empty && !process.argv.includes("--force")) {
    console.log("homepageLightbox already has docs. Pass --force to reseed.");
    return;
  }

  if (process.argv.includes("--force")) {
    const all = await db.collection("homepageLightbox").get();
    const batch = db.batch();
    all.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  const dir = resolve(__dirname, "../public/images/historical");
  const now = Timestamp.now();

  for (let i = 0; i < ITEMS.length; i++) {
    const item = ITEMS[i];
    let imageUrl: string | null = null;
    if (item.file) {
      const local = resolve(dir, item.file);
      if (!existsSync(local)) {
        console.warn("missing file", item.file);
      } else {
        const dest = `homepage/lightbox/${item.id}/${item.file}`;
        const file = bucket.file(dest);
        await file.save(readFileSync(local), {
          contentType: contentType(item.file),
          metadata: { cacheControl: "public,max-age=31536000" },
        });
        imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(dest)}?alt=media`;
      }
    }

    await db.collection("homepageLightbox").doc(item.id).set({
      title: item.title,
      sport: item.sport,
      era: item.era,
      imageUrl,
      sortOrder: i,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    console.log("seeded", item.id, imageUrl ? "with image" : "no image");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
