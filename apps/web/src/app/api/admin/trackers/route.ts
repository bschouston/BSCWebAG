import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

/** List dedicated tracker (tablet) accounts. */
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const adminAuth = getAdminAuth();

  const snap = await adminDb.collection("users").where("role", "==", "TRACKER").get();
  const trackers = await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data() as any;
      let disabled = false;
      try {
        disabled = (await adminAuth.getUser(d.id)).disabled;
      } catch {
        // auth record missing — treat as disabled
        disabled = true;
      }
      return {
        uid: d.id,
        email: data.email ?? null,
        firstName: data.firstName ?? "",
        lastName: data.lastName ?? "",
        disabled,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
      };
    })
  );
  trackers.sort((a, b) => String(a.email).localeCompare(String(b.email)));

  return NextResponse.json({ trackers });
}

/** Create a dedicated tablet TRACKER login (email + password). */
export async function POST(req: NextRequest) {
  const { error, user } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const adminAuth = getAdminAuth();

  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const name = String(body?.name ?? "").trim() || "Tracker Tablet";

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
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ uid: created.uid });
  } catch (err: any) {
    if (err?.code === "auth/email-already-exists") {
      return NextResponse.json({ error: "Email is already in use" }, { status: 409 });
    }
    console.error("Create tracker account error", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
