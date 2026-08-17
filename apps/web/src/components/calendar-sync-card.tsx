"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { appleSubscribeUrl, googleSubscribeUrl } from "@/lib/calendar-urls";

type FeedLinks = {
  icsUrl: string;
  googleUrl: string;
  appleUrl: string;
};

function clubLinksFromOrigin(): FeedLinks {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const icsUrl = `${origin}/api/calendar/club.ics`;
  return {
    icsUrl,
    googleUrl: googleSubscribeUrl(icsUrl),
    appleUrl: appleSubscribeUrl(icsUrl),
  };
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function FeedButtons({
  label,
  links,
  onReset,
  resetting,
}: {
  label: string;
  links: FeedLinks | null;
  onReset?: () => void;
  resetting?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{label}</p>
      <div className="flex flex-wrap gap-2">
        {links ? (
          <>
            <Button asChild size="sm">
              <a href={links.googleUrl} target="_blank" rel="noopener noreferrer">
                Google Calendar
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={links.appleUrl}>Apple Calendar</a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const ok = await copyText(links.icsUrl);
                if (ok) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {onReset ? (
          <Button size="sm" variant="ghost" disabled={resetting} onClick={onReset}>
            {resetting ? "Resetting…" : "Reset link"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function CalendarSyncCard({ showPersonal = true }: { showPersonal?: boolean }) {
  const { user } = useAuth();
  const [club, setClub] = useState<FeedLinks | null>(null);
  const [mine, setMine] = useState<FeedLinks | null>(null);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setClub(clubLinksFromOrigin());
  }, []);

  useEffect(() => {
    async function load() {
      if (!showPersonal || !user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/member/calendar-feed", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load calendar feed");
        setMine(data.myEvents);
        if (data.club) setClub(data.club);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load calendar feed");
      }
    }
    void load();
  }, [showPersonal, user]);

  const resetMine = async () => {
    if (!user) return;
    if (!confirm("Reset your personal calendar link? Google and Apple will need to be re-subscribed.")) return;
    setResetting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/member/calendar-feed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rotate: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not reset");
      setMine(data.myEvents);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset");
    } finally {
      setResetting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sync calendars</CardTitle>
        <CardDescription>
          Subscribe in Google or Apple Calendar. Feeds refresh on their own (often within a few hours).
          {showPersonal
            ? " Waitlisted RSVPs stay on your calendar as tentative until you are promoted or cancel."
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {showPersonal ? (
          <FeedButtons label="My RSVPs" links={mine} onReset={() => void resetMine()} resetting={resetting} />
        ) : null}
        <FeedButtons label="All club events" links={club} />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
