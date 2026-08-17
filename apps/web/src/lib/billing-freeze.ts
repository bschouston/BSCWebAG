import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import { writeAdminAudit } from "@/lib/admin-audit";
import { getStripe, stripeModeFromLivemode } from "@/lib/stripe-wallet";
import {
  sendBillingDisputeFrozenAdminEmail,
  sendBillingDisputeFrozenMemberEmail,
} from "@/lib/email";

export function isBillingFrozen(user: Record<string, unknown> | undefined | null): boolean {
  return Boolean(user?.billingFrozen);
}

export const BILLING_FROZEN_MESSAGE =
  "Your wallet is frozen due to a payment dispute. Contact the club; Super Admin must review before wallet activity resumes.";

/** Resolve Firebase uid from a Stripe dispute via charge → PI metadata or Customer. */
export async function resolveUidFromDispute(
  dispute: Stripe.Dispute
): Promise<{ uid: string | null; chargeId: string | null; paymentIntentId: string | null }> {
  const stripe = getStripe(stripeModeFromLivemode(dispute.livemode));
  const chargeId =
    typeof dispute.charge === "string"
      ? dispute.charge
      : dispute.charge && typeof dispute.charge === "object"
        ? dispute.charge.id
        : null;

  let paymentIntentId: string | null = null;
  let customerId: string | null = null;
  let uidFromMeta: string | null = null;

  if (chargeId) {
    try {
      const charge = await stripe.charges.retrieve(chargeId);
      paymentIntentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id ?? null;
      customerId =
        typeof charge.customer === "string"
          ? charge.customer
          : charge.customer?.id ?? null;

      if (paymentIntentId) {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        const metaUid = pi.metadata?.firebaseUid;
        if (typeof metaUid === "string" && metaUid) uidFromMeta = metaUid;
        if (!customerId) {
          customerId =
            typeof pi.customer === "string"
              ? pi.customer
              : pi.customer?.id ?? null;
        }
      }
    } catch (err) {
      console.error("resolveUidFromDispute charge lookup failed:", err);
    }
  }

  if (uidFromMeta) {
    return { uid: uidFromMeta, chargeId, paymentIntentId };
  }

  if (customerId) {
    const adminDb = getAdminDb();
    const field =
      stripeModeFromLivemode(dispute.livemode) === "test"
        ? "stripeCustomerIdTest"
        : "stripeCustomerId";
    const snap = await adminDb.collection("users").where(field, "==", customerId).limit(1).get();
    if (!snap.empty) {
      return { uid: snap.docs[0]!.id, chargeId, paymentIntentId };
    }
  }

  return { uid: null, chargeId, paymentIntentId };
}

/**
 * Freeze wallet on dispute. No token clawback — Super Admin adjusts ledger after review.
 * Idempotent if already frozen for the same dispute id.
 */
