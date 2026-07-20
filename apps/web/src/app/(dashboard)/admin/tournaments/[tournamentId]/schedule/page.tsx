"use client";

import { useEffect, useMemo, useState, use } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DEFAULT_PUBLIC_TABS,
  PUBLIC_TOURNAMENT_TAB_IDS,
  PUBLIC_TOURNAMENT_TAB_LABELS,
  type PublicTournamentTabId,
} from "@/lib/public-tournament-tabs";
import { ColorBadge } from "@/components/ui/color-badge";

type TeamRow = {
  id: string;
  name: string;
  color?: string | null;
  divisionId?: string | null;
};
type DivisionRow = { id: string; name: string; color?: string | null };
type MatchRow = {
  id: string;
  teamAId: string;
  teamBId: string;
  status: string;
  scoreA?: number;
  scoreB?: number;
  playSeq?: number;
  currentSet?: number;
  setScores?: { a: number; b: number }[];
  scheduledAt?: { _seconds?: number; seconds?: number } | null;
  courtNumber?: number;
  pairingType?: "DIVISION" | "CROSS";
  divisionId?: string | null;
  slotIndex?: number;
};

type ActiveLock = {
  matchId: string;
  teamKey: "A" | "B";
  ownerName: string;
};

type ScheduleConfigForm = {
  numberOfCourts: string;
  timePerMatchMinutes: string;
  scheduleDate: string;
  startTime: string;
  lunchStart: string;
  lunchEnd: string;
  gamesPerTeam: string;
};

type PreviewMatch = {
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  divisionId: string | null;
  divisionName: string;
  pairingType: "DIVISION" | "CROSS";
  courtNumber: number;
  slotIndex: number;
  scheduledAt: string;
};

type PreviewPayload = {
  matches: PreviewMatch[];
  diagnostics: {
    totalMatches: number;
    totalSlots: number;
    endTimeIso: string;
    avoidablePartialRounds: number;
    avoidableWaste: number;
    gamesPerTeam: Record<string, number>;
  };
  replaceableMatchCount?: number;
};

const DEFAULT_CONFIG: ScheduleConfigForm = {
  numberOfCourts: "3",
  timePerMatchMinutes: "25",
  scheduleDate: "",
  startTime: "09:00",
  lunchStart: "12:30",
  lunchEnd: "13:30",
  gamesPerTeam: "4",
};

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function matchSeconds(m: MatchRow): number | null {
  const s = m.scheduledAt?.seconds ?? m.scheduledAt?._seconds;
  return typeof s === "number" ? s : null;
}

