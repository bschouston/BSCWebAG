"use client";

import Image from "next/image";
import Link from "next/link";
import { Image as ImageIcon } from "lucide-react";
import { WeeklyEventRsvpConfirmedMark } from "@/components/events/weekly-event-rsvp-confirmed-mark";
import { WeeklyEventJumpNav } from "@/components/events/weekly-event-jump-nav";
import { useAuth } from "@/lib/auth-context";
import { loginHref } from "@/lib/auth/return-url";
import { weeklyTokenHoldAmounts } from "@/lib/weekly-tokens";
import { WeeklyTokenHoldExplainer } from "@/components/member/weekly-token-hold-explainer";
import { WeeklyEventTeamsShowcase } from "@/components/events/weekly-event-teams-showcase";
import {
  WeeklyEventRsvpActions,
  useWeeklyEventRsvp,
} from "@/components/member/weekly-event-rsvp-card";
import { WeeklyEventWhenWhere } from "@/components/events/weekly-event-when-where";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  needsWeeklyRsvpAutoScroll,
  useSectionHashScroll,
} from "@/hooks/use-section-hash-scroll";

export type WeeklyPublicEventData = {
  id: string;
  slug?: string | null;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  status?: string | null;
  startTimeIso: string | null;
  endTimeIso: string | null;
  dateLabel: string;
  timeLabel: string;
  locationId?: string | null;
  addressUrl?: string | null;
  sportId?: string | null;
  tokensMin?: number | null;
  tokensMax?: number | null;
  minCapacity?: number | null;
  capacity?: number | null;
  confirmedCount?: number | null;
  waitlistCount?: number | null;
  rsvpOpensAt?: string | null;
  rsvpClosesAt?: string | null;
  rsvpCancelClosesAt?: string | null;
  rsvpManualOverride?: "open" | "closed" | null;
  rsvpCancelManualOverride?: "open" | "closed" | null;
  teamsEnabled?: boolean | null;
  genderPolicy?: string | null;
};

