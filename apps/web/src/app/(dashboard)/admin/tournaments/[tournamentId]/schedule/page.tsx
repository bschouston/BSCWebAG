"use client";

import { useEffect, useMemo, useState, use } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getMatchDeleteBlockers, getMatchResetBlockers, formatSetScores } from "@bsc/shared";
import { ColorBadge } from "@/components/ui/color-badge";
import {
  ConfirmTypeDeleteDialog,
  matchDeleteConsequences,
  matchResetAllConsequences,
  matchResetConsequences,
} from "@/components/tournament/confirm-type-delete-dialog";

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
  phase?: string;
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

function toDatetimeLocalValue(secs: number | null): string {
  if (secs == null) return "";
  const d = new Date(secs * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

export default function SchedulePage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = use(params);
  const { user } = useAuth();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [locks, setLocks] = useState<ActiveLock[]>([]);
  const [teamAId, setTeamAId] = useState<string>("");
  const [teamBId, setTeamBId] = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [courtNumber, setCourtNumber] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteMatch, setPendingDeleteMatch] = useState<MatchRow | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [pendingResetMatch, setPendingResetMatch] = useState<MatchRow | null>(null);
  const [pendingResetAll, setPendingResetAll] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  const [editingMatch, setEditingMatch] = useState<MatchRow | null>(null);
  const [editTeamAId, setEditTeamAId] = useState("");
  const [editTeamBId, setEditTeamBId] = useState("");
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [editCourtNumber, setEditCourtNumber] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [config, setConfig] = useState<ScheduleConfigForm>({
    ...DEFAULT_CONFIG,
    scheduleDate: todayYmd(),
  });
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [generatorError, setGeneratorError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [playoffsLockRR, setPlayoffsLockRR] = useState(false);

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
        const bracket = tData?.tournament?.playoffBracket;
        const hasSavedPlayoffs =
          !!bracket &&
          Array.isArray(bracket.seeds) &&
          bracket.seeds.length > 0 &&
          !!bracket.structure;
        setPlayoffsLockRR(hasSavedPlayoffs);
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

  const hasPublishedPlayoffMatches = useMemo(
    () => matches.some((m) => m.phase === "PLAYOFF"),
    [matches]
  );
  const rrGeneratorLocked = playoffsLockRR || hasPublishedPlayoffMatches;

  /** Pool / RR matches only — playoffs live on the Playoffs tab. */
  const scheduleMatches = useMemo(
    () => matches.filter((m) => m.phase !== "PLAYOFF"),
    [matches]
  );

  const resettableCompletedCount = useMemo(() => {
    return scheduleMatches.filter((m) => {
      const matchLocks = locksByMatch.get(m.id) ?? [];
      return (
        getMatchResetBlockers(
          { status: m.status, phase: m.phase, playSeq: m.playSeq },
          { activeLockCount: matchLocks.length }
        ).length === 0
      );
    }).length;
  }, [scheduleMatches, locksByMatch]);

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
    if (rrGeneratorLocked) {
      setGeneratorError(
        "Round-robin schedule generation is disabled after playoffs are saved or published. Delete Playoffs on the Playoffs tab first."
      );
      return;
    }
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
    const replaceCount = preview?.replaceableMatchCount ?? scheduleMatches.length;
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
    const court = Number(courtNumber);
    await fetch(`/api/tournaments/${tournamentId}/matches`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        teamAId,
        teamBId,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        status: "UPCOMING",
        ...(Number.isFinite(court) && court >= 1 ? { courtNumber: Math.floor(court) } : {}),
      }),
    });
    setTeamAId("");
    setTeamBId("");
    setScheduledAt("");
    setCourtNumber("");
    await load();
    setSubmitting(false);
  };

  const removeMatch = async (match: MatchRow, blockers: string[]) => {
    if (blockers.length) return;
    setPendingDeleteMatch(match);
  };

  const confirmRemoveMatch = async () => {
    const match = pendingDeleteMatch;
    if (!match) return;

    setDeletingId(match.id);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/tournaments/${tournamentId}/matches/${match.id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail =
          Array.isArray(data?.blockers) && data.blockers.length
            ? `${data.error ?? "Cannot delete match"}: ${data.blockers.join("; ")}`
            : (data?.error ?? "Failed to delete match");
        window.alert(detail);
      } else {
        setPendingDeleteMatch(null);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const openResetMatch = (match: MatchRow, blockers: string[]) => {
    if (blockers.length) return;
    setPendingResetMatch(match);
  };

  const confirmResetMatch = async () => {
    const match = pendingResetMatch;
    if (!match) return;

    setResettingId(match.id);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/tournaments/${tournamentId}/matches/${match.id}/reset`, {
        method: "POST",
        headers,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail =
          Array.isArray(data?.blockers) && data.blockers.length
            ? `${data.error ?? "Cannot reset match"}: ${data.blockers.join("; ")}`
            : (data?.error ?? "Failed to reset match");
        window.alert(detail);
      } else {
        setPendingResetMatch(null);
        await load();
      }
    } finally {
      setResettingId(null);
    }
  };

  const confirmResetAll = async () => {
    setResettingAll(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/tournaments/${tournamentId}/matches/reset-all`, {
        method: "POST",
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data?.error ?? "Failed to reset matches");
        return;
      }
      setPendingResetAll(false);
      const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
      window.alert(
        `Reset ${data.matchesReset ?? 0} match(es)` +
          (skipped ? `; skipped ${skipped} (locks or ineligible)` : "")
      );
      await load();
      await loadLocks();
    } finally {
      setResettingAll(false);
    }
  };

  const openEditMatch = (match: MatchRow) => {
    setEditingMatch(match);
    setEditTeamAId(match.teamAId);
    setEditTeamBId(match.teamBId);
    setEditScheduledAt(toDatetimeLocalValue(matchSeconds(match)));
    setEditCourtNumber(match.courtNumber != null ? String(match.courtNumber) : "");
    setEditError(null);
  };

  const closeEditMatch = () => {
    setEditingMatch(null);
    setEditError(null);
  };

  const saveEditMatch = async () => {
    if (!editingMatch) return;
    if (!editTeamAId || !editTeamBId || editTeamAId === editTeamBId) {
      setEditError("Choose two different teams.");
      return;
    }
    const court = editCourtNumber.trim() ? Number(editCourtNumber) : null;
    if (court != null && (!Number.isFinite(court) || court < 1)) {
      setEditError("Court must be a positive number.");
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/tournaments/${tournamentId}/matches/${editingMatch.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({
            teamAId: editTeamAId,
            teamBId: editTeamBId,
            scheduledAt: editScheduledAt ? new Date(editScheduledAt).toISOString() : null,
            courtNumber: court != null ? Math.floor(court) : null,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to update match");
      closeEditMatch();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update match");
    } finally {
      setSavingEdit(false);
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

          {rrGeneratorLocked && (
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Playoffs have been saved or published. Preview/Apply for the round-robin schedule
              are disabled so pool seeding is not disrupted. Use Delete Playoffs on the Playoffs
              tab if you need to regenerate the pool schedule.
            </p>
          )}

          {generatorError && (
            <p className="text-sm text-destructive">{generatorError}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={previewing || applying || rrGeneratorLocked}
              onClick={() => void runGenerator("preview")}
              title={
                rrGeneratorLocked
                  ? "Disabled while playoffs are saved or published"
                  : undefined
              }
            >
              {previewing ? "Previewing…" : "Preview schedule"}
            </Button>
            <Button
              disabled={!preview || previewing || applying || rrGeneratorLocked}
              onClick={() => void applyConfirmed()}
              title={
                rrGeneratorLocked
                  ? "Disabled while playoffs are saved or published"
                  : undefined
              }
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

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="create-match-time">Scheduled time</Label>
              <Input
                id="create-match-time"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-match-court">Court</Label>
              <Input
                id="create-match-court"
                type="number"
                min={1}
                placeholder="e.g. 1"
                value={courtNumber}
                onChange={(e) => setCourtNumber(e.target.value)}
              />
            </div>
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
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle>Matches</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={resettingAll || resettableCompletedCount === 0}
            title={
              resettableCompletedCount === 0
                ? "No completed round-robin matches available to reset"
                : `Reset ${resettableCompletedCount} completed match(es)`
            }
            onClick={() => setPendingResetAll(true)}
          >
            {resettingAll ? "Resetting…" : "Reset all completed"}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : scheduleMatches.length === 0 ? (
            <div className="text-muted-foreground">No matches yet.</div>
          ) : (
            <ul className="space-y-2">
              {scheduleMatches.map((m) => {
                const secs = matchSeconds(m);
                const divLabel =
                  m.pairingType === "CROSS"
                    ? "Cross"
                    : m.divisionId
                      ? divisionName[m.divisionId] ?? null
                      : null;
                const matchLocks = locksByMatch.get(m.id) ?? [];
                const deleteBlockers = getMatchDeleteBlockers(
                  {
                    status: m.status,
                    phase: m.phase,
                    playSeq: m.playSeq,
                    winnerTeamId: null,
                  },
                  { activeLockCount: matchLocks.length }
                );
                const resetBlockers = getMatchResetBlockers(
                  {
                    status: m.status,
                    phase: m.phase,
                    playSeq: m.playSeq,
                  },
                  { activeLockCount: matchLocks.length }
                );
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
                        <span className="mr-2">
                          MatchID: <span className="font-mono">{m.id}</span>
                        </span>
                        <span>Status: {m.status}</span>
                        {m.status !== "UPCOMING" && (
                          <span className="ml-2 tabular-nums">
                            Sets {m.scoreA ?? 0}–{m.scoreB ?? 0}
                            {formatSetScores(m.setScores) ? (
                              <span className="ml-1.5 text-muted-foreground font-normal">
                                ({formatSetScores(m.setScores)})
                              </span>
                            ) : null}
                          </span>
                        )}
                        {m.status === "IN_PROGRESS" && (
                          <span className="ml-2 inline-flex items-center">
                            <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
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
                        onClick={() => openEditMatch(m)}
                      >
                        Edit
                      </Button>
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
                        onClick={() => openResetMatch(m, resetBlockers)}
                        disabled={resettingId === m.id || resetBlockers.length > 0}
                        title={
                          resetBlockers.length
                            ? resetBlockers.join("; ")
                            : "Wipe plays and stats; keep match on schedule"
                        }
                      >
                        {resettingId === m.id ? "Resetting…" : "Reset"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void removeMatch(m, deleteBlockers)}
                        disabled={deletingId === m.id || deleteBlockers.length > 0}
                        title={deleteBlockers.length ? deleteBlockers.join("; ") : undefined}
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

      <ConfirmTypeDeleteDialog
        open={pendingDeleteMatch != null}
        onOpenChange={(open) => {
          if (!open && deletingId == null) setPendingDeleteMatch(null);
        }}
        title="Delete this match?"
        description={
          pendingDeleteMatch
            ? `Status: ${pendingDeleteMatch.status}. MatchID: ${pendingDeleteMatch.id}. This cannot be undone.`
            : "This cannot be undone."
        }
        consequences={matchDeleteConsequences()}
        destructiveHint={
          pendingDeleteMatch &&
          (pendingDeleteMatch.status === "COMPLETED" || (pendingDeleteMatch.playSeq ?? 0) > 0)
            ? "This match has recorded results or plays. Deleting it permanently removes those results and recalculates standings and player/team stats without this match."
            : null
        }
        confirming={deletingId != null}
        confirmingLabel="Deleting…"
        onConfirm={confirmRemoveMatch}
      />

      <ConfirmTypeDeleteDialog
        open={pendingResetMatch != null}
        onOpenChange={(open) => {
          if (!open && resettingId == null) setPendingResetMatch(null);
        }}
        title="Reset this match?"
        description={
          pendingResetMatch
            ? `Status: ${pendingResetMatch.status}. MatchID: ${pendingResetMatch.id}. The match stays on the schedule as UPCOMING.`
            : "The match stays on the schedule as UPCOMING."
        }
        consequences={matchResetConsequences()}
        destructiveHint="Recorded results for this match will be wiped permanently. Standings and player/team stats will be rebuilt without this match's contribution."
        confirmWord="reset"
        confirmLabel="Reset match"
        confirmingLabel="Resetting…"
        confirming={resettingId != null}
        onConfirm={confirmResetMatch}
      />

      <ConfirmTypeDeleteDialog
        open={pendingResetAll}
        onOpenChange={(open) => {
          if (!open && !resettingAll) setPendingResetAll(false);
        }}
        title="Reset all completed RR matches?"
        description={`${resettableCompletedCount} completed round-robin match(es) will be wiped back to UPCOMING. Playoffs are not affected.`}
        consequences={matchResetAllConsequences()}
        destructiveHint="All recorded results for those matches will be wiped permanently and standings will be rebuilt."
        confirmWord="reset"
        confirmLabel="Reset all completed"
        confirmingLabel="Resetting…"
        confirming={resettingAll}
        onConfirm={confirmResetAll}
      />

      <Dialog open={editingMatch != null} onOpenChange={(open) => !open && closeEditMatch()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit match</DialogTitle>
            <DialogDescription>
              {editingMatch ? (
                <>
                  MatchID: <span className="font-mono">{editingMatch.id}</span>
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Team A</Label>
                <Select value={editTeamAId} onValueChange={setEditTeamAId}>
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
                <Select value={editTeamBId} onValueChange={setEditTeamBId}>
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="edit-match-time">Scheduled time</Label>
                <Input
                  id="edit-match-time"
                  type="datetime-local"
                  value={editScheduledAt}
                  onChange={(e) => setEditScheduledAt(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-match-court">Court</Label>
                <Input
                  id="edit-match-court"
                  type="number"
                  min={1}
                  placeholder="e.g. 1"
                  value={editCourtNumber}
                  onChange={(e) => setEditCourtNumber(e.target.value)}
                />
              </div>
            </div>
            {editError ? <p className="text-sm text-destructive">{editError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeEditMatch} disabled={savingEdit}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                savingEdit || !editTeamAId || !editTeamBId || editTeamAId === editTeamBId
              }
              onClick={() => void saveEditMatch()}
            >
              {savingEdit ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
