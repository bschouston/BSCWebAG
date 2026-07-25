"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  type DocumentData,
} from "firebase/firestore";
import {
  colorForStatCategory,
  computeLeaderboardValue,
  livePageTitle,
  registrationNavTitle,
  sportFromStatTrackerId,
  trackerConfigLeaderboardColumns,
  type LeaderboardColumnDef,
  type TrackerConfig,
} from "@bsc/shared";
import { db } from "@/lib/firebase/client";
import { normalizeHexColor } from "@/lib/color-contrast";
import {
  ageFromDob,
  parseCachedSkills,
  type PublicRosterSkill,
} from "@/lib/registration-profile";

export type LivePlayerRow = {
  id: string;
  displayName: string;
  teamId: string | null;
  teamName: string;
  teamColor: string | null;
  number?: number | null;
  points: number;
  stats: Record<string, unknown>;
  photoUrl: string | null;
  age: number | null;
  height: string | null;
  skills: PublicRosterSkill[];
};

export type LiveTeamRow = { id: string; name: string; color: string | null };

type PlayerDoc = {
  id: string;
  displayName: string;
  teamId: string | null;
  number?: number | null;
  photoUrl: string | null;
  height: string | null;
  dateOfBirth: string | null;
  skills: PublicRosterSkill[];
};

