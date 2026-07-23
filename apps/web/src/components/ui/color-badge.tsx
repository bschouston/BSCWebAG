import { readableTextColor } from "@/lib/color-contrast";
import { cn } from "@/lib/utils";

/** Pill filled with the given color, text auto-contrasted; neutral outline when no color. */
export function ColorBadge({
  name,
  color,
  className,
  score,
}: {
  name: string;
  color?: string | null;
  className?: string;
  /** Optional sets-won score shown inside the pill (right-aligned). */
  score?: number | null;
}) {
  const hasScore = score != null;
  const scoreEl = hasScore ? (
    <span className="ml-auto shrink-0 font-bold tabular-nums leading-none">{score}</span>
  ) : null;

  if (!color) {
    return (
      <span
        className={cn(
          "inline-flex min-w-0 items-center rounded-md border px-2.5 py-1 text-sm font-semibold",
          hasScore && "w-full justify-between gap-2",
          !hasScore && "gap-2",
          className
        )}
      >
        <span className="min-w-0 truncate">{name}</span>
        {scoreEl}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center rounded-md px-2.5 py-1 text-sm font-semibold",
        hasScore && "w-full justify-between gap-2",
        !hasScore && "gap-2",
        className
      )}
      style={{ backgroundColor: color, color: readableTextColor(color) }}
    >
      <span className="min-w-0 truncate">{name}</span>
      {scoreEl}
    </span>
  );
}
