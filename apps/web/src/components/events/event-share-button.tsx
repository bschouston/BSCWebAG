"use client";

import { useState } from "react";
import { Check, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Icon control that copies the current event page URL (without hash). */
export function EventShareButton({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn(
        "h-[2.125rem] w-[2.125rem] shrink-0 rounded-full disabled:bg-muted disabled:text-foreground disabled:opacity-100",
        className
      )}
      aria-label={copied ? "Link copied" : "Share event link"}
      title={copied ? "Link copied" : "Copy link to this event"}
      onClick={async () => {
        const url =
          typeof window !== "undefined"
            ? `${window.location.origin}${window.location.pathname}`
            : "";
        if (!url) return;
        const ok = await copyText(url);
        if (!ok) return;
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Share className="h-4 w-4" />}
    </Button>
  );
}
