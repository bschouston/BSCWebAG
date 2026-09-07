import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth/server-auth";
import {
  creditLegacyEntitlement,
  getMemberLegacyClaimPreview,
} from "@/lib/legacy-token-migration";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const preview = await getMemberLegacyClaimPreview(decoded.uid);
    return NextResponse.json({ claim: preview });
  } catch (err) {
    console.error("GET legacy-token-claim", err);
    return NextResponse.json({ error: "Failed to load claim" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const preview = await getMemberLegacyClaimPreview(decoded.uid);
    if (!preview) {
      return NextResponse.json({ error: "No legacy tokens available to claim" }, { status: 400 });
    }
    const result = await creditLegacyEntitlement({
      its: preview.its,
      actor: "member",
      actorUid: decoded.uid,
      requireEmailMatch: true,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Claim failed";
    console.error("POST legacy-token-claim", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
