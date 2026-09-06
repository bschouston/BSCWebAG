"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RsvpTokenActions } from "@/components/member/rsvp-token-actions";
import { weeklyRsvpWindow } from "@/lib/rsvp-window";
import { weeklyOccurrenceStarted } from "@/lib/weekly-rsvp";
import { weeklyTokenHoldAmounts } from "@/lib/weekly-tokens";
import { loginHref } from "@/lib/auth/return-url";

export type WeeklyRsvpRow = {
  status: string;
  waitlistPosition: number | null;
  tokensHeld?: number | null;
  pendingTokenIncreaseTo?: number | null;
};

export type WeeklyRsvpEventFields = {
  id: string;
  status?: string | null;
  rsvpOpensAt?: unknown;
  rsvpClosesAt?: unknown;
  rsvpManualOverride?: "open" | "closed" | null;
  tokensMin?: number | null;
  tokensMax?: number | null;
  tokensRequired?: number | null;
  minCapacity?: number | null;
  capacity?: number | null;
  startTime?: unknown;
};

export function useWeeklyEventRsvp(eventId: string, loginReturnPath?: string) {
  const { user } = useAuth();
  const router = useRouter();
  const [myRsvp, setMyRsvp] = useState<WeeklyRsvpRow | null>(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [rsvpReady, setRsvpReady] = useState(false);
  const [holdChangedNote, setHoldChangedNote] = useState<string | null>(null);

  const loadRsvp = useCallback(async () => {
    setRsvpReady(false);
    try {
      if (!user) {
        setMyRsvp(null);
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/member/rsvps", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const row = (data.rsvps || []).find(
        (r: { eventId?: string; status?: string }) =>
          r.eventId === eventId && (r.status === "CONFIRMED" || r.status === "WAITLISTED")
      );
      if (row) {
        setMyRsvp({
          status: row.status,
          waitlistPosition: row.waitlistPosition ?? null,
          tokensHeld: row.tokensHeld ?? null,
          pendingTokenIncreaseTo: row.pendingTokenIncreaseTo ?? null,
        });
      } else {
        setMyRsvp(null);
      }
    } finally {
      setRsvpReady(true);
    }
  }, [eventId, user]);

  useEffect(() => {
    void loadRsvp();
  }, [loadRsvp]);

  const returnTo = loginReturnPath || `/member/events/${eventId}#rsvp`;

  const handleRSVP = async (
    purchase?: { mode: "unit"; tokenCount: number } | { mode: "package"; packageId: string }
  ): Promise<boolean> => {
    if (!user) {
      router.push(loginHref(returnTo));
      return false;
    }
    setRsvpLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/member/rsvps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ eventId, ...(purchase ? { purchase } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "CARD_REQUIRED") {
          alert(data.error + "\n\nOpening My Wallet to add a card…");
          router.push("/member/wallet");
          return false;
        }
        if (data.code === "TOKEN_REQUEST_PENDING") {
          alert(data.error || "Pay the Super Admin token request in My Wallet first.");
          router.push("/member/wallet");
          return false;
        }
        if (data.code === "INSUFFICIENT_TOKENS") return false;
        alert(data.error || "Failed to RSVP");
        return false;
      }
      const held = data.tokensHeld;
      if (held) {
        alert(
          `RSVP Successful (${data.status}). Up to ${held} tokens held; final amount is set after the event.`
        );
      } else {
        alert(`RSVP Successful (${data.status})!`);
      }
      setMyRsvp({
        status: data.status,
        waitlistPosition: data.waitlistPosition ?? null,
        tokensHeld: data.tokensHeld ?? null,
        pendingTokenIncreaseTo: null,
      });
      return true;
    } catch (error) {
      console.error("RSVP error", error);
      alert("An error occurred");
      return false;
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleAuthorizeIncrease = async (
    purchase?: { mode: "unit"; tokenCount: number } | { mode: "package"; packageId: string }
  ): Promise<boolean> => {
    if (!user) return false;
    setRsvpLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/member/rsvps/authorize-increase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          eventId,
          expectedPendingTo: myRsvp?.pendingTokenIncreaseTo ?? 0,
          ...(purchase ? { purchase } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "INSUFFICIENT_TOKENS") return false;
        if (data.code === "TOKEN_REQUEST_PENDING") {
          alert(data.error || "Pay the Super Admin token request in My Wallet first.");
          router.push("/member/wallet");
          return false;
        }
        if (data.code === "HOLD_CHANGED") {
          setHoldChangedNote(
            typeof data.error === "string"
              ? data.error
              : "The token hold changed. Review the updated amount to authorize."
          );
          await loadRsvp();
          return false;
        }
        alert(data.error || "Could not authorize");
        return false;
      }
      setHoldChangedNote(null);
      setMyRsvp((prev) =>
        prev
          ? {
              ...prev,
              tokensHeld: data.tokensHeld ?? prev.pendingTokenIncreaseTo,
              pendingTokenIncreaseTo: null,
            }
          : prev
      );
      alert("Extra token hold authorized.");
      return true;
    } catch (error) {
      console.error(error);
      alert("An error occurred");
      return false;
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!user) return;
    if (!confirm("Cancel this RSVP? Tokens held will be refunded if RSVP is still open.")) return;
    setRsvpLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/member/rsvps", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Could not cancel");
        return;
      }
      setMyRsvp(null);
    } catch (error) {
      console.error(error);
      alert("An error occurred");
    } finally {
      setRsvpLoading(false);
    }
  };

  return {
    user,
    myRsvp,
    rsvpLoading,
    rsvpReady,
    holdChangedNote,
    handleRSVP,
    handleAuthorizeIncrease,
    handleCancel,
  };
}

