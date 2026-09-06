import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

/** Validate fantasy login and provision Google users / admit password admins. */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const signInProvider =
      (decoded.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider ?? null;
    const uid = decoded.uid;
    const email = (decoded.email ?? "").trim().toLowerCase() || null;
    const userRef = adminDb.collection("users").doc(uid);
    const snap = await userRef.get();
    const existing = snap.data() as Record<string, unknown> | undefined;

    if (signInProvider === "password") {
      if (
        !existing ||
        existing.isFantasyUser !== true ||
        existing.isFantasyAdmin !== true ||
        existing.fantasyAuthType !== "password"
      ) {
        return NextResponse.json(
          { error: "This account is not a Fantasy admin login" },
          { status: 403 }
        );
      }
      if (existing.fantasyDisabled === true || existing.isActive === false) {
        return NextResponse.json({ error: "Account disabled" }, { status: 403 });
      }
      await userRef.set(
        { fantasySessionActive: true, updatedAt: Timestamp.now() },
        { merge: true }
      );
      return NextResponse.json({
        ok: true,
        isFantasyAdmin: true,
        fantasyAuthType: "password",
      });
    }

    if (signInProvider !== "google.com") {
      return NextResponse.json(
        { error: "Fantasy players must sign in with Google" },
        { status: 403 }
      );
    }

    // Never elevate a password admin via Google, and never make Google users admins.
    if (existing?.isTrackerDevice === true && existing?.isFantasyUser !== true) {
      return NextResponse.json(
        { error: "Tracker tablet accounts cannot sign in to Fantasy" },
        { status: 403 }
      );
    }

    if (existing?.fantasyDisabled === true) {
      return NextResponse.json({ error: "Account disabled" }, { status: 403 });
    }

    const firstName =
      (typeof existing?.firstName === "string" && existing.firstName) ||
      decoded.name?.split(" ")[0] ||
      "Fantasy";
    const lastName =
      (typeof existing?.lastName === "string" && existing.lastName) ||
      decoded.name?.split(" ").slice(1).join(" ") ||
      "Player";

    // Preserve existing platform roles; new Google fantasy players become MEMBER
    // so club ITS/gender onboarding works when they later use the club site.
    const existingRole = typeof existing?.role === "string" ? existing.role : "";
    const preserveRoles = new Set(["MEMBER", "ADMIN", "SUPER_ADMIN", "TRACKER"]);
    const role = preserveRoles.has(existingRole)
      ? existingRole
      : "MEMBER";

    await userRef.set(
      {
        email,
        firstName,
        lastName,
        role,
        isFantasyUser: true,
        isFantasyAdmin: false,
        fantasyAuthType: "google",
        fantasySessionActive: true,
        fantasyDisabled: false,
        updatedAt: Timestamp.now(),
        ...(snap.exists ? {} : { createdAt: Timestamp.now() }),
        ...(typeof existing?.tokenBalance !== "number" ? { tokenBalance: 0 } : {}),
        ...(existing?.isActive === undefined ? { isActive: true } : {}),
      },
      { merge: true }
    );

    try {
      const claims: Record<string, unknown> = {
        ...((decoded as { claims?: Record<string, unknown> }).claims ?? {}),
        fantasy: true,
      };
      if (role === "MEMBER" || role === "ADMIN" || role === "SUPER_ADMIN" || role === "TRACKER") {
        claims.role = role;
      }
      await adminAuth.setCustomUserClaims(uid, claims);
    } catch {
      // claims optional
    }

    return NextResponse.json({
      ok: true,
      isFantasyAdmin: false,
      fantasyAuthType: "google",
    });
  } catch (err) {
    console.error("Fantasy session error", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
