import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { ensureClubMemberForUid } from "@/lib/ensure-club-member";

export const dynamic = "force-dynamic";

/** Promote Fantasy Google players to MEMBER after club login (Admin SDK). */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const token = authHeader.slice(7);
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);
    const result = await ensureClubMemberForUid(getAdminDb(), adminAuth, decoded.uid);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("ensure-club-member error", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
