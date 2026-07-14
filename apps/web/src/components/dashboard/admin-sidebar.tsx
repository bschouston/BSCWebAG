"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import {
  Calendar,
  LayoutDashboard,
  Settings,
  ClipboardList,
  Newspaper,
  Trophy,
  TabletSmartphone,
  FileText,
  ChevronDown,
  Archive,
  List,
} from "lucide-react";

const flatItems: Array<{
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  exact?: boolean;
}> = [
  { href: "/admin", icon: LayoutDashboard, label: "Overview", exact: true },
  { href: "/admin/events", icon: Calendar, label: "Manage Events" },
  { href: "/admin/news", icon: Newspaper, label: "Manage News" },
  { href: "/admin/rsvps", icon: ClipboardList, label: "Manage Registrations" },
  { href: "/admin/settings", icon: Settings, label: "Settings" },
];

type TournamentNav = {
  id: string;
  name: string;
  status: string;
};

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavButton({
  href,
  label,
  icon: Icon,
  active,
  size = "default",
  className,
}: {
  href: string;
  label: string;
  icon?: typeof Trophy;
  active: boolean;
  size?: "default" | "sm";
  className?: string;
}) {
  return (
    <Link href={href}>
      <Button
        variant={active ? "secondary" : "ghost"}
        size={size}
        className={cn(
          "w-full justify-start",
          size === "sm" && "font-normal",
          active && "bg-sidebar-accent text-sidebar-accent-foreground",
          className
        )}
      >
        {Icon ? <Icon className={cn("mr-2", size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} /> : null}
        <span className="truncate">{label}</span>
      </Button>
    </Link>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState<TournamentNav[]>([]);
  const [sectionOpen, setSectionOpen] = useState(true);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [expandedTournamentId, setExpandedTournamentId] = useState<string | null>(null);

  const activeTournaments = useMemo(
    () => tournaments.filter((t) => t.status === "ACTIVE"),
    [tournaments]
  );
  const archivedTournaments = useMemo(
    () => tournaments.filter((t) => t.status === "ARCHIVED"),
    [tournaments]
  );

  const pathTournamentId = useMemo(() => {
    const m = pathname.match(/^\/admin\/tournaments\/([^/]+)/);
    if (!m) return null;
    if (m[1] === "new") return null;
    return m[1];
  }, [pathname]);

  const tournamentsSectionActive =
    pathname.startsWith("/admin/tournaments") ||
    pathname.startsWith("/admin/registration-forms") ||
    pathname.startsWith("/admin/trackers") ||
    pathname.startsWith("/admin/tracker-logs");

  useEffect(() => {
    if (tournamentsSectionActive) setSectionOpen(true);
  }, [tournamentsSectionActive]);

  useEffect(() => {
    if (pathTournamentId) {
      setExpandedTournamentId(pathTournamentId);
      const archived = archivedTournaments.some((t) => t.id === pathTournamentId);
      if (archived) setArchiveOpen(true);
    }
  }, [pathTournamentId, archivedTournaments]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    const load = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/tournaments", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!mounted || !res.ok) return;
        setTournaments(
          ((data.tournaments ?? []) as TournamentNav[]).map((t) => ({
            id: t.id,
            name: t.name,
            status: t.status,
          }))
        );
      } catch {
        // ignore
      }
    };
    void load();
    const onChanged = () => void load();
    window.addEventListener("bsc:tournaments-changed", onChanged);
    return () => {
      mounted = false;
      window.removeEventListener("bsc:tournaments-changed", onChanged);
    };
  }, [user]);

  const renderTournamentBranch = (t: TournamentNav) => {
    const base = `/admin/tournaments/${t.id}`;
    const open = expandedTournamentId === t.id || pathTournamentId === t.id;
    const selfActive = isActive(pathname, base);

    return (
      <div key={t.id} className="space-y-0.5">
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 px-0"
            onClick={() =>
              setExpandedTournamentId((prev) => (prev === t.id ? null : t.id))
            }
            aria-label={open ? "Collapse tournament" : "Expand tournament"}
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 opacity-70 transition-transform", open && "rotate-180")}
            />
          </Button>
          <div className="min-w-0 flex-1">
            <NavButton
              href={`${base}/players`}
              label={t.name}
              active={selfActive}
              size="sm"
            />
          </div>
        </div>
        {open ? (
          <div className="ml-6 pl-2 border-l space-y-0.5">
            <NavButton
              href={`${base}/tracker-activity`}
              label="Tracker Activity"
              active={isActive(pathname, `${base}/tracker-activity`)}
              size="sm"
            />
            <NavButton
              href={`${base}/registrations`}
              label="Registrations"
              active={isActive(pathname, `${base}/registrations`)}
              size="sm"
            />
            <NavButton
              href="/admin/trackers"
              label="Tracker Logins"
              active={isActive(pathname, "/admin/trackers")}
              size="sm"
            />
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="w-64 border-r bg-sidebar h-full flex flex-col overflow-y-auto">
      <div className="p-6">
        <h2 className="text-lg font-bold tracking-tight text-destructive">Admin Zone</h2>
      </div>
      <nav className="flex-1 px-4 space-y-1 pb-6">
        {flatItems.slice(0, 1).map((item) => (
          <NavButton
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={isActive(pathname, item.href, item.exact)}
          />
        ))}

        <div className="pt-1">
          <Button
            type="button"
            variant={tournamentsSectionActive ? "secondary" : "ghost"}
            className={cn(
              "w-full justify-start",
              tournamentsSectionActive && "bg-sidebar-accent/60 text-sidebar-accent-foreground"
            )}
            onClick={() => setSectionOpen((v) => !v)}
          >
            <Trophy className="mr-2 h-4 w-4" />
            <span className="flex-1 text-left">Tournaments</span>
            <ChevronDown
              className={cn("h-4 w-4 opacity-70 transition-transform", sectionOpen && "rotate-180")}
            />
          </Button>

          {sectionOpen ? (
            <div className="mt-1 ml-2 pl-2 border-l space-y-1">
              <NavButton
                href="/admin/tournaments"
                label="All tournaments"
                icon={List}
                active={pathname === "/admin/tournaments" || pathname === "/admin/tournaments/new"}
                size="sm"
              />

              {activeTournaments.length === 0 ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">No active tournaments</p>
              ) : (
                activeTournaments.map(renderTournamentBranch)
              )}

              <NavButton
                href="/admin/registration-forms"
                label="Registration Forms"
                icon={FileText}
                active={isActive(pathname, "/admin/registration-forms")}
                size="sm"
              />
              <NavButton
                href="/admin/trackers"
                label="Tracker Logins"
                icon={TabletSmartphone}
                active={isActive(pathname, "/admin/trackers")}
                size="sm"
              />

              <div className="pt-1">
                <Button
                  type="button"
                  variant={archiveOpen || archivedTournaments.some((t) => t.id === pathTournamentId) ? "secondary" : "ghost"}
                  size="sm"
                  className="w-full justify-start font-normal"
                  onClick={() => setArchiveOpen((v) => !v)}
                >
                  <Archive className="mr-2 h-3.5 w-3.5" />
                  <span className="flex-1 text-left">Tournaments Archive</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 opacity-70 transition-transform",
                      archiveOpen && "rotate-180"
                    )}
                  />
                </Button>
                {archiveOpen ? (
                  <div className="mt-1 ml-3 pl-2 border-l space-y-0.5">
                    {archivedTournaments.length === 0 ? (
                      <p className="px-2 py-1 text-xs text-muted-foreground">No archived tournaments</p>
                    ) : (
                      archivedTournaments.map(renderTournamentBranch)
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {flatItems.slice(1).map((item) => (
          <NavButton
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={isActive(pathname, item.href)}
          />
        ))}
      </nav>
    </div>
  );
}
