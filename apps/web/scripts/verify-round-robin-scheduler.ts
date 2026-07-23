/**
 * Offline verification of Original-mode round-robin constraints.
 *   npx tsx scripts/verify-round-robin-scheduler.ts
 */
import { utcDateToWallMinutes } from "@bsc/shared";
import { generateOriginalRoundRobinSchedule } from "../src/lib/round-robin-scheduler";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function runCase(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (e) {
    console.error(`FAIL ${label}:`, e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}

runCase("two divisions of 4, gamesPerTeam=4", () => {
  const divisions = [
    { id: "d1", name: "Open" },
    { id: "d2", name: "Masters" },
  ];
  const teams = [
    ...["A1", "A2", "A3", "A4"].map((name, i) => ({
      id: `a${i}`,
      name,
      divisionId: "d1",
    })),
    ...["B1", "B2", "B3", "B4"].map((name, i) => ({
      id: `b${i}`,
      name,
      divisionId: "d2",
    })),
  ];

  const result = generateOriginalRoundRobinSchedule({
    teams,
    divisions,
    config: {
      numberOfCourts: 3,
      timePerMatchMinutes: 25,
      scheduleDate: "2026-08-01",
      startTime: "09:00",
      lunchStart: "12:30",
      lunchEnd: "13:30",
      gamesPerTeam: 4,
      seed: "test-seed-1",
    },
  });
  assert(result.ok, result.ok ? "" : result.error);
  if (!result.ok) return;

  // Start time is 09:00 America/Chicago wall clock (not host TZ)
  const first = result.matches[0];
  assert(first, "expected at least one match");
  assert(
    utcDateToWallMinutes(new Date(first.scheduledAt)) === 9 * 60,
    `first match should be 09:00 Chicago, got ${first.scheduledAt}`
  );

  // Deterministic
  const again = generateOriginalRoundRobinSchedule({
    teams,
    divisions,
    config: {
      numberOfCourts: 3,
      timePerMatchMinutes: 25,
      scheduleDate: "2026-08-01",
      startTime: "09:00",
      lunchStart: "12:30",
      lunchEnd: "13:30",
      gamesPerTeam: 4,
      seed: "test-seed-1",
    },
  });
  assert(again.ok, "second run failed");
  if (again.ok) {
    assert(
      JSON.stringify(again.matches) === JSON.stringify(result.matches),
      "not deterministic for same seed"
    );
  }

  // Exact games per team
  for (const [team, count] of Object.entries(result.diagnostics.gamesPerTeam)) {
    assert(count === 4, `${team} has ${count} games, expected 4`);
  }

  // No team double-booked in a slot
  const bySlot = new Map<number, string[]>();
  for (const m of result.matches) {
    const list = bySlot.get(m.slotIndex) ?? [];
    list.push(m.teamAId, m.teamBId);
    bySlot.set(m.slotIndex, list);
  }
  for (const [slot, ids] of bySlot) {
    assert(ids.length === new Set(ids).size, `slot ${slot} double-booked a team`);
    assert(ids.length / 2 <= 3, `slot ${slot} used more than 3 courts`);
  }

  // Lunch skipped (check in America/Chicago wall clock, not host TZ)
  for (const m of result.matches) {
    const mins = utcDateToWallMinutes(new Date(m.scheduledAt));
    assert(mins < 12 * 60 + 30 || mins >= 13 * 60 + 30, `match in lunch: ${m.scheduledAt}`);
  }

  // Rest: a team's next match starts at least duration after previous
  const byTeam = new Map<string, number[]>();
  for (const m of result.matches) {
    const t = new Date(m.scheduledAt).getTime();
    for (const id of [m.teamAId, m.teamBId]) {
      const list = byTeam.get(id) ?? [];
      list.push(t);
      byTeam.set(id, list);
    }
  }
  for (const [id, times] of byTeam) {
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      assert(
        times[i] >= times[i - 1] + 25 * 60_000,
        `${id} back-to-back without rest`
      );
    }
  }

  // Division pairs present
  const divisionPairs = result.matches.filter((m) => m.pairingType === "DIVISION");
  assert(divisionPairs.length === 12, `expected 12 division matches, got ${divisionPairs.length}`);
});

runCase("rejects gamesPerTeam too low", () => {
  const result = generateOriginalRoundRobinSchedule({
    teams: [
      { id: "1", name: "A", divisionId: "d" },
      { id: "2", name: "B", divisionId: "d" },
      { id: "3", name: "C", divisionId: "d" },
    ],
    divisions: [{ id: "d", name: "Open" }],
    config: {
      numberOfCourts: 1,
      timePerMatchMinutes: 20,
      scheduleDate: "2026-08-01",
      startTime: "09:00",
      lunchStart: "12:00",
      lunchEnd: "13:00",
      gamesPerTeam: 1,
      seed: "x",
    },
  });
  assert(!result.ok, "should fail");
});

runCase("rejects unassigned team", () => {
  // API layer catches this; scheduler also rejects empty divisionId teams via buildPairs
  const result = generateOriginalRoundRobinSchedule({
    teams: [{ id: "1", name: "A", divisionId: "" }],
    divisions: [{ id: "d", name: "Open" }],
    config: {
      numberOfCourts: 1,
      timePerMatchMinutes: 20,
      scheduleDate: "2026-08-01",
      startTime: "09:00",
      lunchStart: "12:00",
      lunchEnd: "13:00",
      gamesPerTeam: 1,
      seed: "y",
    },
  });
  assert(!result.ok, "should fail for empty division");
});

console.log(process.exitCode ? "\nSome checks failed." : "\nAll checks passed.");
