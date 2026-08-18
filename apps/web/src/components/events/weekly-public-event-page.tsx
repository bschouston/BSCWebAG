"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, Clock, MapPin, ExternalLink, Loader2, Image as ImageIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { loginHref } from "@/lib/auth/return-url";
import { weeklyRsvpWindow } from "@/lib/rsvp-window";
import { weeklyTokenHoldAmounts } from "@/lib/weekly-tokens";
import { WeeklyTokenHoldExplainer } from "@/components/member/weekly-token-hold-explainer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type WeeklyPublicEventData = {
  id: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  startTimeIso: string | null;
  endTimeIso: string | null;
  dateLabel: string;
  timeLabel: string;
  locationId?: string | null;
  addressUrl?: string | null;
  sportId?: string | null;
  tokensMin?: number | null;
  tokensMax?: number | null;
  tokensRequired?: number | null;
  minCapacity?: number | null;
  capacity?: number | null;
  rsvpOpensAt?: string | null;
  rsvpClosesAt?: string | null;
  rsvpManualOverride?: "open" | "closed" | null;
};

export function WeeklyPublicEventPage({ event }: { event: WeeklyPublicEventData }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      router.replace(`/member/events/${event.id}`);
    }
  }, [authLoading, user, event.id, router]);

  if (authLoading || user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const windowState = weeklyRsvpWindow({
    category: "WEEKLY_SPORTS",
    rsvpOpensAt: event.rsvpOpensAt,
    rsvpClosesAt: event.rsvpClosesAt,
    rsvpManualOverride: event.rsvpManualOverride ?? null,
  });

  let rsvpLabel = "RSVP Now / Claim Spot";
  if (windowState === "before") rsvpLabel = "RSVP not open yet";
  if (windowState === "closed") rsvpLabel = "RSVP closed";
  const rsvpDisabled = windowState === "before" || windowState === "closed";
  const tokenHold = weeklyTokenHoldAmounts(event);
  const loginUrl = loginHref(`/member/events/${event.id}`);

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
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-5xl">{event.title}</h1>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="rounded-xl border bg-card shadow-none">
            <CardContent className="flex items-start gap-3 p-4">
              <Calendar className="mt-0.5 h-5 w-5 text-[#1a3556] dark:text-[#ffd700]" />
              <div>
                <p className="text-sm font-semibold text-foreground">Date</p>
                <p className="text-sm text-muted-foreground">{event.dateLabel}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border bg-card shadow-none">
            <CardContent className="flex items-start gap-3 p-4">
              <Clock className="mt-0.5 h-5 w-5 text-[#8a6d00] dark:text-[#ffd700]" />
              <div>
                <p className="text-sm font-semibold text-foreground">Time</p>
                <p className="text-sm text-muted-foreground">{event.timeLabel}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border bg-card shadow-none">
            <CardContent className="flex items-start gap-3 p-4">
              <MapPin className="mt-0.5 h-5 w-5 text-[#1a3556] dark:text-[#ffd700]" />
              <div>
                <p className="text-sm font-semibold text-foreground">Location</p>
                <p className="mb-1 line-clamp-1 text-sm text-muted-foreground">
                  {event.locationId || "TBA"}
                </p>
                {event.addressUrl ? (
                  <a
                    href={event.addressUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center text-xs font-medium text-primary hover:underline"
                  >
                    Open in Maps <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        {event.description ? (
          <div className="max-w-none whitespace-pre-wrap text-base leading-relaxed text-foreground/90 md:text-lg">
            {event.description}
          </div>
        ) : null}

        <Card className="overflow-hidden border bg-card">
          <CardContent className="flex flex-col gap-6 p-6 md:p-8">
            <div className="w-full space-y-4">
              <div className="text-center md:text-left">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#8a6d00] dark:text-[#ffd700]">
                  Token hold at RSVP
                </p>
                <p className="text-3xl font-extrabold text-[#1a3556] dark:text-white">
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
                  tokensRequired: event.tokensRequired ?? 0,
                  minCapacity: event.minCapacity ?? null,
                  capacity: event.capacity ?? 1,
                }}
              />
            </div>

            <div className="w-full border-t pt-6 md:flex md:justify-end">
              {rsvpDisabled ? (
                <Button
                  className="h-14 w-full bg-[#1a3556] text-lg font-semibold text-white disabled:bg-muted disabled:text-foreground disabled:opacity-100 md:w-64 dark:bg-[#ffd700] dark:text-[#122540]"
                  size="lg"
                  disabled
                >
                  {rsvpLabel}
                </Button>
              ) : (
                <Button
                  className="h-14 w-full bg-[#1a3556] text-lg font-semibold text-white hover:bg-[#122540] md:w-64 dark:bg-[#ffd700] dark:text-[#122540] dark:hover:bg-white"
                  size="lg"
                  asChild
                >
                  <Link href={loginUrl}>{rsvpLabel}</Link>
                </Button>
              )}
            </div>
            <p className="text-center text-sm text-muted-foreground md:text-right">
              Sign in to RSVP and hold tokens from your wallet.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
