"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Settings, Trophy, X } from "lucide-react";
import { statTrackers } from "@bsc/shared";
import { Button, cn } from "@bsc/ui";
import { useAuth } from "@/lib/auth-context";

const sports = [...new Map(statTrackers.map((t) => [t.sport, t])).values()];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      <Link
        href="/"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
          pathname === "/" || pathname.startsWith("/tournaments")
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        )}
      >
        <Trophy className="h-4 w-4" />
        Tournaments
      </Link>

      <div className="mt-4 px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Sports
      </div>
      {sports.map((s) => {
        const href = `/settings/${s.sport}`;
        return (
          <Link
            key={s.sport}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
              pathname === href
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <Settings className="h-4 w-4" />
            {s.name}
          </Link>
        );
      })}
    </nav>
  );
}

/** App shell with a sports sidebar (drawer on small screens). */
export function TrackerShell({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col border-r bg-card/40 p-4 gap-4 sticky top-0 h-screen">
        <div className="text-lg font-extrabold tracking-tight px-3">BSC Tracker</div>
        <NavLinks />
        <div className="mt-auto">
          <Button variant="outline" className="w-full" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between border-b bg-background/95 backdrop-blur px-3 py-2">
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="text-sm font-extrabold tracking-tight">BSC Tracker</div>
        <div className="w-9" />
      </div>
      {open && (
        <div className="md:hidden fixed inset-0 z-50 bg-background/95 backdrop-blur-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-lg font-extrabold tracking-tight">BSC Tracker</div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </Button>
          </div>
          <NavLinks onNavigate={() => setOpen(false)} />
          <Button variant="outline" className="w-full mt-6" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      )}

      <div className="min-w-0">{children}</div>
    </div>
  );
}
