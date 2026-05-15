"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/** Default zoom for published Google Sheets — CSS transform scale on the iframe wrapper. */
const DEFAULT_SHEET_SCALE = 0.62;
const SCALE_MIN = 0.45;
const SCALE_MAX = 1.6;

/** Iframe layout height before `transform: scale()`. Host height = this × scale so the card matches the visible sheet. */
const SHEET_LAYOUT_HEIGHT_CSS = "min(85vh, 900px)";

type Props = {
  src: string;
  title?: string;
  /** Initial CSS scale (< 1 zooms out). Defaults to a sheet-friendly zoom. */
  defaultScale?: number;
};

export function LiveIframe({ src, title, defaultScale = DEFAULT_SHEET_SCALE }: Props) {
  const clamp = (v: number) =>
    Math.max(SCALE_MIN, Math.min(SCALE_MAX, Number(v.toFixed(2))));
  const initial = clamp(defaultScale);
  const [scale, setScale] = useState(initial);
  const [mounted, setMounted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [manualEnabled, setManualEnabled] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const percent = useMemo(() => Math.round(scale * 100), [scale]);

  /** Sized region only (padding wraps outside this div). */
  const hostHeightCss = `calc(${SHEET_LAYOUT_HEIGHT_CSS} * ${scale})`;

  const setScaled = (next: number) => setScale(clamp(next));

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    let cancelled = false;

    const enable = () => {
      if (cancelled) return;
      // Defer iframe mount until browser is idle to reduce jank.
      const ric = (window as any).requestIdleCallback as
        | ((cb: () => void, opts?: { timeout?: number }) => number)
        | undefined;
      if (ric) {
        ric(() => !cancelled && setMounted(true), { timeout: 1200 });
      } else {
        setTimeout(() => !cancelled && setMounted(true), 250);
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          io.disconnect();
          enable();
        }
      },
      { rootMargin: "200px 0px" }
    );

    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Zoom: <span className="font-medium text-foreground tabular-nums">{percent}%</span>
        </div>
        <div className="flex items-center gap-2">
          {!mounted && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setManualEnabled(true);
                setMounted(true);
              }}
            >
              Load sheet
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setScaled(scale - 0.1)}
            disabled={scale <= SCALE_MIN}
          >
            –
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setScaled(1)}
            disabled={scale === 1}
          >
            Reset
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setScaled(scale + 0.1)}
            disabled={scale >= SCALE_MAX}
          >
            +
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-2">
        <div
          ref={hostRef}
          className="overflow-hidden rounded-xl"
          style={{
            contentVisibility: "auto",
            height: hostHeightCss,
          }}
        >
          {!mounted ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-sm text-muted-foreground">
                Sheet will load when visible{manualEnabled ? "…" : " (or click “Load sheet”)"}.
              </div>
            </div>
          ) : (
            <div className="h-full w-full overflow-hidden">
              <div
                style={{
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                  width: `calc(100% / ${scale})`,
                  willChange: "transform",
                }}
              >
                {!loaded && (
                  <div className="min-h-[72px] text-xs text-muted-foreground flex items-center justify-center">
                    Loading…
                  </div>
                )}
                <iframe
                  src={src}
                  title={title || "Live sheet"}
                  loading="lazy"
                  className="w-full"
                  style={{
                    height: SHEET_LAYOUT_HEIGHT_CSS,
                    border: 0,
                    display: "block",
                    opacity: loaded ? 1 : 0,
                    transition: "opacity 200ms ease",
                  }}
                  onLoad={() => setLoaded(true)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

