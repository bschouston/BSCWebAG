import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth/server-auth";
import { consumeWalletPin, type WalletPinPurpose } from "@/lib/wallet-pin";
import { transferTokensByIts } from "@/lib/token-transfer";
import { isValidItsNumber, normalizeItsNumber } from "@/lib/its-number";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { toItsNumber?: unknown; amount?: unknown; pin?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pin = String(body.pin ?? "");
  const pinCheck = await consumeWalletPin({
    uid: decoded.uid,
    purpose: "transfer" satisfies WalletPinPurpose,
    pin,
  });
  if (!pinCheck.ok) {
    return NextResponse.json(
      { error: pinCheck.error, code: pinCheck.code },
      { status: 401 }
    );
  }

  const amount = Number(body.amount);
  const toItsNumber = normalizeItsNumber(String(body.toItsNumber ?? ""));
  if (!isValidItsNumber(toItsNumber)) {
    return NextResponse.json({ error: "Invalid recipient ITS#" }, { status: 400 });
  }

  const result = await transferTokensByIts({
    fromUid: decoded.uid,
    toItsNumber,
    amount,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status }
    );
  }

  return NextResponse.json({
    ok: true,
    balance: result.balance,
    transferId: result.transferId,
  });
}