export async function freezeUserForDispute(opts: {
  uid: string;
  dispute: Stripe.Dispute;
  chargeId: string | null;
  paymentIntentId: string | null;
  eventType: string;
}): Promise<{ alreadyFrozen: boolean }> {
  const adminDb = getAdminDb();
  const userRef = adminDb.collection("users").doc(opts.uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    throw new Error("USER_NOT_FOUND");
  }
  const data = snap.data() ?? {};
  const priorDisputeId =
    typeof data.billingFreezeDisputeId === "string" ? data.billingFreezeDisputeId : null;
  const alreadyFrozen =
    Boolean(data.billingFrozen) && priorDisputeId === opts.dispute.id;

  await userRef.update({
    billingFrozen: true,
    billingFrozenAt: FieldValue.serverTimestamp(),
    billingFrozenReason: "stripe_dispute",
    billingFreezeDisputeId: opts.dispute.id,
    billingFreezeMeta: {
      disputeId: opts.dispute.id,
      chargeId: opts.chargeId,
      paymentIntentId: opts.paymentIntentId,
      amountCents: opts.dispute.amount,
      currency: opts.dispute.currency,
      status: opts.dispute.status,
      reason: opts.dispute.reason,
      eventType: opts.eventType,
      updatedAt: new Date().toISOString(),
    },
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (!alreadyFrozen) {
    await writeAdminAudit({
      adminUid: "stripe_webhook",
      targetUid: opts.uid,
      action: "billing.freeze_dispute",
      meta: {
        disputeId: opts.dispute.id,
        chargeId: opts.chargeId,
        paymentIntentId: opts.paymentIntentId,
        amountCents: opts.dispute.amount,
        currency: opts.dispute.currency,
        status: opts.dispute.status,
        reason: opts.dispute.reason,
        eventType: opts.eventType,
      },
    });
  }

  return { alreadyFrozen };
}

/** Record dispute status updates without unfreezing (won/lost still needs Super Admin). */
export async function recordDisputeStatusUpdate(opts: {
  uid: string;
  dispute: Stripe.Dispute;
  chargeId: string | null;
  paymentIntentId: string | null;
  eventType: string;
}): Promise<void> {
  const adminDb = getAdminDb();
  await adminDb.collection("users").doc(opts.uid).update({
    "billingFreezeMeta.status": opts.dispute.status,
    "billingFreezeMeta.eventType": opts.eventType,
    "billingFreezeMeta.updatedAt": new Date().toISOString(),
    "billingFreezeMeta.chargeId": opts.chargeId,
    "billingFreezeMeta.paymentIntentId": opts.paymentIntentId,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAdminAudit({
    adminUid: "stripe_webhook",
    targetUid: opts.uid,
    action: "billing.dispute_updated",
    meta: {
      disputeId: opts.dispute.id,
      status: opts.dispute.status,
      eventType: opts.eventType,
      chargeId: opts.chargeId,
    },
  });
}

export async function unfreezeUserBilling(opts: {
  uid: string;
  adminUid: string;
  note?: string;
}): Promise<void> {
  const adminDb = getAdminDb();
  const userRef = adminDb.collection("users").doc(opts.uid);
  const snap = await userRef.get();
  if (!snap.exists) throw new Error("NOT_FOUND");

  await userRef.update({
    billingFrozen: false,
    billingUnfrozenAt: FieldValue.serverTimestamp(),
    billingUnfrozenBy: opts.adminUid,
    billingUnfreezeNote: opts.note?.trim() || null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAdminAudit({
    adminUid: opts.adminUid,
    targetUid: opts.uid,
    action: "billing.unfreeze",
    meta: { note: opts.note?.trim() || null },
  });
}

export async function notifyBillingFreeze(opts: {
  uid: string;
  dispute: Stripe.Dispute;
  alreadyFrozen: boolean;
}): Promise<void> {
  if (opts.alreadyFrozen) return;

  const adminDb = getAdminDb();
  const userSnap = await adminDb.collection("users").doc(opts.uid).get();
  const user = userSnap.data() ?? {};
  const memberEmail = typeof user.email === "string" ? user.email : null;
  const memberName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || "Member";

  if (memberEmail) {
    sendBillingDisputeFrozenMemberEmail({
      to: memberEmail,
      name: memberName,
      disputeId: opts.dispute.id,
      amountCents: opts.dispute.amount,
      currency: opts.dispute.currency,
    }).catch((e) => console.error("member dispute freeze email failed:", e));
  }

  const admins = await adminDb
    .collection("users")
    .where("role", "==", "SUPER_ADMIN")
    .get();

  const amount = (opts.dispute.amount / 100).toFixed(2);
  const currency = (opts.dispute.currency || "usd").toUpperCase();

  for (const doc of admins.docs) {
    const a = doc.data();
    const to = typeof a.email === "string" ? a.email : null;
    if (!to) continue;
    const adminName =
      [a.firstName, a.lastName].filter(Boolean).join(" ") || "Super Admin";
    sendBillingDisputeFrozenAdminEmail({
      to,
      adminName,
      memberName,
      memberEmail: memberEmail || opts.uid,
      memberUid: opts.uid,
      disputeId: opts.dispute.id,
      amountLabel: `${currency} ${amount}`,
      status: opts.dispute.status,
      reason: opts.dispute.reason || "unknown",
    }).catch((e) => console.error("admin dispute freeze email failed:", e));
  }
}

/** Full handler for charge.dispute.* webhook events. Never claws back tokens. */
export async function handleStripeDisputeEvent(
  eventType: string,
  dispute: Stripe.Dispute
): Promise<{ ok: true; uid: string | null; action: string }> {
  const { uid, chargeId, paymentIntentId } = await resolveUidFromDispute(dispute);
  if (!uid) {
    console.error("Stripe dispute with no mapped user:", dispute.id, eventType);
    return { ok: true, uid: null, action: "unmapped" };
  }

  if (
    eventType === "charge.dispute.created" ||
    eventType === "charge.dispute.funds_withdrawn"
  ) {
    const { alreadyFrozen } = await freezeUserForDispute({
      uid,
      dispute,
      chargeId,
      paymentIntentId,
      eventType,
    });
    await notifyBillingFreeze({ uid, dispute, alreadyFrozen });
    return { ok: true, uid, action: alreadyFrozen ? "already_frozen" : "frozen" };
  }

  // updated / closed — keep frozen; audit status. Super Admin unfreezes manually.
  const { alreadyFrozen } = await freezeUserForDispute({
    uid,
    dispute,
    chargeId,
    paymentIntentId,
    eventType,
  });
  if (alreadyFrozen) {
    await recordDisputeStatusUpdate({
      uid,
      dispute,
      chargeId,
      paymentIntentId,
      eventType,
    });
  }
  return { ok: true, uid, action: "status_recorded" };
}
