"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";

type NumberStepperProps = {
  id: string;
  label: React.ReactNode;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  hint?: React.ReactNode;
  decreaseLabel?: string;
  increaseLabel?: string;
};

export function NumberStepper({
  id,
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  disabled = false,
  className,
  hint,
  decreaseLabel = "Decrease",
  increaseLabel = "Increase",
}: NumberStepperProps) {
  const atMin = value <= min;
  const atMax = max != null && value >= max;

  return (
    <div className={cn("space-y-1", className)}>
      <Label id={`${id}-label`} className="text-sm">
        {label}
      </Label>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0 disabled:bg-muted disabled:text-foreground disabled:opacity-100"
          disabled={disabled || atMin}
          aria-label={decreaseLabel}
          onClick={() => onChange(Math.max(min, value - step))}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span
          id={id}
          role="status"
          aria-labelledby={`${id}-label`}
          className="min-w-[3.5rem] flex-1 rounded-md border bg-background px-2 py-2 text-center text-sm font-semibold tabular-nums text-foreground"
        >
          {value}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0 disabled:bg-muted disabled:text-foreground disabled:opacity-100"
          disabled={disabled || atMax}
          aria-label={increaseLabel}
          onClick={() => onChange(max != null ? Math.min(max, value + step) : value + step)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
