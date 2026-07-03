import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import {
  SetRulesSchema,
  StatCategorySchema,
  TrackerColorsSchema,
  TrackerLayoutSchema,
  aggregateFieldFromKey,
  statKeyFromLabel,
  type TrackerStat,
} from "@bsc/shared";
import { requireTracker } from "../../../../lib/server-auth";
import {
  configRef,
  getOrSeedTrackerConfig,
  isKnownSport,
  securityRef,
} from "../../../../lib/tracker-config-server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sport: string }> }
) {
  const { error } = await requireTracker(req);
  if (error) return error;

  const { sport } = await params;
  if (!isKnownSport(sport)) {
    return NextResponse.json({ error: "Unknown sport" }, { status: 404 });
  }

  try {
    const [config, securitySnap] = await Promise.all([
      getOrSeedTrackerConfig(sport),
      securityRef(sport).get(),
    ]);
    const hasPasscode = !!(securitySnap.data() as any)?.hash;
    return NextResponse.json({ config, hasPasscode });
  } catch (err) {
    console.error("Tracker config read failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** Editable stat fields; key/aggregateField are server-assigned + immutable. */
const StatInputSchema = z.object({
  key: z.string().optional(),
  label: z.string().min(1).max(40),
  shortLabel: z.string().min(1).max(12),
  category: StatCategorySchema,
  points: z.number().finite(),
  requiresPlayer: z.boolean(),
  enabled: z.boolean(),
});

const UpdateSchema = z.object({
  stats: z.array(StatInputSchema).min(1).max(40).optional(),
  colors: TrackerColorsSchema.optional(),
  layout: TrackerLayoutSchema.optional(),
  setRules: SetRulesSchema.optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ sport: string }> }
) {
  const { user, error } = await requireTracker(req);
  if (error) return error;

  const { sport } = await params;
  if (!isKnownSport(sport)) {
    return NextResponse.json({ error: "Unknown sport" }, { status: 404 });
  }

  const parsed = UpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const body = parsed.data;

  try {
    const current = await getOrSeedTrackerConfig(sport);
    const updates: Record<string, unknown> = {};

    if (body.stats) {
      const existingByKey = new Map(current.stats.map((s) => [s.key, s]));
      const usedKeys = new Set<string>();
      const nextStats: TrackerStat[] = [];

      for (const [i, input] of body.stats.entries()) {
        const existing = input.key ? existingByKey.get(input.key) : undefined;
        let key: string;
        let aggregateField: string;

        if (existing) {
          key = existing.key;
          aggregateField = existing.aggregateField;
        } else {
          // New stat: derive a unique immutable key from the label.
          const base = statKeyFromLabel(input.label);
          if (!base) {
            return NextResponse.json(
              { error: `Cannot derive a stat key from label "${input.label}"` },
              { status: 400 }
            );
          }
          key = base;
          let n = 2;
          while (usedKeys.has(key) || existingByKey.has(key)) key = `${base}_${n++}`;
          aggregateField = aggregateFieldFromKey(key);
        }

        if (usedKeys.has(key)) {
          return NextResponse.json({ error: `Duplicate stat: ${key}` }, { status: 400 });
        }
        usedKeys.add(key);

        nextStats.push({
          key,
          label: input.label,
          shortLabel: input.shortLabel,
          category: input.category,
          points: input.points,
          requiresPlayer: input.requiresPlayer,
          aggregateField,
          enabled: input.enabled,
          order: i,
        });
      }

      // Stats omitted from the payload are soft-disabled, never hard-deleted,
      // so historical plays and aggregates keep resolving.
      for (const stat of current.stats) {
        if (!usedKeys.has(stat.key)) {
          nextStats.push({ ...stat, enabled: false, order: nextStats.length });
        }
      }

      if (!nextStats.some((s) => s.enabled)) {
        return NextResponse.json(
          { error: "At least one stat must remain enabled" },
          { status: 400 }
        );
      }
      updates.stats = nextStats;
    }

    if (body.colors) updates.colors = body.colors;
    if (body.layout) updates.layout = body.layout;
    if (body.setRules) {
      if (body.setRules.setsToWin > body.setRules.totalSets) {
        return NextResponse.json(
          { error: "setsToWin cannot exceed totalSets" },
          { status: 400 }
        );
      }
      updates.setRules = body.setRules;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    updates.updatedAt = Timestamp.now().toDate().toISOString();
    updates.updatedBy = user.uid;
    await configRef(sport).set(updates, { merge: true });

    const config = await getOrSeedTrackerConfig(sport);
    return NextResponse.json({ config });
  } catch (err) {
    console.error("Tracker config update failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
