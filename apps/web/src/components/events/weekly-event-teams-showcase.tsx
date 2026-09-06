"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  teamCardBackground,
  teamContrastMuted,
  teamContrastText,
  type WeeklyTeamsPublicResponse,
} from "@/lib/weekly-team-colors";

export function WeeklyEventTeamsShowcase({
  eventId,
  allowJoin,
  rsvpStatus,
}: {
  eventId: string;
  allowJoin?: boolean;
  rsvpStatus?: string | null;
}) {
  const { user } = useAuth();
  const [data, setData] = useState<WeeklyTeamsPublicResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/events/${eventId}/teams`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load teams");
      setData(body as WeeklyTeamsPublicResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load teams");
    } finally {
      setLoading(false);
    }
  }, [eventId, user, rsvpStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const join = async (teamId: string | null) => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/member/rsvps/team", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ eventId, teamId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not update team");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update team");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) {
    return (
      <section id="teams" className="scroll-mt-28" aria-busy="true">
        <Card className="overflow-hidden">
          <CardContent className="p-6 md:p-8">
            <p className="text-sm text-muted-foreground">Loading teams…</p>
          </CardContent>
        </Card>
      </section>
    );
  }
  if (!data?.enabled || data.teams.length === 0) return null;

  const canJoin = Boolean(allowJoin && data.canJoin && !data.locked);

  return (
    <section id="teams" className="scroll-mt-28">
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-6 p-6 md:p-8">
          <div className="text-center md:text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a6d00] dark:text-[#ffd700]">
              Pick a side
            </p>
            <h2 className="mt-1 text-3xl font-black tracking-tight text-[#1a3556] dark:text-white md:text-5xl">
              Teams
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Live roster — join, switch, or stay unassigned. Optional.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {data.teams.map((team) => {
              const text = teamContrastText(team.color);
              const muted = teamContrastMuted(team.color);
              const mine = data.myTeamId === team.id;

              return (
                <article
                  key={team.id}
                  className="relative overflow-hidden rounded-2xl border shadow-lg"
                  style={{
                    background: teamCardBackground(team.color),
                    boxShadow: `0 18px 40px -18px ${team.color}aa`,
                  }}
                >
                  <div
                    className="pointer-events-none absolute inset-0 opacity-[0.14]"
                    style={{
                      background: `repeating-linear-gradient(
                    -42deg,
                    ${text}00 0px,
                    ${text}00 10px,
                    ${text}55 10px,
                    ${text}55 12px
                  )`,
                    }}
                    aria-hidden
                  />
                  <div
                    className="pointer-events-none absolute right-0 top-0 h-full w-[45%]"
                    style={{
                      background: `linear-gradient(118deg, transparent 35%, ${text}28 35%, ${text}18 55%, transparent 85%)`,
                      clipPath: "polygon(100% 0, 100% 100%, 0 0)",
                    }}
                    aria-hidden
                  />
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-1"
                    style={{ background: `linear-gradient(90deg, transparent, ${text}88, transparent)` }}
                    aria-hidden
                  />

                  <div className="relative space-y-4 p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <h3
                        className="text-2xl font-black uppercase tracking-wide sm:text-3xl"
                        style={{ color: text }}
                      >
                        {team.name}
                      </h3>
                      <span
                        className="rounded-full px-3 py-1 text-sm font-bold tabular-nums"
                        style={{ backgroundColor: `${text}22`, color: text }}
                      >
                        {team.members.length}
                      </span>
                    </div>

                    <ul className="space-y-2">
                      {team.members.length === 0 ? (
                        <li className="text-base sm:text-lg" style={{ color: muted }}>
                          No one yet — first pick is yours
                        </li>
                      ) : (
                        team.members.map((m) => (
                          <li
                            key={m.userId}
                            className="rounded-xl px-3 py-2.5 text-lg font-bold tracking-tight sm:text-xl"
                            style={{
                              backgroundColor: `${text}18`,
                              color: text,
                              boxShadow: `inset 0 1px 0 ${text}22`,
                            }}
                          >
                            {m.name}
                          </li>
                        ))
                      )}
                    </ul>

                    {canJoin ? (
                      mine ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          className="w-full border-0 bg-white/90 font-semibold text-[#122540] hover:bg-white disabled:bg-muted disabled:text-foreground disabled:opacity-100"
                          onClick={() => void join(null)}
                        >
                          Leave team
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          disabled={busy}
                          className="w-full font-bold disabled:bg-muted disabled:text-foreground disabled:opacity-100"
                          style={{ backgroundColor: text, color: team.color }}
                          onClick={() => void join(team.id)}
                        >
                          {data.myTeamId ? `Switch to ${team.name}` : `Join ${team.name}`}
                        </Button>
                      )
                    ) : null}
                    {mine && !canJoin ? (
                      <p className="text-base font-semibold sm:text-lg" style={{ color: text }}>
                        You’re on this team
                      </p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          {data.unassigned.length > 0 ? (
            <div className="rounded-xl border bg-muted/40 p-4 sm:p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#8a6d00] dark:text-[#ffd700]">
                Free agents
              </p>
              <ul className="space-y-2">
                {data.unassigned.map((m) => (
                  <li
                    key={m.userId}
                    className="rounded-xl border bg-card px-3 py-2.5 text-lg font-bold text-[#1a3556] dark:text-foreground sm:text-xl"
                  >
                    {m.name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.locked ? (
            <p className="text-center text-sm font-medium text-[#8a6d00] dark:text-[#ffd700]">
              Teams are locked
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    </section>
  );
}
