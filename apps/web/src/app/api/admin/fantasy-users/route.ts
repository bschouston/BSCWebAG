import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

/** List Google-provisioned fantasy users. */
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const adminAuth = getAdminAuth();
  const snap = await adminDb.collection("users").where("isFantasyUser", "==", true).get();

  const users = await Promise.all(
    snap.docs
      .filter((d) => (d.data() as { fantasyAuthType?: string }).fantasyAuthType !== "password")
      .map(async (d) => {
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
          lastName: String(data.lastName ?? ""),
          disabled: data.fantasyDisabled === true || authDisabled || data.isActive === false,
          fantasySessionActive: data.fantasySessionActive === true,
          fantasyAuthType: data.fantasyAuthType ?? "google",
        };
      })
  );

  users.sort((a, b) => String(a.email).localeCompare(String(b.email)));
  return NextResponse.json({ users });
}

export async function PATCH(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as {
    uid?: string;
    fantasyDisabled?: boolean;
  };
  const uid = String(body.uid ?? "").trim();
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const adminDb = getAdminDb();
  const ref = adminDb.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists || (snap.data() as { isFantasyUser?: boolean }).isFantasyUser !== true) {
    return NextResponse.json({ error: "Fantasy user not found" }, { status: 404 });
  }

  if (typeof body.fantasyDisabled === "boolean") {
    await ref.set({ fantasyDisabled: body.fantasyDisabled }, { merge: true });
    try {
      await getAdminAuth().updateUser(uid, { disabled: body.fantasyDisabled });
    } catch {
      // firestore flag is enough for fantasy session gate
    }
  }

  return NextResponse.json({ ok: true });
}
