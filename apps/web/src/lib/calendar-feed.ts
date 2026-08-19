import "server-only";
import { randomBytes } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { appleSubscribeUrl, clubIcsUrl, googleSubscribeUrl, personalIcsUrl } from "@/lib/calendar-urls";

export async function ensureCalendarFeedToken(uid: string, rotate = false): Promise<string> {
  const adminDb = getAdminDb();
  const userRef = adminDb.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const existing =
    typeof userSnap.data()?.calendarFeedToken === "string" ? String(userSnap.data()?.calendarFeedToken) : "";

  if (existing && !rotate) {
    const feed = await adminDb.collection("calendarFeeds").doc(existing).get();
    if (feed.exists && String(feed.data()?.userId || "") === uid) {
      return existing;
    }
  }

  const token = randomBytes(24).toString("hex");
  if (existing) {
    await adminDb.collection("calendarFeeds").doc(existing).delete().catch(() => undefined);
  }
  await adminDb.collection("calendarFeeds").doc(token).set({
    userId: uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  await userRef.set(
    { calendarFeedToken: token, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return token;
}

export function calendarFeedPayload(token: string) {
  const personal = personalIcsUrl(token);
  const club = clubIcsUrl();
  return {
    myEvents: {
      icsUrl: personal,
      googleUrl: googleSubscribeUrl(personal),
      appleUrl: appleSubscribeUrl(personal),
    },
    club: {
      icsUrl: club,
      googleUrl: googleSubscribeUrl(club),
      appleUrl: appleSubscribeUrl(club),
    },
  };
}
