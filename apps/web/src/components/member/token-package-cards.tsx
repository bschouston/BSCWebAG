"use client";

import { Button } from "@/components/ui/button";
import {
  formatPackagePrice,
  normalizePackageCardColor,
  packageCardForeground,
} from "@/lib/token-packages";
import { CheckCircle2, Loader2 } from "lucide-react";

export type TokenPackageCardItem = {
  id: string;
  tokenAmount: number;
  priceCents: number;
  currency: string;
  label?: string | null;
  cardColor?: string | null;
};

type TokenPackageCardsProps = {
  packages: TokenPackageCardItem[];
  selectedAutoReplenishId: string | null;
  size?: "default" | "compact";
  /** Wallet: preference only. RSVP: charge happens when they complete RSVP on this page. */
  copyContext?: "wallet" | "rsvp";
  buyBusy?: boolean;
  prefsBusy?: boolean;
  buyDisabled?: boolean;
  prefsDisabled?: boolean;
  buyLoadingId?: string | null;
  /** When true for a package, mute card and disable one-time buy (auto replenish stays available). */
  oneTimeInsufficient?: (pkg: TokenPackageCardItem) => boolean;
  onBuyOneTime: (packageId: string) => void;
  onToggleAutoReplenish: (packageId: string | null) => void;
  emptyMessage?: string;
};

export function TokenPackageCards({
  packages,
  selectedAutoReplenishId,
  size = "default",
  copyContext = "wallet",
  buyBusy = false,
  prefsBusy = false,
  buyDisabled = false,
  prefsDisabled = false,
  buyLoadingId = null,
  oneTimeInsufficient,
  onBuyOneTime,
  onToggleAutoReplenish,
  emptyMessage = "No active packages yet.",
}: TokenPackageCardsProps) {
  const compact = size === "compact";
  const selectedHint =
    copyContext === "rsvp"
      ? "Preference saved. Complete RSVP next — your card will be charged if you still need tokens."
      : "No charge until you RSVP and need more tokens. Change anytime.";
  const idleHint =
    copyContext === "wallet"
      ? "No charge now — billed only if you RSVP short on tokens"
      : null;
  const insufficientHint =
    copyContext === "rsvp"
      ? "Not enough for one-time on this RSVP — auto replenish can still cover by charging more than once when you confirm RSVP"
      : null;

  if (packages.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div
      className={
        compact
          ? "grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
          : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      }
    >
      {packages.map((pkg) => {
        const bg = normalizePackageCardColor(pkg.cardColor);
        const fg = packageCardForeground(bg);
        const light = fg === "#122540";
        const isSelected = selectedAutoReplenishId === pkg.id;
        const insufficient = oneTimeInsufficient?.(pkg) === true;

        return (
          <div
            key={pkg.id}
            className={`relative flex flex-col justify-between overflow-hidden rounded-xl transition-shadow ${
              isSelected
                ? "ring-[3px] ring-[#FFD700] ring-offset-2 ring-offset-background shadow-lg shadow-[#FFD700]/25"
                : "mz-tile"
            }`}
            style={{
              background: light
                ? `linear-gradient(145deg, ${bg}, #fff3a0)`
                : `linear-gradient(145deg, #122540 0%, ${bg} 58%, ${bg})`,
              color: fg,
              minHeight: compact ? 168 : 280,
            }}
          >
            {isSelected ? (
              <div
                className={`absolute right-0 top-0 z-20 flex items-center gap-1 rounded-bl-lg font-bold uppercase tracking-wide ${
                  compact ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"
                }`}
                style={{ background: "#FFD700", color: "#122540" }}
              >
                <CheckCircle2 className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
                Auto replenish active
              </div>
            ) : null}

            <div className={`relative z-10 ${compact ? "p-2.5 pt-3" : "p-4 pt-5"}`}>
              {pkg.label ? (
                <p
                  className={`font-semibold uppercase tracking-[0.2em] opacity-85 ${
                    compact ? "text-[9px]" : "text-xs"
                  }`}
                >
                  {pkg.label}
                </p>
              ) : null}
              <p
                className={`font-extrabold leading-none tracking-tight tabular-nums ${
                  compact ? "mt-1.5 text-2xl" : "mt-3 text-6xl"
                }`}
              >
                {pkg.tokenAmount}
              </p>
              <p
                className={`font-semibold uppercase tracking-[0.16em] opacity-85 ${
                  compact ? "mt-0.5 text-[10px]" : "mt-2 text-base"
                }`}
              >
                tokens
              </p>
              <p
                className={`font-extrabold tracking-tight ${
                  compact ? "mt-2 text-lg" : "mt-5 text-3xl"
                }`}
              >
                {formatPackagePrice(pkg.priceCents, pkg.currency)}
              </p>
              {insufficient && insufficientHint ? (
                <p className="mt-1.5 text-[10px] leading-snug opacity-90" style={{ color: fg }}>
                  {insufficientHint}
                </p>
              ) : isSelected ? (
                <p
                  className={`leading-relaxed opacity-90 ${compact ? "mt-1.5 text-[10px]" : "mt-3 text-xs"}`}
                  style={{ color: fg }}
                >
                  {selectedHint}
                </p>
              ) : null}
            </div>

            <div className={`relative z-10 space-y-1.5 ${compact ? "px-2.5 pb-2.5" : "px-4 pb-4"}`}>
              <Button
                type="button"
                className={
                  insufficient || buyDisabled
                    ? `w-full cursor-not-allowed border border-transparent bg-zinc-300 font-bold text-zinc-600 opacity-100 shadow-none hover:bg-zinc-300 hover:text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-400 ${
                        compact ? "h-8 text-[11px]" : ""
                      }`
                    : `w-full border-0 bg-[#FFD700] font-bold text-[#122540] hover:bg-white hover:text-[#122540] ${
                        compact ? "h-8 text-[11px]" : ""
                      }`
                }
                disabled={
                  insufficient ||
                  buyDisabled ||
                  buyBusy ||
                  buyLoadingId === pkg.id
                }
                title={
                  insufficient
                    ? `${pkg.tokenAmount} tokens is not enough for a one-time RSVP purchase`
                    : undefined
                }
                onClick={() => onBuyOneTime(pkg.id)}
              >
                {buyLoadingId === pkg.id ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {insufficient
                  ? "Not enough for one-time"
                  : buyBusy && buyLoadingId !== pkg.id
                    ? "Starting…"
                    : "Buy one-time"}
              </Button>
              <Button
                type="button"
                variant={isSelected ? "default" : "outline"}
                className={
                  isSelected
                    ? `w-full border-0 bg-[#1a3556] font-bold text-white hover:bg-[#122540] dark:bg-white dark:text-[#122540] dark:hover:bg-[#ffd700] ${
                        compact ? "h-8 text-[11px]" : ""
                      }`
                    : `w-full border-white/40 bg-transparent font-semibold hover:bg-white/10 ${
                        compact ? "h-8 text-[11px]" : ""
                      }`
                }
                style={
                  isSelected
                    ? undefined
                    : { color: fg, borderColor: light ? "#12254040" : "#ffffff40" }
                }
                disabled={prefsDisabled || prefsBusy || buyBusy}
                onClick={() => onToggleAutoReplenish(isSelected ? null : pkg.id)}
              >
                {isSelected ? "Turn off auto replenish" : "Use for auto replenish"}
              </Button>
              {!isSelected && idleHint ? (
                <p
                  className={`text-center leading-snug opacity-75 ${compact ? "text-[10px]" : "text-[11px]"}`}
                  style={{ color: fg }}
                >
                  {idleHint}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