export function useLiveTournamentStats(tournamentId: string | undefined) {
  const [tournamentRawName, setTournamentRawName] = useState("Tournament");
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState<string | null>(null);
  const [registrationFormType, setRegistrationFormType] = useState<
    string | undefined
  >();
  const [statTrackerId, setStatTrackerId] = useState<string>("volleyball.v1");
  const [config, setConfig] = useState<TrackerConfig | null>(null);
  const [rawStats, setRawStats] = useState<DocumentData[]>([]);
  const [players, setPlayers] = useState<PlayerDoc[]>([]);
  const [teams, setTeams] = useState<LiveTeamRow[]>([]);
  const [boardStats, setBoardStats] = useState<DocumentData[]>([]);
  const boardHasDataRef = useRef(false);

  useEffect(() => {
    if (!tournamentId) return;
    const unsub = onSnapshot(doc(db, "tournaments", tournamentId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as {
        name?: string;
        statTrackerId?: string;
        eventId?: string;
      };
      setTournamentRawName(String(data.name ?? "Tournament"));
      setStatTrackerId(String(data.statTrackerId ?? "volleyball.v1"));
      const linked =
        typeof data.eventId === "string" && data.eventId.trim()
          ? data.eventId.trim()
          : null;
      setEventId(linked);
      if (!linked) {
        setEventTitle(null);
        setRegistrationFormType(undefined);
      }
    });
    return () => unsub();
  }, [tournamentId]);

  // Prefer the linked event title (same as tournament list / Live APIs).
  useEffect(() => {
    if (!eventId) return;
    const unsub = onSnapshot(doc(db, "events", eventId), (snap) => {
      if (!snap.exists()) {
        setEventTitle(null);
        setRegistrationFormType(undefined);
        return;
      }
      const data = snap.data() as {
        title?: unknown;
        registrationFormType?: unknown;
      };
      const title = String(data.title ?? "").trim();
      setEventTitle(title || null);
      setRegistrationFormType(
        typeof data.registrationFormType === "string"
          ? data.registrationFormType
          : undefined
      );
    });
    return () => unsub();
  }, [eventId]);

  const tournamentName = useMemo(
    () =>
      livePageTitle(
        registrationNavTitle(
          eventTitle ?? tournamentRawName,
          registrationFormType
        ),
        statTrackerId
      ),
    [eventTitle, tournamentRawName, registrationFormType, statTrackerId]
  );

  useEffect(() => {
    const sport = sportFromStatTrackerId(statTrackerId) || "volleyball";
    const unsub = onSnapshot(doc(db, "trackerConfigs", sport), (snap) => {
      if (!snap.exists()) {
        setConfig(null);
        return;
      }
      setConfig(snap.data() as TrackerConfig);
    });
    return () => unsub();
  }, [statTrackerId]);

  useEffect(() => {
    if (!tournamentId) return;
    const unsub = onSnapshot(collection(db, "tournaments", tournamentId, "playerStats"), (snap) => {
      setRawStats(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [tournamentId]);

  useEffect(() => {
    if (!tournamentId) return;
    const unsubP = onSnapshot(collection(db, "tournaments", tournamentId, "players"), (snap) => {
      setPlayers(
        snap.docs.map((d) => {
          const data = d.data() as {
            displayName?: string;
            teamId?: string;
            number?: number | string | null;
            photoUrl?: string | null;
            height?: string | null;
            dateOfBirth?: string | null;
            skills?: unknown;
          };
          const number =
            typeof data.number === "number"
              ? data.number
              : data.number != null &&
                  String(data.number).trim() !== "" &&
                  !Number.isNaN(Number(data.number))
                ? Number(data.number)
                : null;
          const dob =
            typeof data.dateOfBirth === "string" && data.dateOfBirth.trim()
              ? data.dateOfBirth.trim()
              : null;
          return {
            id: d.id,
            displayName: String(data.displayName ?? "Player"),
            teamId: data.teamId ?? null,
            number,
            photoUrl:
              typeof data.photoUrl === "string" && data.photoUrl.trim()
                ? data.photoUrl.trim()
                : null,
            height:
              typeof data.height === "string" && data.height.trim()
                ? data.height.trim()
                : null,
            dateOfBirth: dob,
            skills: parseCachedSkills(data.skills),
          };
        })
      );
    });
    const unsubT = onSnapshot(collection(db, "tournaments", tournamentId, "teams"), (snap) => {
      setTeams(
        snap.docs.map((d) => {
          const data = d.data() as { name?: string; color?: string | null };
          return {
            id: d.id,
            name: String(data.name ?? d.id),
            color: normalizeHexColor(data.color ?? null),
          };
        })
      );
    });
    return () => {
      unsubP();
      unsubT();
    };
  }, [tournamentId]);

  useEffect(() => {
    const delay = boardHasDataRef.current ? 300 : 0;
    const t = setTimeout(() => {
      boardHasDataRef.current = true;
      setBoardStats(rawStats);
    }, delay);
    return () => clearTimeout(t);
  }, [rawStats]);

  const teamNameById = useMemo(
    () => new Map(teams.map((t) => [t.id, t.name])),
    [teams]
  );

  const teamColorById = useMemo(
    () => new Map(teams.map((t) => [t.id, t.color])),
    [teams]
  );

  const leaderboardColumns: LeaderboardColumnDef[] = useMemo(
    () => (config ? trackerConfigLeaderboardColumns(config) : []),
    [config]
  );

  const pointsColor = useMemo(
    () => (config ? colorForStatCategory(config.colors, "positive_points") : undefined),
    [config]
  );

  const statsById = useMemo(() => {
    const map: Record<string, Record<string, unknown>> = {};
    for (const s of boardStats) {
      map[String((s as { id?: string }).id)] = s as Record<string, unknown>;
    }
    return map;
  }, [boardStats]);

  const livePlayers: LivePlayerRow[] = useMemo(() => {
    if (!config) return [];
    return players
      .map((p) => {
        const stats = statsById[p.id] ?? {
          displayName: p.displayName,
          teamId: p.teamId,
        };
        const teamId =
          p.teamId ??
          (typeof stats.teamId === "string" ? stats.teamId : null);
        const number =
          p.number ??
          (typeof stats.number === "number" ? stats.number : null);
        const points = computeLeaderboardValue(stats, config);
        return {
          id: p.id,
          displayName: p.displayName,
          teamId,
          teamName: teamId ? teamNameById.get(teamId) ?? "—" : "—",
          teamColor: teamId ? teamColorById.get(teamId) ?? null : null,
          number,
          points,
          stats,
          photoUrl: p.photoUrl,
          age: ageFromDob(p.dateOfBirth),
          height: p.height,
          skills: p.skills,
        };
      })
      .sort(
        (a, b) =>
          b.points - a.points || a.displayName.localeCompare(b.displayName)
      );
  }, [players, statsById, config, teamNameById, teamColorById]);

  return {
    tournamentName,
    statTrackerId,
    config,
    livePlayers,
    statsById,
    teams,
    players,
    leaderboardColumns,
    pointsColor,
  };
}
