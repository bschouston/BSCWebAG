import { subtractUnit, type DurationUnit } from "@/lib/chicago-time";

export type RsvpOffset = {
  amount: number;
  unit: DurationUnit;
};

export function rsvpWindowForStart(
  start: Date,
  opens: RsvpOffset,
  closes: RsvpOffset
): { opensAt: Date; closesAt: Date } {
  return {
    opensAt: subtractUnit(start, opens.amount, opens.unit),
    closesAt: subtractUnit(start, closes.amount, closes.unit),
  };
}

export function rsvpWindowState(now: Date, opensAt: Date, closesAt: Date): "before" | "open" | "closed" {
  if (now.getTime() < opensAt.getTime()) return "before";
  if (now.getTime() >= closesAt.getTime()) return "closed";
  return "open";
}
