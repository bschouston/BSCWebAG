import { NextRequest, NextResponse } from "next/server";
import { requireTrackerAdmin } from "../../../../../lib/server-auth";
import { hashPasscode, isValidPasscodeFormat, verifyPasscodeHash } from "../../../../../lib/passcode";
import { isKnownSport, securityRef } from "../../../../../lib/tracker-config-server";

export const dynamic = "force-dynamic";

/**
 * Set or change the 4-digit unlock passcode for a sport. When a passcode
 * already exists the caller must supply the current one. The hash is stored
 * in a private doc that Firestore rules hide from all clients.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sport: string }> }
) {
  const { user, error } = await requireTrackerAdmin(req);
  if (error) return error;

  const { sport } = await params;
  if (!(await isKnownSport(sport))) {
    return NextResponse.json({ error: "Unknown sport" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    currentPasscode?: unknown;
    newPasscode?: unknown;
  };

  if (!isValidPasscodeFormat(body.newPasscode)) {
    return NextResponse.json(
      { error: "Passcode must be exactly 4 digits" },
      { status: 400 }
    );
  }

  try {
    const ref = securityRef(sport);
    const snap = await ref.get();
    const existing = snap.data() as { hash?: string; salt?: string } | undefined;

    if (existing?.hash && existing?.salt) {
      if (
        !isValidPasscodeFormat(body.currentPasscode) ||
        !verifyPasscodeHash(body.currentPasscode, existing.hash, existing.salt)
      ) {
        return NextResponse.json({ error: "Current passcode is incorrect" }, { status: 403 });
      }
    }

    const { hash, salt } = hashPasscode(body.newPasscode);
    await ref.set(
      {
        hash,
        salt,
        failedAttempts: 0,
        lockUntil: null,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      },
      { merge: true }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Passcode update failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