export default function SchedulePage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = use(params);
  const { user } = useAuth();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [locks, setLocks] = useState<ActiveLock[]>([]);
  const [iframeHtml, setIframeHtml] = useState<string>("");
  const [publicTabs, setPublicTabs] = useState<PublicTournamentTabId[]>([...DEFAULT_PUBLIC_TABS]);
  const [savingIframe, setSavingIframe] = useState(false);
  const [savingTabs, setSavingTabs] = useState(false);
  const [teamAId, setTeamAId] = useState<string>("");
  const [teamBId, setTeamBId] = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [config, setConfig] = useState<ScheduleConfigForm>({
    ...DEFAULT_CONFIG,
    scheduleDate: todayYmd(),
  });
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [generatorError, setGeneratorError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);

  const authHeaders = async (): Promise<Record<string, string>> => {
    const token = await user?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadLocks = async () => {
    if (!user) return;
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/tournaments/${tournamentId}/locks`, { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setLocks((data.locks ?? []) as ActiveLock[]);
    } catch {
      // ignore
    }
  };

  const load = async () => {
    setLoading(true);
    const headers = await authHeaders();
    const [teamsRes, divisionsRes, tRes] = await Promise.all([
      fetch(`/api/tournaments/${tournamentId}/teams`, { headers }),
      fetch(`/api/tournaments/${tournamentId}/divisions`, { headers }),
      fetch(`/api/tournaments/${tournamentId}`, { headers }),
    ]);
    const teamsData = await teamsRes.json();
    const divisionsData = await divisionsRes.json();
    setTeams(teamsData.teams ?? []);
    setDivisions(divisionsData.divisions ?? []);
    await loadLocks();

    try {
      if (tRes.ok) {
        const tData = await tRes.json();
        setIframeHtml(String(tData?.tournament?.publicIframeEmbedHtml ?? ""));
        const tabs = tData?.tournament?.publicTabs;
        if (Array.isArray(tabs) && tabs.length > 0) {
          const valid = tabs.filter((t: string) =>
            (PUBLIC_TOURNAMENT_TAB_IDS as readonly string[]).includes(t)
          );
          if (valid.length > 0) setPublicTabs(valid as PublicTournamentTabId[]);
        } else {
          setPublicTabs([...DEFAULT_PUBLIC_TABS]);
        }

        const saved = tData?.tournament?.roundRobinScheduleConfig;
        if (saved && typeof saved === "object") {
          setConfig((prev) => ({
            numberOfCourts: String(saved.numberOfCourts ?? prev.numberOfCourts),
            timePerMatchMinutes: String(
              saved.timePerMatchMinutes ?? prev.timePerMatchMinutes
            ),
            scheduleDate: String(saved.scheduleDate ?? prev.scheduleDate ?? todayYmd()),
            startTime: String(saved.startTime ?? prev.startTime),
            lunchStart: String(saved.lunchStart ?? prev.lunchStart),
            lunchEnd: String(saved.lunchEnd ?? prev.lunchEnd),
            gamesPerTeam: String(saved.gamesPerTeam ?? prev.gamesPerTeam),
          }));
        } else if (tData?.tournament?.startDate) {
          const start = String(tData.tournament.startDate).slice(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(start)) {
            setConfig((prev) => ({ ...prev, scheduleDate: start }));
          }
        }
      }
    } catch {
      // ignore
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user || !db) return;
    const q = query(
      collection(db, "tournaments", tournamentId, "matches"),
      orderBy("scheduledAt", "asc")
    );
    return onSnapshot(q, (snap) => {
      setMatches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as MatchRow[]);
    });
  }, [user, tournamentId]);

  const locksByMatch = useMemo(() => {
    const map = new Map<string, ActiveLock[]>();
    for (const lock of locks) {
      const list = map.get(lock.matchId) ?? [];
      list.push(lock);
      map.set(lock.matchId, list);
    }
    return map;
  }, [locks]);

  const divisionName = useMemo(
    () => Object.fromEntries(divisions.map((d) => [d.id, d.name])),
    [divisions]
  );

  const teamById = useMemo(
    () => new Map(teams.map((t) => [t.id, t])),
    [teams]
  );
  const divisionById = useMemo(
    () => new Map(divisions.map((d) => [d.id, d])),
    [divisions]
  );

  const savePublicSettings = async () => {
    setSavingIframe(true);
    setSavingTabs(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/tournaments/${tournamentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          publicIframeEmbedHtml: iframeHtml || null,
          publicTabs,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to save public page settings");
      }
      await load();
    } finally {
      setSavingIframe(false);
      setSavingTabs(false);
    }
  };

  const togglePublicTab = (tabId: PublicTournamentTabId, checked: boolean) => {
    setPublicTabs((prev) => {
      if (checked) {
        if (prev.includes(tabId)) return prev;
        return PUBLIC_TOURNAMENT_TAB_IDS.filter((id) => id === tabId || prev.includes(id));
      }
      const next = prev.filter((id) => id !== tabId);
      return next.length > 0 ? next : prev;
    });
  };

  const configPayload = () => ({
    numberOfCourts: Number(config.numberOfCourts),
    timePerMatchMinutes: Number(config.timePerMatchMinutes),
    scheduleDate: config.scheduleDate,
    startTime: config.startTime,
    lunchStart: config.lunchStart,
    lunchEnd: config.lunchEnd,
    gamesPerTeam: Number(config.gamesPerTeam),
  });

  const runGenerator = async (action: "preview" | "apply") => {
    setGeneratorError(null);
    if (action === "preview") setPreviewing(true);
    else setApplying(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/tournaments/${tournamentId}/schedule/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ action, config: configPayload() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Schedule generation failed");
      setPreview({
        matches: data.matches ?? [],
        diagnostics: data.diagnostics,
        replaceableMatchCount: data.replaceableMatchCount ?? data.matchesReplaced,
      });
      if (action === "apply") {
        window.alert(
          `Schedule applied: ${data.matchesCreated} matches created` +
            (data.matchesReplaced
              ? ` (replaced ${data.matchesReplaced} previous upcoming matches).`
              : ".")
        );
      }
    } catch (err) {
      setGeneratorError(err instanceof Error ? err.message : "Schedule generation failed");
      if (action === "preview") setPreview(null);
    } finally {
      setPreviewing(false);
      setApplying(false);
    }
  };

  const applyConfirmed = async () => {
    const replaceCount = preview?.replaceableMatchCount ?? matches.length;
    const message =
      replaceCount > 0
        ? `Replace ${replaceCount} existing upcoming match(es) with the generated round-robin schedule?`
        : "Create the generated round-robin schedule?";
    if (!window.confirm(message)) return;
    await runGenerator("apply");
  };

  const add = async () => {
    setSubmitting(true);
    const headers = await authHeaders();
    await fetch(`/api/tournaments/${tournamentId}/matches`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        teamAId,
        teamBId,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        status: "UPCOMING",
      }),
    });
    setTeamAId("");
    setTeamBId("");
    setScheduledAt("");
    await load();
    setSubmitting(false);
  };

  const removeMatch = async (match: MatchRow) => {
    const hasData = match.status !== "UPCOMING" || (match.playSeq ?? 0) > 0;
    const message = hasData
      ? "Delete this match and all recorded plays, set scores, and stats? Leaderboards and standings will be updated to reflect the remaining matches."
      : "Delete this scheduled match?";
    if (!window.confirm(message)) return;

    setDeletingId(match.id);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/tournaments/${tournamentId}/matches/${match.id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data?.error ?? "Failed to delete match");
      }
    } finally {
      setDeletingId(null);
    }
  };

  const forceReleaseLocks = async (matchId: string) => {
    if (!window.confirm("Force release tracker locks for this match?")) return;
    const headers = await authHeaders();
    const res = await fetch(
      `/api/tournaments/${tournamentId}/matches/${matchId}/release-locks`,
      { method: "POST", headers }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data?.error ?? "Failed to release locks");
    } else {
      await loadLocks();
      window.alert("Locks released.");
    }
  };

  const teamName = (teamId: string) => teams.find((t) => t.id === teamId)?.name ?? teamId;

  const previewBySlot = useMemo(() => {
    if (!preview) return [];
    const map = new Map<number, PreviewMatch[]>();
    for (const m of preview.matches) {
      const list = map.get(m.slotIndex) ?? [];
      list.push(m);
      map.set(m.slotIndex, list);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([slotIndex, slotMatches]) => ({
        slotIndex,
        time: slotMatches[0]?.scheduledAt,
        matches: slotMatches.sort((a, b) => a.courtNumber - b.courtNumber),
      }));
  }, [preview]);

  const setConfigField = (key: keyof ScheduleConfigForm, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setPreview(null);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Public tournament page</CardTitle>
          <CardDescription>
            Configure the public tournament page at{" "}
            <span className="font-mono text-xs">/tournament/{tournamentId}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Visible tabs</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {PUBLIC_TOURNAMENT_TAB_IDS.map((tabId) => (
                <label
                  key={tabId}
                  htmlFor={`tab-${tabId}`}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    id={`tab-${tabId}`}
                    checked={publicTabs.includes(tabId)}
                    onCheckedChange={(checked) => togglePublicTab(tabId, checked === true)}
                  />
                  {PUBLIC_TOURNAMENT_TAB_LABELS[tabId]}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              At least one tab must remain enabled.
            </p>
          </div>

          <div className="space-y-1">
            <Label>Google Sheet iframe embed code</Label>
            <Textarea
              value={iframeHtml}
              onChange={(e) => setIframeHtml(e.target.value)}
              placeholder='<iframe src="..." width="100%" height="800"></iframe>'
              className="min-h-[160px] font-mono text-xs"
            />
          </div>
          <Button onClick={savePublicSettings} disabled={savingIframe || savingTabs}>
            {savingIframe || savingTabs ? "Saving…" : "Save public page settings"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generate round-robin schedule</CardTitle>
          <CardDescription>
            Uses the Original schedule mode: every division opponent once, then
            cross-division games to reach Games per Team, packed across courts with
            lunch and rest constraints.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label>Schedule date</Label>
              <Input
                type="date"
                value={config.scheduleDate}
                onChange={(e) => setConfigField("scheduleDate", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Number of courts</Label>
              <Input
                type="number"
                min={1}
                value={config.numberOfCourts}
                onChange={(e) => setConfigField("numberOfCourts", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Time per match (mins)</Label>
              <Input
                type="number"
                min={1}
                value={config.timePerMatchMinutes}
                onChange={(e) => setConfigField("timePerMatchMinutes", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Start time</Label>
              <Input
                type="time"
                value={config.startTime}
                onChange={(e) => setConfigField("startTime", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Lunch start</Label>
              <Input
                type="time"
                value={config.lunchStart}
                onChange={(e) => setConfigField("lunchStart", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Lunch end</Label>
              <Input
                type="time"
                value={config.lunchEnd}
                onChange={(e) => setConfigField("lunchEnd", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Games per team</Label>
              <Input
                type="number"
                min={1}
                value={config.gamesPerTeam}
                onChange={(e) => setConfigField("gamesPerTeam", e.target.value)}
              />
            </div>
          </div>

          {generatorError && (
            <p className="text-sm text-destructive">{generatorError}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={previewing || applying}
              onClick={() => void runGenerator("preview")}
            >
              {previewing ? "Previewing…" : "Preview schedule"}
            </Button>
            <Button
              disabled={!preview || previewing || applying}
              onClick={() => void applyConfirmed()}
            >
              {applying ? "Applying…" : "Apply schedule"}
            </Button>
          </div>

          {preview && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="text-sm">
                <div className="font-medium mb-1">Preview diagnostics</div>
                <ul className="text-muted-foreground space-y-0.5">
                  <li>
                    {preview.diagnostics.totalMatches} matches across{" "}
                    {preview.diagnostics.totalSlots} time slots
                  </li>
                  <li>
                    Ends{" "}
                    {new Date(preview.diagnostics.endTimeIso).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </li>
                  <li>
                    Avoidable court waste: {preview.diagnostics.avoidableWaste}; avoidable
                    partial slots: {preview.diagnostics.avoidablePartialRounds}
                  </li>
                  {(preview.replaceableMatchCount ?? 0) > 0 && (
                    <li>
                      Applying will replace {preview.replaceableMatchCount} upcoming
                      match(es).
                    </li>
                  )}
                </ul>
              </div>

              <div className="space-y-3 max-h-[420px] overflow-y-auto">
                {previewBySlot.map((slot) => (
                  <div key={slot.slotIndex} className="rounded-md border">
                    <div className="bg-muted/40 px-3 py-1.5 text-sm font-medium">
                      Slot {slot.slotIndex + 1}
                      {slot.time && (
                        <span className="text-muted-foreground font-normal ml-2">
                          {new Date(slot.time).toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                    <ul className="divide-y">
                      {slot.matches.map((m, idx) => (
                        <li
                          key={`${m.slotIndex}-${m.courtNumber}-${idx}`}
                          className="px-3 py-2 text-sm flex flex-wrap items-center gap-x-3 gap-y-1"
                        >
                          <span className="text-muted-foreground w-16">
                            Court {m.courtNumber}
                          </span>
                          <span className="flex items-center gap-1.5 font-medium">
                            <ColorBadge
                              name={m.teamAName}
                              color={teamById.get(m.teamAId)?.color}
                            />
                            <span className="text-muted-foreground font-normal">vs</span>
                            <ColorBadge
                              name={m.teamBName}
                              color={teamById.get(m.teamBId)?.color}
                            />
                          </span>
                          <ColorBadge
                            name={m.divisionName}
                            color={
                              m.divisionId
                                ? divisionById.get(m.divisionId)?.color
                                : undefined
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create match</CardTitle>
          <CardDescription>Define the schedule your trackers will see.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Team A</Label>
              <Select value={teamAId} onValueChange={setTeamAId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Team B</Label>
              <Select value={teamBId} onValueChange={setTeamBId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Scheduled time</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>

          <Button
            disabled={submitting || !teamAId || !teamBId || teamAId === teamBId}
            onClick={add}
          >
            {submitting ? "Creating…" : "Create match"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Matches</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : matches.length === 0 ? (
            <div className="text-muted-foreground">No matches yet.</div>
          ) : (
            <ul className="space-y-2">
              {matches.map((m) => {
                const secs = matchSeconds(m);
                const divLabel =
                  m.pairingType === "CROSS"
                    ? "Cross"
                    : m.divisionId
                      ? divisionName[m.divisionId] ?? null
                      : null;
                const matchLocks = locksByMatch.get(m.id) ?? [];
                return (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 border rounded-md px-3 py-2"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5 font-medium">
                        <ColorBadge
                          name={teamName(m.teamAId)}
                          color={teamById.get(m.teamAId)?.color}
                        />
                        <span className="text-muted-foreground text-sm font-normal">vs</span>
                        <ColorBadge
                          name={teamName(m.teamBId)}
                          color={teamById.get(m.teamBId)?.color}
                        />
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {secs != null && (
                          <span className="mr-2">
                            {new Date(secs * 1000).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                        {m.courtNumber != null && (
                          <span className="mr-2">Court {m.courtNumber}</span>
                        )}
                        {divLabel && (
                          <span className="mr-2">
                            <ColorBadge
                              name={divLabel}
                              color={
                                m.pairingType === "CROSS"
                                  ? undefined
                                  : m.divisionId
                                    ? divisionById.get(m.divisionId)?.color
                                    : undefined
                              }
                            />
                          </span>
                        )}
                        <span>Status: {m.status}</span>
                        {m.status !== "UPCOMING" && (
                          <span className="ml-2 tabular-nums">
                            Sets {m.scoreA ?? 0}–{m.scoreB ?? 0}
                          </span>
                        )}
                        {m.status === "IN_PROGRESS" && (
                          <span className="ml-2 tabular-nums font-medium text-foreground">
                            · Set {m.currentSet ?? 1}:{" "}
                            {m.setScores?.[(m.currentSet ?? 1) - 1]?.a ?? 0}–
                            {m.setScores?.[(m.currentSet ?? 1) - 1]?.b ?? 0}
                            <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                          </span>
                        )}
                      </div>
                      {matchLocks.length > 0 ? (
                        <div className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                          Tracking:{" "}
                          {matchLocks
                            .map((l) => {
                              const name =
                                l.teamKey === "A"
                                  ? teamName(m.teamAId)
                                  : teamName(m.teamBId);
                              return `${name} — ${l.ownerName}`;
                            })
                            .join(" · ")}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void forceReleaseLocks(m.id)}
                      >
                        Release locks
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void removeMatch(m)}
                        disabled={deletingId === m.id}
                      >
                        {deletingId === m.id ? "Deleting…" : "Delete"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
