import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyAuth } from "@/lib/auth/server-auth";
import {
  buildInsufficientTokensPayload,
  purchaseExactTokensAtRsvp,
  purchasePackageAtRsvp,
} from "@/lib/token-autoreplenish";
import { BILLING_FROZEN_MESSAGE, isBillingFrozen } from "@/lib/billing-freeze";
import { sendTokenRequestPaidEmail } from "@/lib/email";
import { getPendingTokenRequest, payPendingTokenRequest } from "@/lib/token-request";

export const dynamic = "force-dynamic";

type PurchasePayload =
  | { mode: "unit"; tokenCount: number }
  | { mode: "package"; packageId: string };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const uid = decoded.uid;

  let body: { purchase?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  let purchase: PurchasePayload | null = null;
  if (body.purchase && typeof body.purchase === "object" && body.purchase !== null) {
    const p = body.purchase as Record<string, unknown>;
    if (p.mode === "unit") {
      const tokenCount = Number(p.tokenCount);
      if (!Number.isInteger(tokenCount) || tokenCount <= 0) {
        return NextResponse.json({ error: "Invalid tokenCount for unit purchase" }, { status: 400 });
      }
      purchase = { mode: "unit", tokenCount };
    } else if (p.mode === "package") {
      const packageId = typeof p.packageId === "string" ? p.packageId : "";
      if (!packageId) {
        return NextResponse.json({ error: "packageId required for package purchase" }, { status: 400 });
      }
      purchase = { mode: "package", packageId };
    }
  }

  try {
    const adminDb = getAdminDb();
    const pending = await getPendingTokenRequest(adminDb, uid);
    if (!pending || pending.id !== id) {
      return NextResponse.json({ error: "Token request not found" }, { status: 404 });
    }

    const userSnap = await adminDb.collection("users").doc(uid).get();
    const user = userSnap.data() ?? {};
    if (isBillingFrozen(user) && purchase) {
      return NextResponse.json({ error: BILLING_FROZEN_MESSAGE, code: "BILLING_FROZEN" }, { status: 403 });
    }

    let balance = typeof user.tokenBalance === "number" ? user.tokenBalance : 0;
    if (balance < pending.amount) {
      if (purchase?.mode === "unit") {
        const bought = await purchaseExactTokensAtRsvp({
          uid,
          tokenCount: purchase.tokenCount,
          eventTitle: pending.reason,
          eventTraceLabel: pending.reason,
          requestId: pending.id,
        });
        if (!bought.ok) {
          return NextResponse.json(
            { error: bought.error, code: bought.code, balance: bought.balance },
            { status: 402 }
          );
        }
        balance = bought.balance;
      } else if (purchase?.mode === "package") {
        const bought = await purchasePackageAtRsvp({
          uid,
          packageId: purchase.packageId,
          eventTitle: pending.reason,
          eventTraceLabel: pending.reason,
          requestId: pending.id,
        });
        if (!bought.ok) {
          return NextResponse.json(
            { error: bought.error, code: bought.code, balance: bought.balance },
            { status: 402 }
          );
        }
        balance = bought.balance;
      } else {
        const payload = await buildInsufficientTokensPayload(uid, pending.amount);
        return NextResponse.json(
          { error: "Purchase tokens to cover this request", ...payload },
          { status: 402 }
        );
      }
    }

    if (balance < pending.amount) {
      const payload = await buildInsufficientTokensPayload(uid, pending.amount);
      return NextResponse.json(
        { error: "Insufficient tokens after purchase", ...payload },
        { status: 402 }
      );
    }

    const paid = await payPendingTokenRequest({ db: adminDb, uid, requestId: id });
    const email = typeof user.email === "string" ? user.email : null;
    if (email && !paid.replayed) {
      const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Member";
      sendTokenRequestPaidEmail({
        to: email,
        name,
        amount: pending.amount,
        reason: pending.reason,
        balanceAfter: paid.balance,
      }).catch((e) => console.error("token request paid email:", e));
    }

    return NextResponse.json({
      ok: true,
      balance: paid.balance,
      replayed: paid.replayed,
      pendingTokenRequest: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "NOT_FOUND") {
      return NextResponse.json({ error: "Token request not found" }, { status: 404 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (message === "NOT_PENDING") {
      return NextResponse.json({ error: "This request is no longer pending" }, { status: 409 });
    }
    if (message === "INSUFFICIENT_TOKENS") {
      const payload = await buildInsufficientTokensPayload(decoded.uid, 0);
      return NextResponse.json({ error: "Insufficient tokens", ...payload }, { status: 402 });
    }
    console.error("POST token-requests pay", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
