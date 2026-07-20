"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Settings, Trophy, X } from "lucide-react";
import { Button, cn } from "@bsc/ui";
import { profileCanManageTrackerSports, useAuth } from "@/lib/auth-context";

type SidebarSport = { sport: string; name: string };
type SidebarTournament = { id: string; name: string };

function NavLinks({
  tournaments,
  sports,
  showSports,
  onNavigate,
}: {
  tournaments: SidebarTournament[];
  sports: SidebarSport[];
  showSports: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      <div className="px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        All Tournaments
      </div>
      {tournaments.map((t) => {
        const href = `/tournaments/${t.id}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={t.id}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <Trophy className="h-4 w-4 shrink-0" />
            <span className="truncate">{t.name}</span>
          </Link>
        );
      })}

      {showSports ? (
        <>
          <div className="mt-4 px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Sports
          </div>
          <Link
            href="/settings"
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
              pathname === "/settings"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <Settings className="h-4 w-4" />
            All trackers
          </Link>
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
        </>
      ) : null}
    </nav>
  );
}

/** App shell with tournaments + sports sidebar (drawer on small screens). */
export function TrackerShell({ children }: { children: React.ReactNode }) {
  const { signOut, user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [sports, setSports] = useState<SidebarSport[]>([]);
  const [tournaments, setTournaments] = useState<SidebarTournament[]>([]);
  const showSports = profileCanManageTrackerSports(profile);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const headers = { Authorization: `Bearer ${token}` };
        const tournamentsRes = await fetch("/api/tournaments", { headers });
        const tournamentsData = await tournamentsRes.json().catch(() => ({}));
        if (!cancelled && tournamentsRes.ok) {
          const list = (tournamentsData.tournaments ?? []) as {
            id: string;
            name?: string;
          }[];
          setTournaments(
            list.map((t) => ({ id: t.id, name: t.name?.trim() || "Untitled tournament" }))
          );
        }

        if (!showSports) {
          setSports([]);
          return;
        }

        const res = await fetch("/api/sport-trackers", { headers });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const trackers = (data.trackers ?? []) as { sport: string; name: string }[];
        const unique = [...new Map(trackers.map((t) => [t.sport, t])).values()];
        setSports(unique.map((t) => ({ sport: t.sport, name: t.name })));
      } catch {
        // Sidebar stays empty; pages still load.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, showSports]);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="hidden md:flex flex-col border-r bg-card/40 p-4 gap-4 sticky top-0 h-screen">
        <div className="text-lg font-extrabold tracking-tight px-3">BSC Tracker</div>
        <NavLinks tournaments={tournaments} sports={sports} showSports={showSports} />
        <div className="mt-auto">
          <Button variant="outline" className="w-full" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </aside>

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
          <NavLinks
            tournaments={tournaments}
            sports={sports}
            showSports={showSports}
            onNavigate={() => setOpen(false)}
          />
          <Button variant="outline" className="w-full mt-6" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      )}

      <div className="min-w-0">{children}</div>
    </div>
  );
}
