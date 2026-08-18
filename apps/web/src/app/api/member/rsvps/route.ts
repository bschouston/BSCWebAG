import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyAuth } from "@/lib/auth/server-auth";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { applyTokenLedgerInTransaction } from "@/lib/token-ledger";
import {
  autoReplenishIfNeeded,
  buildInsufficientTokensPayload,
  purchaseExactTokensAtRsvp,
  purchasePackageAtRsvp,
  resolveWeeklyTokenHold,
  userHasValidCard,
} from "@/lib/token-autoreplenish";
import {
  BILLING_FROZEN_MESSAGE,
  isBillingFrozen,
} from "@/lib/billing-freeze";
import { refreshDefaultPaymentMethodFromStripe } from "@/lib/stripe-wallet";
import { rsvpWindowState, effectiveRsvpWindowState } from "@/lib/rsvp-window";
import { notifyWaitlistPromoted, notifyWeeklyRsvp } from "@/lib/notify";

export const dynamic = "force-dynamic";

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value instanceof Date) return value;
  return null;
}

function toIso(value: unknown): string | null {
  const d = toDate(value);
  if (d) return d.toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function memberName(user: Record<string, unknown>) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || "Member";
}

function profileGender(user: Record<string, unknown>): string | null {
  const pp = user.playerProfile;
  if (pp && typeof pp === "object" && "gender" in pp) {
    const g = (pp as { gender?: unknown }).gender;
    return typeof g === "string" ? g : null;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminDb = getAdminDb();
  const userId = decoded.uid;
  let body: {
    eventId?: unknown;
    purchase?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  if (!eventId) {
    return NextResponse.json({ error: "Event ID required" }, { status: 400 });
  }

  type PurchasePayload =
    | { mode: "unit"; tokenCount: number }
    | { mode: "package"; packageId: string };

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
    // Pre-read event + user (outside txn) for card / token funding
    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const event = eventSnap.data()!;
    const { isWeekly, tokensMax } = resolveWeeklyTokenHold(event as {
      category?: string;
      tokensRequired?: number;
      tokensMin?: number | null;
      tokensMax?: number | null;
    });

    if (event.category !== "WEEKLY_SPORTS") {
      return NextResponse.json(
        {
          error:
            "RSVP is only for weekly sports. Featured events and tournaments use the registration form on the event page.",
          code: "NOT_WEEKLY",
        },
        { status: 403 }
      );
    }

    const userSnap = await adminDb.collection("users").doc(userId).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    let user = userSnap.data() as Record<string, unknown>;

    if (isBillingFrozen(user)) {
      return NextResponse.json(
        { error: BILLING_FROZEN_MESSAGE, code: "BILLING_FROZEN" },
        { status: 403 }
      );
    }

    if (isWeekly) {
      const gender = profileGender(user);
      const policy = String(event.genderPolicy || "ALL");
      if (policy === "MALE_ONLY" && gender !== "male") {
        return NextResponse.json(
          { error: "This event is male only. Update your profile gender if this is a mistake." },
          { status: 403 }
        );
      }
      if (policy === "FEMALE_ONLY" && gender !== "female") {
        return NextResponse.json(
          { error: "This event is female only. Update your profile gender if this is a mistake." },
          { status: 403 }
        );
      }

      const override =
        event.rsvpManualOverride === "open" || event.rsvpManualOverride === "closed"
          ? event.rsvpManualOverride
          : null;
      if (override === "closed") {
        return NextResponse.json({ error: "RSVP has closed for this event", code: "RSVP_CLOSED" }, { status: 403 });
      }
      if (override !== "open") {
        const opensAt = toDate(event.rsvpOpensAt);
        const closesAt = toDate(event.rsvpClosesAt);
        if (opensAt && closesAt) {
          const state = rsvpWindowState(new Date(), opensAt, closesAt);
          if (state === "before") {
            return NextResponse.json({ error: "RSVP is not open yet", code: "RSVP_CLOSED" }, { status: 403 });
          }
          if (state === "closed") {
            return NextResponse.json({ error: "RSVP has closed for this event", code: "RSVP_CLOSED" }, { status: 403 });
          }
        }
      }

      try {
        await refreshDefaultPaymentMethodFromStripe(userId);
        const refreshed = await adminDb.collection("users").doc(userId).get();
        user = (refreshed.data() ?? user) as Record<string, unknown>;
      } catch (err) {
        console.error("RSVP card refresh:", err);
      }

      if (!userHasValidCard(user)) {
        return NextResponse.json(
          {
            error: "A valid credit card on file is required to RSVP for weekly events",
            code: "CARD_REQUIRED",
          },
          { status: 402 }
        );
      }

      if (tokensMax > 0) {
        let balance =
          typeof user.tokenBalance === "number" ? user.tokenBalance : 0;
        const eventTitle = String(event.title || "Weekly event");

        if (balance < tokensMax) {
          if (purchase?.mode === "unit") {
            const bought = await purchaseExactTokensAtRsvp({
              uid: userId,
              tokenCount: purchase.tokenCount,
              eventId,
              eventTitle,
            });
            if (!bought.ok) {
              return NextResponse.json(
                { error: bought.error, code: bought.code, balance: bought.balance },
                { status: 402 }
              );
            }
            balance = bought.balance;
          } else if (purchase?.mode === "package") {
            const pkgSnap = await adminDb
              .collection("tokenPackages")
              .doc(purchase.packageId)
              .get();
            const pkgData = pkgSnap.data();
            const pkgTokens =
              pkgSnap.exists && pkgData && pkgData.active !== false
                ? Number(pkgData.tokenAmount) || 0
                : 0;
            if (balance + pkgTokens < tokensMax) {
              return NextResponse.json(
                {
                  error: `This package (${pkgTokens} tokens) is not enough to cover the ${tokensMax}-token hold`,
                  code: "PACKAGE_TOO_SMALL",
                  balance,
                  needed: tokensMax,
                  shortfall: tokensMax - balance,
                },
                { status: 400 }
              );
            }
            const bought = await purchasePackageAtRsvp({
              uid: userId,
              packageId: purchase.packageId,
              eventId,
              eventTitle,
            });
            if (!bought.ok) {
              return NextResponse.json(
                { error: bought.error, code: bought.code, balance: bought.balance },
                { status: 402 }
              );
            }
            balance = bought.balance;
          } else if (
            typeof user.tokenAutoReplenishPackageId === "string" &&
            user.tokenAutoReplenishPackageId
          ) {
            const replenished = await autoReplenishIfNeeded({
              uid: userId,
              needed: tokensMax,
            });
            if (!replenished.ok) {
              return NextResponse.json(
                { error: replenished.error, code: replenished.code, balance: replenished.balance },
                { status: 402 }
              );
            }
            balance = replenished.balance;
          } else {
            const payload = await buildInsufficientTokensPayload(userId, tokensMax);
            return NextResponse.json(
              { error: "Insufficient tokens", ...payload },
              { status: 402 }
            );
          }
        }

        if (balance < tokensMax) {
          const payload = await buildInsufficientTokensPayload(userId, tokensMax);
          return NextResponse.json(
            { error: "Insufficient tokens after purchase", ...payload },
            { status: 402 }
          );
        }
      }
    }

    const result = await adminDb.runTransaction(async (t) => {
      const eventRef = adminDb.collection("events").doc(eventId);
      const userRef = adminDb.collection("users").doc(userId);
      const rsvpId = `${eventId}_${userId}`;
      const rsvpRef = adminDb.collection("event_rsvps").doc(rsvpId);

      const eventDoc = await t.get(eventRef);
      if (!eventDoc.exists) throw new Error("Event not found");

      const userDoc = await t.get(userRef);
      if (!userDoc.exists) throw new Error("User not found");

      const rsvpDoc = await t.get(rsvpRef);
      if (rsvpDoc.exists) {
        const rsvpData = rsvpDoc.data();
        if (rsvpData?.status === "CONFIRMED" || rsvpData?.status === "WAITLISTED") {
          throw new Error("ALREADY_RSVPED");
        }
      }

      const eventData = eventDoc.data()!;
      const userData = userDoc.data()!;
      const hold = resolveWeeklyTokenHold(eventData as {
        category?: string;
        tokensRequired?: number;
        tokensMin?: number | null;
        tokensMax?: number | null;
      });

      const currentCount = eventData.confirmedCount || 0;
      const capacity = eventData.capacity || 0;
      let userBalance =
        typeof userData.tokenBalance === "number" ? userData.tokenBalance : 0;

      let status: "CONFIRMED" | "WAITLISTED" = "CONFIRMED";
      let waitlistPosition: number | null = null;

      if (currentCount >= capacity) {
        status = "WAITLISTED";
        waitlistPosition = (eventData.waitlistCount || 0) + 1;
      }

      if (hold.isWeekly && hold.tokensMax > 0 && userBalance < hold.tokensMax) {
        throw new Error("INSUFFICIENT_TOKENS");
      }

      // Non-weekly legacy: confirm-only debit of tokensRequired
      const legacyTokens = Number(eventData.tokensRequired) || 0;
      if (!hold.isWeekly && status === "CONFIRMED" && legacyTokens > 0 && userBalance < legacyTokens) {
        throw new Error("INSUFFICIENT_TOKENS");
      }

      const now = Timestamp.now();
      const rsvpPayload: Record<string, unknown> = {
        id: rsvpId,
        eventId,
        userId,
        status,
        waitlistPosition,
        attended: false,
        createdAt: now,
        updatedAt: now,
      };

      if (hold.isWeekly && hold.tokensMax > 0) {
        rsvpPayload.tokensHeld = hold.tokensMax;
        rsvpPayload.tokensFinal = null;
        rsvpPayload.tokensMin = hold.tokensMin;
        rsvpPayload.tokensMax = hold.tokensMax;
      }

      // All ledger reads/writes before any other writes (Firestore txn rule).
      if (hold.isWeekly && hold.tokensMax > 0) {
        const ledger = await applyTokenLedgerInTransaction(t, adminDb, {
          userId,
          userRef,
          currentBalance: userBalance,
          type: "DEBIT",
          amount: hold.tokensMax,
          reason: "rsvp_hold",
          description: `RSVP hold (up to ${hold.tokensMax} tokens): ${eventData.title}`,
          idempotencyKey: `rsvp_hold_${rsvpId}`,
          eventId,
          rsvpId,
          meta: { tokensMin: hold.tokensMin, tokensMax: hold.tokensMax, status },
        });
        userBalance = ledger.balance;
      } else if (!hold.isWeekly && status === "CONFIRMED" && legacyTokens > 0) {
        await applyTokenLedgerInTransaction(t, adminDb, {
          userId,
          userRef,
          currentBalance: userBalance,
          type: "DEBIT",
          amount: legacyTokens,
          reason: "rsvp",
          description: `RSVP to ${eventData.title}`,
          idempotencyKey: `rsvp_debit_${rsvpId}`,
          eventId,
          rsvpId,
        });
      }

      t.set(rsvpRef, rsvpPayload);

      if (status === "CONFIRMED") {
        t.update(eventRef, { confirmedCount: currentCount + 1 });
      } else {
        t.update(eventRef, { waitlistCount: (eventData.waitlistCount || 0) + 1 });
      }

      return {
        status,
        waitlistPosition,
        tokensHeld: hold.isWeekly && hold.tokensMax > 0 ? hold.tokensMax : null,
      };
    });

    if (isWeekly) {
      const email = typeof user.email === "string" ? user.email : null;
      if (email) {
        const start = toDate(event.startTime);
        notifyWeeklyRsvp({
          to: email,
          name: memberName(user),
          eventTitle: String(event.title || "Weekly event"),
          status: result.status,
          tokensHeld: typeof result.tokensHeld === "number" ? result.tokensHeld : 0,
          startLabel: start
            ? start.toLocaleString("en-US", { timeZone: "America/Chicago" })
            : "",
          phone: typeof user.phone === "string" ? user.phone : null,
        }).catch((e) => console.error("rsvp email", e));
      }
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("RSVP Transaction Error:", error);
    if (message === "ALREADY_RSVPED") {
      return NextResponse.json(
        { error: "You have already RSVP'd to this event" },
        { status: 409 }
      );
    }
    if (message === "INSUFFICIENT_TOKENS" || message === "NEGATIVE_BALANCE") {
      return NextResponse.json({ error: "Insufficient tokens" }, { status: 402 });
    }
    return NextResponse.json({ error: message || "Failed to RSVP" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const adminDb = getAdminDb();
    const snap = await adminDb.collection("event_rsvps").where("userId", "==", decoded.uid).get();
    const eventIds = [
      ...new Set(snap.docs.map((d) => String(d.data().eventId || "")).filter(Boolean)),
    ];
    const eventMap = new Map<
      string,
      {
        title: string;
        startTime: string | null;
        endTime: string | null;
        sportId: string | null;
        locationId: string | null;
        category: string | null;
        status: string | null;
      }
    >();
    await Promise.all(
      eventIds.map(async (eventId) => {
        const eventSnap = await adminDb.collection("events").doc(eventId).get();
        const ed = eventSnap.data();
        if (!ed) return;
        eventMap.set(eventId, {
          title: String(ed.title || "Event"),
          startTime: toIso(ed.startTime),
          endTime: toIso(ed.endTime),
          sportId: typeof ed.sportId === "string" ? ed.sportId : null,
          locationId: typeof ed.locationId === "string" ? ed.locationId : null,
          category: typeof ed.category === "string" ? ed.category : null,
          status: typeof ed.status === "string" ? ed.status : null,
        });
      })
    );

    const rsvps = snap.docs.map((d) => {
      const data = d.data();
      const eventId = data.eventId ? String(data.eventId) : null;
      return {
        id: d.id,
        eventId,
        status: data.status ?? "CONFIRMED",
        waitlistPosition: data.waitlistPosition ?? null,
        tokensHeld: data.tokensHeld ?? null,
        tokensFinal: data.tokensFinal ?? null,
        pendingTokenIncreaseTo: data.pendingTokenIncreaseTo ?? null,
        attended: Boolean(data.attended),
        noShow: Boolean(data.noShow),
        createdAt: toIso(data.createdAt),
        event: eventId ? eventMap.get(eventId) ?? null : null,
      };
    });
    return NextResponse.json({ rsvps });
  } catch (err) {
    console.error("GET /api/member/rsvps", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { eventId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  if (!eventId) {
    return NextResponse.json({ error: "Event ID required" }, { status: 400 });
  }

  const adminDb = getAdminDb();
  const userId = decoded.uid;
  const rsvpId = `${eventId}_${userId}`;

  try {
    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const event = eventSnap.data()!;
    const isWeeklyEvent = event.category === "WEEKLY_SPORTS";
    const rsvpSnap = await adminDb.collection("event_rsvps").doc(rsvpId).get();
    const pendingIncrease = Number(rsvpSnap.data()?.pendingTokenIncreaseTo) || 0;
    const heldNow = Number(rsvpSnap.data()?.tokensHeld) || 0;
    const start = toDate(event.startTime);
    const startPassed = Boolean(start && start.getTime() <= Date.now());
    const pendingAuthOpen = isWeeklyEvent && pendingIncrease > heldNow && !startPassed;

    if (isWeeklyEvent && !pendingAuthOpen) {
      const cancelState = effectiveRsvpWindowState({
        opensAt: event.rsvpOpensAt,
        closesAt: event.rsvpClosesAt,
        override:
          event.rsvpManualOverride === "open" || event.rsvpManualOverride === "closed"
            ? event.rsvpManualOverride
            : null,
      });
      if (cancelState === "closed") {
        return NextResponse.json(
          { error: "RSVP has closed. Only an admin can cancel now." },
          { status: 403 }
        );
      }
    }

    const promoted = await adminDb.runTransaction(async (t) => {
      const eventRef = adminDb.collection("events").doc(eventId);
      const rsvpRef = adminDb.collection("event_rsvps").doc(rsvpId);
      const userRef = adminDb.collection("users").doc(userId);
      const [eventDoc, rsvpDoc, userDoc] = await Promise.all([
        t.get(eventRef),
        t.get(rsvpRef),
        t.get(userRef),
      ]);
      if (!rsvpDoc.exists) throw new Error("NOT_FOUND");
      const rsvp = rsvpDoc.data()!;
      if (rsvp.status !== "CONFIRMED" && rsvp.status !== "WAITLISTED") {
        throw new Error("NOT_ACTIVE");
      }
      const eventData = eventDoc.data()!;
      const userData = userDoc.data() ?? {};
      const held = Number(rsvp.tokensHeld) || 0;
      let balance = typeof userData.tokenBalance === "number" ? userData.tokenBalance : 0;

      if (held > 0) {
        const credit = await applyTokenLedgerInTransaction(t, adminDb, {
          userId,
          userRef,
          currentBalance: balance,
          type: "CREDIT",
          amount: held,
          reason: "rsvp_cancel_refund",
          description: `Cancel RSVP refund: ${eventData.title}`,
          idempotencyKey: `rsvp_cancel_refund_${rsvpId}`,
          eventId,
          rsvpId,
        });
        balance = credit.balance;
      }

      t.update(rsvpRef, {
        status: "CANCELLED",
        waitlistPosition: null,
        updatedAt: Timestamp.now(),
        cancelledAt: FieldValue.serverTimestamp(),
      });

      if (rsvp.status === "CONFIRMED") {
        t.update(eventRef, {
          confirmedCount: Math.max(0, (eventData.confirmedCount || 0) - 1),
        });
      } else {
        t.update(eventRef, {
          waitlistCount: Math.max(0, (eventData.waitlistCount || 0) - 1),
        });
      }

      return { wasConfirmed: rsvp.status === "CONFIRMED", title: String(eventData.title || "") };
    });

    let promotedUser: { email?: string; name: string } | null = null;
    if (promoted.wasConfirmed) {
      const waitSnap = await adminDb.collection("event_rsvps").where("eventId", "==", eventId).get();
      const waitlisted = waitSnap.docs
        .map((d) => {
          const data = d.data() as {
            status?: string;
            waitlistPosition?: number | null;
            userId?: string;
          };
          return { id: d.id, ...data };
        })
        .filter((d) => d.status === "WAITLISTED")
        .sort(
          (a, b) =>
            (typeof a.waitlistPosition === "number" ? a.waitlistPosition : 9999) -
            (typeof b.waitlistPosition === "number" ? b.waitlistPosition : 9999)
        );
      const next = waitlisted[0];
      if (next) {
        await adminDb.runTransaction(async (t) => {
          const eventRef = adminDb.collection("events").doc(eventId);
          const nextRef = adminDb.collection("event_rsvps").doc(next.id);
          const eventDoc = await t.get(eventRef);
          const nextDoc = await t.get(nextRef);
          if (!nextDoc.exists || nextDoc.data()?.status !== "WAITLISTED") return;
          t.update(nextRef, {
            status: "CONFIRMED",
            waitlistPosition: null,
            updatedAt: Timestamp.now(),
          });
          const ev = eventDoc.data() ?? {};
          t.update(eventRef, {
            confirmedCount: (ev.confirmedCount || 0) + 1,
            waitlistCount: Math.max(0, (ev.waitlistCount || 0) - 1),
          });
        });
        const rest = waitlisted.slice(1);
        let pos = 1;
        for (const row of rest) {
          await adminDb.collection("event_rsvps").doc(row.id).update({ waitlistPosition: pos });
          pos += 1;
        }
        const uid = String(next.userId || "");
        if (uid) {
          const u = await adminDb.collection("users").doc(uid).get();
          const ud = u.data() ?? {};
          promotedUser = {
            email: typeof ud.email === "string" ? ud.email : undefined,
            name: memberName(ud as Record<string, unknown>),
          };
        }
      }
    }

    if (promotedUser?.email) {
      const start = toDate(event.startTime);
      notifyWaitlistPromoted({
        to: promotedUser.email,
        name: promotedUser.name,
        eventTitle: promoted.title,
        startLabel: start
          ? start.toLocaleString("en-US", { timeZone: "America/Chicago" })
          : "",
      }).catch((e) => console.error("promote email", e));
    }

    return NextResponse.json({ ok: true, promoted: Boolean(promotedUser) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "NOT_FOUND") {
      return NextResponse.json({ error: "RSVP not found" }, { status: 404 });
    }
    console.error("DELETE RSVP", error);
    return NextResponse.json({ error: message || "Failed to cancel" }, { status: 500 });
  }
}
