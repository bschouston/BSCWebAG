import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

/** List dedicated fantasy admin (email/password) accounts. */
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const adminAuth = getAdminAuth();
  const snap = await adminDb
    .collection("users")
    .where("isFantasyAdmin", "==", true)
    .where("fantasyAuthType", "==", "password")
    .get();

  const admins = await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data() as Record<string, unknown>;
      let authDisabled = false;
      try {
        authDisabled = (await adminAuth.getUser(d.id)).disabled;
      } catch {
        authDisabled = true;
      }
      return {
        uid: d.id,
        email: (data.email as string | null) ?? null,
        firstName: String(data.firstName ?? ""),
        disabled: data.fantasyDisabled === true || authDisabled || data.isActive === false,
      };
    })
  );

  admins.sort((a, b) => String(a.email).localeCompare(String(b.email)));
  return NextResponse.json({ admins });
}

/** Create a dedicated Fantasy admin email/password login. */
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim() || "Fantasy Admin";

  if (!email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  try {
    const created = await adminAuth.createUser({
      email,
      password,
      displayName: name,
    });
    await adminAuth.setCustomUserClaims(created.uid, { role: "FANTASY", fantasyAdmin: true });

    await adminDb.collection("users").doc(created.uid).set({
      uid: created.uid,
      email,
      firstName: name,
      lastName: "",
      role: "FANTASY",
      isFantasyUser: true,
      isFantasyAdmin: true,
      fantasyAuthType: "password",
      fantasyDisabled: false,
      isActive: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({ ok: true, uid: created.uid });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create admin";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as {
    uid?: string;
    fantasyDisabled?: boolean;
    password?: string;
  };
  const uid = String(body.uid ?? "").trim();
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const adminDb = getAdminDb();
  const adminAuth = getAdminAuth();
  const ref = adminDb.collection("users").doc(uid);
  const snap = await ref.get();
  const data = snap.data() as Record<string, unknown> | undefined;
  if (!snap.exists || data?.isFantasyAdmin !== true || data?.fantasyAuthType !== "password") {
    return NextResponse.json({ error: "Fantasy admin not found" }, { status: 404 });
  }

  if (typeof body.fantasyDisabled === "boolean") {
    await ref.set({ fantasyDisabled: body.fantasyDisabled, updatedAt: Timestamp.now() }, { merge: true });
    await adminAuth.updateUser(uid, { disabled: body.fantasyDisabled });
  }
  if (typeof body.password === "string" && body.password.length >= 8) {
    await adminAuth.updateUser(uid, { password: body.password });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const uid = new URL(req.url).searchParams.get("uid")?.trim() ?? "";
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const adminDb = getAdminDb();
  const adminAuth = getAdminAuth();
  const ref = adminDb.collection("users").doc(uid);
  const snap = await ref.get();
  const data = snap.data() as Record<string, unknown> | undefined;
  if (!snap.exists || data?.fantasyAuthType !== "password") {
    return NextResponse.json({ error: "Fantasy admin not found" }, { status: 404 });
  }

  await ref.delete();
  try {
    await adminAuth.deleteUser(uid);
  } catch {
    // already gone
  }
  return NextResponse.json({ ok: true });
}
