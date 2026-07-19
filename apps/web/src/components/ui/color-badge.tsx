import { readableTextColor } from "@/lib/color-contrast";
import { cn } from "@/lib/utils";

/** Pill filled with the given color, text auto-contrasted; neutral outline when no color. */
export function ColorBadge({
  name,
  color,
  className,
}: {
  name: string;
  color?: string | null;
  className?: string;
}) {
  if (!color) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md border px-2.5 py-1 text-sm font-semibold",
          className
        )}
      >
        {name}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-1 text-sm font-semibold",
        className
      )}
      style={{ backgroundColor: color, color: readableTextColor(color) }}
    >
      {name}
    </span>
  );
}

