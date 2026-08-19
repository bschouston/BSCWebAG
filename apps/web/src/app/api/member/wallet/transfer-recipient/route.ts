import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth/server-auth";
import { lookupTransferRecipient } from "@/lib/token-transfer";
import { isValidItsNumber, normalizeItsNumber } from "@/lib/its-number";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const its = normalizeItsNumber(request.nextUrl.searchParams.get("its") ?? "");
  if (!isValidItsNumber(its)) {
    return NextResponse.json({ error: "Recipient ITS# must be exactly 8 digits" }, { status: 400 });
  }

  const result = await lookupTransferRecipient({
    fromUid: decoded.uid,
    toItsNumber: its,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status }
    );
  }

  return NextResponse.json({
    firstName: result.firstName,
    lastName: result.lastName,
    name: result.name,
    itsNumber: result.itsNumber,
  });
}