export function WeeklyEventRsvpActions({
  event,
  myRsvp,
  rsvpLoading,
  holdChangedNote,
  onRsvp,
  onAuthorizeIncrease,
  onCancel,
}: {
  event: WeeklyRsvpEventFields;
  myRsvp: WeeklyRsvpRow | null;
  rsvpLoading: boolean;
  holdChangedNote: string | null;
  onRsvp: (
    purchase?: { mode: "unit"; tokenCount: number } | { mode: "package"; packageId: string }
  ) => Promise<boolean>;
  onAuthorizeIncrease: (
    purchase?: { mode: "unit"; tokenCount: number } | { mode: "package"; packageId: string }
  ) => Promise<boolean>;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const windowState = weeklyRsvpWindow({
    category: "WEEKLY_SPORTS",
    status: event.status,
    rsvpOpensAt: event.rsvpOpensAt,
    rsvpClosesAt: event.rsvpClosesAt,
    rsvpManualOverride: event.rsvpManualOverride ?? null,
  });
  const extraHold = Math.max(
    0,
    Number(myRsvp?.pendingTokenIncreaseTo || 0) - Number(myRsvp?.tokensHeld || 0)
  );
  const pendingAuth = extraHold > 0 && !weeklyOccurrenceStarted(event);
  const canCancelWeekly = windowState !== "closed" || pendingAuth;
  const rsvpDisabled = rsvpLoading || windowState === "before" || windowState === "closed";
  const tokenHold = weeklyTokenHoldAmounts(event);

  if (myRsvp) {
    return (
      <div className="flex w-full flex-col gap-3 md:ml-auto md:max-w-md">
        {holdChangedNote ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
            {holdChangedNote}
          </div>
        ) : null}
        {pendingAuth ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="font-semibold">Action required: extra token hold</p>
            <p className="mt-1">
              The hold increased to {myRsvp.pendingTokenIncreaseTo} tokens (you currently have{" "}
              {myRsvp.tokensHeld ?? 0} held). Authorize the extra {extraHold} even if your wallet
              already covers it. If you do not authorize before the event starts, your RSVP will
              be cancelled and the original hold refunded.
            </p>
          </div>
        ) : null}
        <Badge className="justify-center border-transparent bg-[color:var(--mz-teal)] py-3 text-sm font-bold text-white shadow-sm">
          Already RSVP’d —{" "}
          {myRsvp.status === "WAITLISTED"
            ? `Waitlisted${myRsvp.waitlistPosition ? ` #${myRsvp.waitlistPosition}` : ""}`
            : "Confirmed"}
        </Badge>
        {pendingAuth ? (
          <RsvpTokenActions
            key={`auth-${myRsvp.pendingTokenIncreaseTo ?? 0}-${extraHold}`}
            eventId={event.id}
            tokensNeeded={extraHold}
            rsvpDisabled={rsvpLoading}
            rsvpLoading={rsvpLoading}
            onRsvp={onAuthorizeIncrease}
            getAuthToken={async () => user?.getIdToken()}
            submitLabel={`Authorize extra ${extraHold} token${extraHold === 1 ? "" : "s"}`}
            ignoreAutoReplenish
          />
        ) : null}
        {canCancelWeekly ? (
          <Button
            variant="outline"
            className="h-12 w-full border-2 border-[color:var(--mz-coral)] bg-card font-semibold text-[color:var(--mz-coral)] hover:bg-[color:color-mix(in_srgb,var(--mz-coral)_12%,var(--card))] hover:text-[color:var(--mz-coral)] disabled:bg-muted disabled:text-foreground disabled:opacity-100 dark:border-[#ff8a7a] dark:text-[#ff8a7a] dark:hover:bg-[color:color-mix(in_srgb,#ff8a7a_15%,transparent)]"
            disabled={rsvpLoading}
            onClick={() => void onCancel()}
          >
            {rsvpLoading ? "Cancelling…" : "Cancel RSVP"}
          </Button>
        ) : (
          <p className="text-center text-xs text-muted-foreground dark:text-white/80">
            RSVP is closed. Contact an admin to cancel.
          </p>
        )}
      </div>
    );
  }

  return (
    <RsvpTokenActions
      eventId={event.id}
      tokensNeeded={tokenHold.hold}
      rsvpDisabled={rsvpDisabled}
      rsvpLoading={rsvpLoading}
      onRsvp={onRsvp}
      getAuthToken={async () => user?.getIdToken()}
    />
  );
}
