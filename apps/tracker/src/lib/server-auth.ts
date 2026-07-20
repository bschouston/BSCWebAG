import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "./firebase/admin";

export type TrackerUser = {
  uid: string;
  role: "TRACKER" | "ADMIN" | "SUPER_ADMIN";
  displayName: string;
  email: string | null;
  isTrackerAdmin: boolean;
  isTrackerDevice: boolean;
  isGoogleTracker: boolean;
};

export function userCanManageTrackerSports(user: TrackerUser): boolean {
  if (user.isGoogleTracker) return false;
  return user.role === "TRACKER" && user.isTrackerDevice && user.isTrackerAdmin;
}

/**
 * Verifies the Bearer token and requires a TRACKER/ADMIN/SUPER_ADMIN role
 * (role read from the Firestore user doc, matching the web app convention).
 */
export async function requireTracker(
  req: NextRequest
): Promise<{ user: TrackerUser; error?: never } | { user?: never; error: NextResponse }> {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const token = authHeader.slice(7);
  let uid: string;
  let tokenName: string | undefined;
  let tokenEmail: string | undefined;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    uid = decoded.uid;
    tokenName = decoded.name;
    tokenEmail = decoded.email;
  } catch {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const userDoc = await getAdminDb().collection("users").doc(uid).get();
  const data = userDoc.data() as Record<string, unknown> | undefined;
  const role = data?.role;
  if (role !== "TRACKER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  if (data?.isActive === false || data?.trackerDisabled === true) {
    return { error: NextResponse.json({ error: "Account disabled" }, { status: 403 }) };
  }

  const displayName = data?.firstName
    ? `${String(data.firstName ?? "")} ${String(data.lastName ?? "")}`.trim()
    : tokenName ?? "Tracker";

  const email = (data?.email as string | null | undefined) ?? tokenEmail ?? null;
  const isTrackerAdmin = data?.isTrackerAdmin === true;
  const isTrackerDevice = data?.isTrackerDevice === true;
  const isGoogleTracker = data?.isGoogleTracker === true;

  return {
    user: {
      uid,
      role: role as TrackerUser["role"],
      displayName,
      email,
      isTrackerAdmin,
      isTrackerDevice,
      isGoogleTracker,
    },
  };
}

/** Requires a tracker admin (tablet isTrackerAdmin) or platform ADMIN/SUPER_ADMIN. */
export async function requireTrackerAdmin(
  req: NextRequest
): Promise<{ user: TrackerUser; error?: never } | { user?: never; error: NextResponse }> {
  const result = await requireTracker(req);
  if (result.error) return result;
  if (!userCanManageTrackerSports(result.user)) {
    return {
      error: NextResponse.json(
        { error: "Tracker admin access required" },
        { status: 403 }
      ),
    };
  }
  return result;
}
