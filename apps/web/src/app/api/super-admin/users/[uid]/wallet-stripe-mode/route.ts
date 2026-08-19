import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import { getAdminDb } from "@/lib/firebase/admin";
import { writeAdminAudit } from "@/lib/admin-audit";
import { isStripeTestConfigured, walletModeFromUser } from "@/lib/stripe-wallet";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;

  const { uid } = await params;
  const adminDb = getAdminDb();
  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    mode: walletModeFromUser(snap.data() as Record<string, unknown>),
    testKeysConfigured: isStripeTestConfigured(),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { error, user } = await requireSuperAdmin(request);
  if (error || !user) return error;

  const { uid } = await params;
  let body: { mode?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const mode = body.mode === "test" ? "test" : body.mode === "live" ? "live" : null;
  if (!mode) {
    return NextResponse.json({ error: "mode must be live or test" }, { status: 400 });
  }
  if (mode === "test" && !isStripeTestConfigured()) {
    return NextResponse.json(
      {
        error:
          "Stripe test keys are not configured. Add STRIPE_SECRET_KEY_TEST and STRIPE_WEBHOOK_SECRET_TEST.",
      },
      { status: 400 }
    );
  }

  const adminDb = getAdminDb();
  const ref = adminDb.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const previous = walletModeFromUser(snap.data() as Record<string, unknown>);
  await ref.update({
    walletStripeMode: mode,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await writeAdminAudit({
    adminUid: user.uid,
    targetUid: uid,
    action: "wallet.stripe_mode",
    meta: { previous, mode },
  });

  return NextResponse.json({
    ok: true,
    mode,
    testKeysConfigured: isStripeTestConfigured(),
  });
}
