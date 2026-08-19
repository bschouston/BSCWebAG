"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DateRangeInputs({
    from,
    to,
    onFromChange,
    onToChange,
    showTimezone = true,
}: {
    from: string;
    to: string;
    onFromChange: (value: string) => void;
    onToChange: (value: string) => void;
    showTimezone?: boolean;
}) {
    const hasRange = Boolean(from || to);
    return (
        <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
                <Label htmlFor="tx-date-from" className="text-xs text-muted-foreground">
                    From
                </Label>
                <Input
                    id="tx-date-from"
                    type="date"
                    value={from}
                    onChange={(e) => onFromChange(e.target.value)}
                    className="w-[10.5rem] h-8"
                />
            </div>
            <div className="space-y-1">
                <Label htmlFor="tx-date-to" className="text-xs text-muted-foreground">
                    To
                </Label>
                <Input
                    id="tx-date-to"
                    type="date"
                    value={to}
                    onChange={(e) => onToChange(e.target.value)}
                    className="w-[10.5rem] h-8"
                />
            </div>
            {hasRange && (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={() => {
                        onFromChange("");
                        onToChange("");
                    }}
                >
                    Clear dates
                </Button>
            )}
            {showTimezone ? (
            <p className="text-xs text-muted-foreground w-full sm:w-auto sm:ml-1 pb-1">
                America/Chicago
            </p>
            ) : null}
        </div>
    );
}
