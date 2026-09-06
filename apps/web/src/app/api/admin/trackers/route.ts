import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

type TrackerListRow = {
  uid: string;
  email: string | null;
  firstName: string;
  lastName: string;
  disabled: boolean;
  createdAt: string | null;
  isTrackerDevice: boolean;
  isTrackerAdmin: boolean;
  trackerSessionActive: boolean;
};

/** List tablet TRACKER accounts. */
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const adminAuth = getAdminAuth();

  const trackerSnap = await adminDb.collection("users").where("role", "==", "TRACKER").get();

  const trackers: TrackerListRow[] = await Promise.all(
    trackerSnap.docs.map(async (d) => {
      const data = d.data() as Record<string, unknown>;
      let authDisabled = false;
      try {
        authDisabled = (await adminAuth.getUser(d.id)).disabled;
      } catch {
        authDisabled = true;
      }
      const trackerDisabled = data.trackerDisabled === true;
      const inactive = data.isActive === false;
      return {
        uid: d.id,
        email: (data.email as string | null) ?? null,
        firstName: String(data.firstName ?? ""),
        lastName: String(data.lastName ?? ""),
        disabled: trackerDisabled || authDisabled || inactive,
        createdAt:
          (data.createdAt as { toDate?: () => Date } | undefined)?.toDate?.()?.toISOString?.() ??
          null,
        isTrackerDevice: data.isTrackerDevice === true,
        isTrackerAdmin: data.isTrackerAdmin === true,
        trackerSessionActive: data.trackerSessionActive === true,
      };
    })
  );

  const tabletTrackers = trackers
    .filter((t) => t.isTrackerDevice)
    .sort((a, b) => String(a.email).localeCompare(String(b.email)));

  return NextResponse.json({ tabletTrackers, trackers: tabletTrackers });
}

/** Create a dedicated tablet TRACKER login (email + password). */
export async function POST(req: NextRequest) {
  const { error, user } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const adminAuth = getAdminAuth();

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const name = String(body?.name ?? "").trim() || "Tracker Tablet";
    const isTrackerAdmin = body?.isTrackerAdmin === true;

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const created = await adminAuth.createUser({
      email,
      password,
      displayName: name,
    });
    await adminAuth.setCustomUserClaims(created.uid, { role: "TRACKER" });

    const now = Timestamp.now();
    await adminDb.collection("users").doc(created.uid).set({
      uid: created.uid,
      email,
      firstName: name,
      lastName: "",
      photoURL: null,
      role: "TRACKER",
      tokenBalance: 0,
      isActive: true,
      isTrackerDevice: true,
      isTrackerAdmin,
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ uid: created.uid });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/email-already-exists") {
      return NextResponse.json({ error: "Email is already in use" }, { status: 409 });
    }
    console.error("Create tracker account error", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