export function WeeklyPublicEventPage({ event }: { event: WeeklyPublicEventData }) {
  const { user, profile, loading: authLoading } = useAuth();
  const loginReturn = event.slug
    ? `/events/${event.slug}#rsvp`
    : `/member/events/${event.id}#rsvp`;
  const {
    myRsvp,
    rsvpLoading,
    rsvpReady,
    holdChangedNote,
    fill,
    handleRSVP,
    handleAuthorizeIncrease,
    handleCancel,
  } = useWeeklyEventRsvp(event.id, loginReturn, {
    confirmedCount: event.confirmedCount,
    waitlistCount: event.waitlistCount,
    capacity: event.capacity,
  });
  const tokenHold = weeklyTokenHoldAmounts(event);
  const loginUrl = loginHref(loginReturn);
  const showTeams = Boolean(event.teamsEnabled);
  const isAdmin = profile?.role === "ADMIN" || profile?.role === "SUPER_ADMIN";

  const scrollReady = !authLoading && rsvpReady;
  const allowRsvpScroll = !user || needsWeeklyRsvpAutoScroll(myRsvp);
  useSectionHashScroll({ ready: scrollReady, allowRsvpScroll });

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="relative w-full overflow-hidden bg-background">
        {event.imageUrl ? (
          <div className="relative mx-auto h-[42vh] min-h-[280px] w-full max-h-[520px] md:h-[48vh] md:min-h-[340px] md:max-h-[560px]">
            <Image
              src={event.imageUrl}
              alt={event.title}
              fill
              className="object-cover object-center"
              sizes="100vw"
              priority
            />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-b from-transparent via-background/40 to-background"
              aria-hidden
            />
          </div>
        ) : (
          <div className="relative flex h-[36vh] min-h-[240px] w-full max-h-[440px] items-center justify-center bg-zinc-900 md:min-h-[300px]">
            <ImageIcon size={48} className="opacity-20 text-white" />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-b from-transparent via-background/40 to-background"
              aria-hidden
            />
          </div>
        )}
      </div>

      <div className="container mx-auto max-w-4xl space-y-10 px-4 pb-10 pt-4 md:pt-6">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge className="rounded-sm border-transparent bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540]">
              Weekly Sports
            </Badge>
            {event.sportId ? (
              <Badge variant="outline" className="rounded-sm uppercase tracking-wider">
                {event.sportId}
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <h1 className="min-w-0 flex-1 text-3xl font-bold tracking-tight text-foreground md:text-5xl">
              {event.title}
            </h1>
            {myRsvp?.status === "CONFIRMED" ? <WeeklyEventRsvpConfirmedMark /> : null}
          </div>
          <div className="mz-rule" />
          <WeeklyEventJumpNav
            showTeams={showTeams}
            showDescription={Boolean(event.description)}
            extra={
              isAdmin ? (
                <Link href={`/admin/events/${event.id}/manage`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-[2.125rem] shrink-0 rounded-full border-red-600 bg-transparent px-4 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-400 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                >
                  Manage
                </Button>
                </Link>
              ) : null
            }
          />
        </div>

        <WeeklyEventWhenWhere
          dateLabel={event.dateLabel}
          timeLabel={event.timeLabel}
          locationId={event.locationId}
          addressUrl={event.addressUrl}
          confirmedCount={fill.confirmedCount}
          waitlistCount={fill.waitlistCount}
          capacity={fill.capacity}
          rsvpOpensAt={event.rsvpOpensAt}
          rsvpClosesAt={event.rsvpClosesAt}
          rsvpCancelClosesAt={event.rsvpCancelClosesAt}
          rsvpManualOverride={event.rsvpManualOverride ?? null}
          status={event.status}
        />

        {event.description ? (
          <section id="description" className="scroll-mt-28">
            <Card className="overflow-hidden border bg-card">
              <CardContent className="space-y-4 p-6 md:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a6d00] dark:text-[#ffd700]">
                  Description
                </p>
                <div className="max-w-none whitespace-pre-wrap text-base leading-relaxed text-foreground/90 md:text-lg">
                  {event.description}
                </div>
              </CardContent>
            </Card>
          </section>
        ) : null}

        {showTeams ? (
          <WeeklyEventTeamsShowcase
            eventId={event.id}
            allowJoin={Boolean(user) && myRsvp?.status === "CONFIRMED"}
            rsvpStatus={myRsvp?.status ?? null}
          />
        ) : null}

        <section id="rsvp" className="scroll-mt-28">
          <Card className="overflow-hidden border bg-card">
            <CardContent className="flex flex-col gap-6 p-6 md:p-8">
              <div className="w-full space-y-4">
                <div className="text-center md:text-left">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a6d00] dark:text-[#ffd700]">
                    Token hold
                  </p>
                  <h2 className="mt-1 text-3xl font-black tracking-tight text-[#1a3556] dark:text-white md:text-5xl">
                    RSVP
                  </h2>
                  <p className="mt-3 text-3xl font-extrabold text-[#1a3556] dark:text-white">
                    {tokenHold.hold}{" "}
                    <span className="text-lg font-medium text-muted-foreground dark:text-white/80">
                      tokens held
                    </span>
                  </p>
                  {tokenHold.hasRange ? (
                    <p className="mt-1 text-sm text-muted-foreground dark:text-white/80">
                      Final charge may be as low as{" "}
                      <strong className="text-foreground dark:text-white">{tokenHold.leastCharge}</strong> if
                      turnout is strong.
                    </p>
                  ) : null}
                </div>
                <WeeklyTokenHoldExplainer
                  event={{
                    tokensMin: event.tokensMin ?? null,
                    tokensMax: event.tokensMax ?? null,
                    minCapacity: event.minCapacity ?? null,
                    capacity: event.capacity ?? 1,
                  }}
                />
              </div>

              <div className="w-full border-t pt-6">
                {authLoading ? (
                  <p className="text-sm text-muted-foreground">Checking sign-in…</p>
                ) : user ? (
                  <WeeklyEventRsvpActions
                    event={{
                      id: event.id,
                      status: event.status,
                      rsvpOpensAt: event.rsvpOpensAt,
                      rsvpClosesAt: event.rsvpClosesAt,
                      rsvpCancelClosesAt: event.rsvpCancelClosesAt,
                      rsvpManualOverride: event.rsvpManualOverride ?? null,
                      rsvpCancelManualOverride: event.rsvpCancelManualOverride ?? null,
                      tokensMin: event.tokensMin,
                      tokensMax: event.tokensMax,
                      minCapacity: event.minCapacity,
                      capacity: event.capacity,
                      confirmedCount: event.confirmedCount,
                      waitlistCount: event.waitlistCount,
                      startTime: event.startTimeIso,
                      genderPolicy: event.genderPolicy,
                    }}
                    myRsvp={myRsvp}
                    rsvpLoading={rsvpLoading}
                    holdChangedNote={holdChangedNote}
                    onRsvp={handleRSVP}
                    onAuthorizeIncrease={handleAuthorizeIncrease}
                    onCancel={handleCancel}
                  />
                ) : (
                  <p className="w-full text-center text-sm text-muted-foreground md:text-right">
                    <Link href={loginUrl} className="font-medium text-primary hover:underline">
                      Sign in
                    </Link>{" "}
                    to RSVP.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
