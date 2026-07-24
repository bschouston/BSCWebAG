import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "./firebase/admin";

export type FantasyUser = {
  uid: string;
  displayName: string;
  email: string | null;
  isFantasyAdmin: boolean;
  fantasyAuthType: "google" | "password" | null;
};

async function resolveUser(
  req: NextRequest
): Promise<{ user: FantasyUser; error?: never } | { user?: never; error: NextResponse }> {
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
  if (!data || data.isFantasyUser !== true) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (data.fantasyDisabled === true || data.isActive === false) {
    return { error: NextResponse.json({ error: "Account disabled" }, { status: 403 }) };
  }

  const displayName = data.firstName
    ? `${String(data.firstName ?? "")} ${String(data.lastName ?? "")}`.trim()
    : tokenName ?? "Fantasy user";

  return {
    user: {
      uid,
      displayName: displayName || "Fantasy user",
      email: (data.email as string | null | undefined) ?? tokenEmail ?? null,
      isFantasyAdmin: data.isFantasyAdmin === true && data.fantasyAuthType === "password",
      fantasyAuthType:
        data.fantasyAuthType === "password" || data.fantasyAuthType === "google"
          ? data.fantasyAuthType
          : null,
    },
  };
}

export async function requireFantasyUser(req: NextRequest) {
  return resolveUser(req);
}

export async function requireFantasyAdmin(req: NextRequest) {
  const result = await resolveUser(req);
  if (result.error) return result;
  if (!result.user.isFantasyAdmin) {
    return {
      error: NextResponse.json({ error: "Fantasy admin access required" }, { status: 403 }),
    };
  }
  return result;
}
