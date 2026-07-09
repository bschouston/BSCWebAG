import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "./firebase/admin";

export type TrackerUser = {
  uid: string;
  role: "TRACKER" | "ADMIN" | "SUPER_ADMIN";
  displayName: string;
  email: string | null;
};

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
  const data = userDoc.data() as any;
  const role = data?.role;
  if (role !== "TRACKER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  if (data?.isActive === false) {
    return { error: NextResponse.json({ error: "Account disabled" }, { status: 403 }) };
  }

  const displayName = data?.firstName
    ? `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim()
    : tokenName ?? "Tracker";

  const email = data?.email ?? tokenEmail ?? null;

  return { user: { uid, role, displayName, email } };
}
